import OpenAI from "openai";
import { config } from "../config.js";
import type { Propiedad, ClaudeResponse } from "../types/index.js";

const client = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT = `Sos un asistente inmobiliario virtual de *Puyella Inmobiliaria*, una inmobiliaria ubicada en San Nicolás de los Arroyos, Buenos Aires, Argentina.
Web: ${config.webUrl}

Tu trabajo es ayudar a personas que consultan por WhatsApp sobre propiedades en venta o alquiler.

PERSONALIDAD:
- Respondé en español argentino, tono cordial, cálido y profesional.
- Sé conciso, los mensajes de WhatsApp deben ser cortos y claros.
- Usá formato WhatsApp: *negrita* para destacar, saltos de línea para separar propiedades.

CÓMO RESPONDER:
- Al recibir un saludo ("hola", "buenas", etc.), presentate brevemente y preguntá qué buscan (comprar/alquilar, tipo de propiedad, zona, ambientes).
- Cuando el usuario diga qué busca, filtrá las propiedades del listado que coincidan y mostralas de forma clara.
- NUNCA muestres datos con valor 0. Si ambientes es 0, no lo menciones. Si superficie es 0, no la menciones. Si precio es 0, decí "Consultanos por el precio".
- Interpretá la descripción para extraer info útil (ej: "Casa. 3 Cochera." significa Casa con 3 dormitorios y cochera).
- Si no hay propiedades que coincidan, decilo amablemente y sugerí que amplíen la búsqueda o consulten directamente.
- Para coordinar visitas o consultas específicas, sugerí contactar a Puyella directamente.
- NUNCA inventes propiedades que no están en el listado.
- Tenés acceso al historial de la conversación. Usalo para mantener el contexto y no repetir la presentación.

DATOS IMPORTANTES:
- La mayoría de las propiedades son de VENTA. Hay muy pocas de alquiler.
- Muchas propiedades no tienen precio cargado (aparece 0). No inventes precios.
- Algunas propiedades no tienen ambientes cargados (aparece 0). No digas "0 ambientes", simplemente omitilo.
- Algunas propiedades no tienen superficie cargada (aparece 0). No digas "0m²", simplemente omitilo.
- Las propiedades tipo "Terreno / Lote" no tienen ambientes, eso es normal.

REGLAS SOBRE FOTOS (MUY IMPORTANTE):
- Solo incluí IDs en "propiedadIds" cuando el usuario PIDA EXPLÍCITAMENTE ver fotos/imágenes de una propiedad.
- MÁXIMO 2 propiedades en "propiedadIds" por respuesta.
- En saludos, preguntas generales, o cuando listás opciones: "propiedadIds" VACÍO [].
- Primero describí las opciones, dejá que el usuario elija cuál quiere ver con fotos.
- Si el usuario pide fotos y ya hablaron de una propiedad específica, usá el ID de esa propiedad.

FORMATO DE RESPUESTA (obligatorio):
Respondé ÚNICAMENTE con un JSON válido, sin texto antes ni después:
{
  "texto": "El mensaje de WhatsApp",
  "propiedadIds": []
}`;

function formatPropiedades(propiedades: Propiedad[]): string {
  if (propiedades.length === 0) {
    return "No hay propiedades disponibles en este momento.";
  }

  return propiedades
    .map((p) => {
      const parts = [`[${p.id}] ${p.tipo} - ${p.ubicacion}`];
      if (p.ambientes > 0) parts.push(`${p.ambientes} amb`);
      if (p.superficie > 0) parts.push(`${p.superficie}m²`);
      if (p.precio > 0) parts.push(`${p.moneda} ${p.precio.toLocaleString("es-AR")}`);
      if (p.descripcion) parts.push(p.descripcion);
      return parts.join(" | ");
    })
    .join("\n");
}

// Historial de conversación por número (máximo 20 mensajes)
const conversationHistory = new Map<
  string,
  { role: "user" | "assistant"; content: string }[]
>();

const MAX_HISTORY = 20;
const HISTORY_TTL = 30 * 60 * 1000; // 30 minutos
const historyTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getHistory(numero: string) {
  return conversationHistory.get(numero) || [];
}

function addToHistory(
  numero: string,
  role: "user" | "assistant",
  content: string
) {
  let history = conversationHistory.get(numero);
  if (!history) {
    history = [];
    conversationHistory.set(numero, history);
  }

  history.push({ role, content });

  // Mantener máximo MAX_HISTORY mensajes
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  // Reiniciar timer de expiración
  const existing = historyTimers.get(numero);
  if (existing) clearTimeout(existing);
  historyTimers.set(
    numero,
    setTimeout(() => {
      conversationHistory.delete(numero);
      historyTimers.delete(numero);
    }, HISTORY_TTL)
  );
}

export async function procesarConsulta(
  mensaje: string,
  propiedades: Propiedad[],
  numero: string
): Promise<ClaudeResponse> {
  const listado = formatPropiedades(propiedades);

  // Agregar mensaje del usuario al historial
  addToHistory(numero, "user", mensaje);

  const history = getHistory(numero);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Propiedades disponibles:\n${listado}`,
      },
      // Historial de conversación
      ...history,
    ];

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    return {
      texto:
        "Disculpá, no pude procesar tu consulta. ¿Podrías reformularla?",
      propiedadIds: [],
    };
  }

  try {
    const parsed = JSON.parse(text) as ClaudeResponse;
    const resultado = {
      texto:
        parsed.texto || "Disculpá, hubo un error procesando tu consulta.",
      propiedadIds: Array.isArray(parsed.propiedadIds)
        ? parsed.propiedadIds.map(String)
        : [],
    };

    // Guardar respuesta en historial
    addToHistory(numero, "assistant", resultado.texto);

    return resultado;
  } catch {
    addToHistory(numero, "assistant", text);
    return { texto: text, propiedadIds: [] };
  }
}
