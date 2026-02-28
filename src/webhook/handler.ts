import type { Context } from "hono";
import type { WebhookMessage } from "../types/index.js";
import { obtenerPropiedades } from "../services/sheets.js";
import { procesarConsulta } from "../services/claude.js";
import {
  enviarMensaje,
  enviarMultiplesImagenes,
  descargarMedia,
} from "../services/evolution.js";
import { transcribirAudio } from "../services/transcription.js";
import { buscarPorIds } from "../services/properties.js";

const WAIT_SECONDS = 15;

// Buffer de mensajes por número
const messageBuffer = new Map<
  string,
  { messages: string[]; nombre: string; timer: ReturnType<typeof setTimeout> }
>();

function extraerTexto(data: WebhookMessage["data"]): string | null {
  return (
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    null
  );
}

function esAudio(data: WebhookMessage["data"]): boolean {
  return data.messageType === "audioMessage" || !!data.message?.audioMessage;
}

function extraerNumero(remoteJid: string): string {
  return remoteJid.replace("@s.whatsapp.net", "");
}

function agregarAlBuffer(numero: string, nombre: string, texto: string): void {
  const existing = messageBuffer.get(numero);

  if (existing) {
    existing.messages.push(texto);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => procesarBuffer(numero), WAIT_SECONDS * 1000);
    console.log(
      `[Buffer] Acumulando mensaje #${existing.messages.length} de ${numero} (esperando ${WAIT_SECONDS}s)`
    );
  } else {
    const timer = setTimeout(() => procesarBuffer(numero), WAIT_SECONDS * 1000);
    messageBuffer.set(numero, { messages: [texto], nombre, timer });
    console.log(
      `[Buffer] Nuevo buffer para ${numero} (esperando ${WAIT_SECONDS}s)`
    );
  }
}

async function procesarBuffer(numero: string): Promise<void> {
  const buffer = messageBuffer.get(numero);
  if (!buffer || buffer.messages.length === 0) return;

  const mensajeCompleto = buffer.messages.join("\n");
  const nombre = buffer.nombre;

  // Limpiar buffer antes de procesar
  messageBuffer.delete(numero);

  console.log(
    `[Buffer] Procesando ${buffer.messages.length} mensaje(s) de ${nombre} (${numero}): ${mensajeCompleto}`
  );

  try {
    const propiedades = await obtenerPropiedades();
    const respuesta = await procesarConsulta(mensajeCompleto, propiedades, numero);

    await enviarMensaje(numero, respuesta.texto);

    console.log(`[Buffer] propiedadIds:`, respuesta.propiedadIds);

    if (respuesta.propiedadIds.length > 0) {
      const propsConFotos = buscarPorIds(
        propiedades,
        respuesta.propiedadIds.slice(0, 2)
      );

      for (const prop of propsConFotos) {
        if (prop.fotos.length > 0) {
          await enviarMultiplesImagenes(
            numero,
            prop.fotos.slice(0, 3),
            [
              `${prop.tipo} - ${prop.ubicacion}`,
              prop.ambientes > 0 ? `${prop.ambientes} amb` : "",
              prop.precio > 0 ? `${prop.moneda} ${prop.precio.toLocaleString("es-AR")}` : "",
            ].filter(Boolean).join(" | ")
          );
        }
      }
    }

    console.log(`[Buffer] Respuesta enviada a ${numero}`);
  } catch (error) {
    console.error("[Buffer] Error procesando mensajes:", error);

    try {
      await enviarMensaje(
        numero,
        "Disculpá, estoy teniendo un problema técnico. Por favor intentá de nuevo en unos minutos o contactanos directamente."
      );
    } catch {
      // Si ni siquiera podemos enviar el error, loguear y seguir
    }
  }
}

export async function handleWebhook(c: Context): Promise<Response> {
  let body: WebhookMessage;
  try {
    body = await c.req.json<WebhookMessage>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (body.event !== "messages.upsert") {
    return c.json({ status: "ignored", reason: "not a message event" });
  }

  const { data } = body;

  if (data.key.fromMe) {
    return c.json({ status: "ignored", reason: "own message" });
  }

  if (data.key.remoteJid.includes("@g.us")) {
    return c.json({ status: "ignored", reason: "group message" });
  }

  const numero = extraerNumero(data.key.remoteJid);
  const nombre = data.pushName || "Cliente";

  // Audio message → descargar + transcribir + agregar al buffer
  if (esAudio(data)) {
    console.log(`[Webhook] Audio de ${nombre} (${numero})`);

    // Descargar el audio desde Evolution API
    const media = await descargarMedia(data.key);
    if (!media) {
      console.warn(`[Webhook] No se pudo descargar audio de ${numero}`);
      return c.json({ status: "error", reason: "audio download failed" });
    }

    // Transcribir con Whisper
    const transcripcion = await transcribirAudio(media.base64, media.mimetype);
    if (!transcripcion) {
      console.warn(`[Webhook] No se pudo transcribir audio de ${numero}`);
      return c.json({ status: "error", reason: "transcription failed" });
    }

    agregarAlBuffer(numero, nombre, transcripcion);
    return c.json({ status: "buffered", type: "audio" });
  }

  // Text message
  const texto = extraerTexto(data);
  if (!texto) {
    return c.json({ status: "ignored", reason: "no text content" });
  }

  console.log(`[Webhook] Mensaje de ${nombre} (${numero}): ${texto}`);
  agregarAlBuffer(numero, nombre, texto);

  return c.json({ status: "buffered", type: "text" });
}
