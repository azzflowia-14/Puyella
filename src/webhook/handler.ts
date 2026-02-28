import type { Context } from "hono";
import type { WebhookMessage } from "../types/index.js";
import { obtenerPropiedades } from "../services/sheets.js";
import { procesarConsulta } from "../services/claude.js";
import {
  enviarMensaje,
  enviarMultiplesImagenes,
} from "../services/evolution.js";
import { buscarPorIds } from "../services/properties.js";

function extraerTexto(data: WebhookMessage["data"]): string | null {
  return (
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    null
  );
}

function extraerNumero(remoteJid: string): string {
  // remoteJid viene como "5491112345678@s.whatsapp.net"
  return remoteJid.replace("@s.whatsapp.net", "");
}

export async function handleWebhook(c: Context): Promise<Response> {
  let body: WebhookMessage;
  try {
    body = await c.req.json<WebhookMessage>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Solo procesar mensajes de texto entrantes
  if (body.event !== "messages.upsert") {
    return c.json({ status: "ignored", reason: "not a message event" });
  }

  const { data } = body;

  // Ignorar mensajes propios (evitar loops)
  if (data.key.fromMe) {
    return c.json({ status: "ignored", reason: "own message" });
  }

  // Ignorar mensajes de grupos
  if (data.key.remoteJid.includes("@g.us")) {
    return c.json({ status: "ignored", reason: "group message" });
  }

  const texto = extraerTexto(data);
  if (!texto) {
    return c.json({ status: "ignored", reason: "no text content" });
  }

  const numero = extraerNumero(data.key.remoteJid);
  const nombre = data.pushName || "Cliente";

  console.log(`[Webhook] Mensaje de ${nombre} (${numero}): ${texto}`);

  try {
    // 1. Cargar propiedades (con cache)
    const propiedades = await obtenerPropiedades();

    // 2. Procesar consulta con Claude
    const respuesta = await procesarConsulta(texto, propiedades);

    // 3. Enviar respuesta de texto
    await enviarMensaje(numero, respuesta.texto);

    // 4. Si hay propiedades relevantes, enviar fotos
    if (respuesta.propiedadIds.length > 0) {
      const propsConFotos = buscarPorIds(propiedades, respuesta.propiedadIds);

      for (const prop of propsConFotos) {
        if (prop.fotos.length > 0) {
          await enviarMultiplesImagenes(
            numero,
            prop.fotos,
            `${prop.tipo} - ${prop.ubicacion} | ${prop.ambientes} amb | ${prop.moneda} ${prop.precio.toLocaleString("es-AR")}`
          );
        }
      }
    }

    console.log(`[Webhook] Respuesta enviada a ${numero}`);
    return c.json({ status: "ok" });
  } catch (error) {
    console.error("[Webhook] Error procesando mensaje:", error);

    // Intentar enviar mensaje de error al usuario
    try {
      await enviarMensaje(
        numero,
        "Disculpá, estoy teniendo un problema técnico. Por favor intentá de nuevo en unos minutos o contactanos directamente."
      );
    } catch {
      // Si ni siquiera podemos enviar el error, loguear y seguir
    }

    return c.json({ error: "Internal error" }, 500);
  }
}
