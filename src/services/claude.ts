import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { Propiedad, ClaudeResponse } from "../types/index.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `Sos un asistente inmobiliario virtual de Puyella Inmobiliaria (${config.webUrl}).
Tu trabajo es ayudar a personas que consultan por WhatsApp sobre propiedades en venta o alquiler.

Instrucciones:
- Respondé en español argentino, con un tono cordial y profesional.
- Cuando el usuario pregunte por propiedades, buscá en el listado disponible y recomendá las más relevantes.
- Incluí detalles clave: ubicación, ambientes, superficie, precio.
- Si hay propiedades que coinciden, indicá sus IDs para que el sistema envíe las fotos automáticamente.
- Cuando sea relevante, compartí el link de la web: ${config.webUrl}
- Si el usuario quiere coordinar una visita o tiene consultas más específicas, sugerí que se contacte con un agente de Puyella.
- Sé conciso. Los mensajes de WhatsApp deben ser breves y fáciles de leer.
- Si no hay propiedades que coincidan, decilo amablemente y sugerí alternativas o que amplíe la búsqueda.
- No inventes propiedades que no están en el listado.

IMPORTANTE: Tu respuesta DEBE ser un JSON válido con esta estructura exacta:
{
  "texto": "El mensaje de texto para enviar al usuario",
  "propiedadIds": ["id1", "id2"]
}

- "texto" es el mensaje de WhatsApp.
- "propiedadIds" es un array con los IDs de las propiedades relevantes cuyas fotos se deben enviar. Array vacío si no hay que enviar fotos.`;

function formatPropiedades(propiedades: Propiedad[]): string {
  if (propiedades.length === 0) {
    return "No hay propiedades disponibles en este momento.";
  }

  return propiedades
    .map(
      (p) =>
        `[${p.id}] ${p.tipo} - ${p.ubicacion} | ${p.ambientes} amb | ${p.superficie}m² | ${p.moneda} ${p.precio.toLocaleString("es-AR")} | ${p.descripcion}`
    )
    .join("\n");
}

export async function procesarConsulta(
  mensaje: string,
  propiedades: Propiedad[]
): Promise<ClaudeResponse> {
  const listado = formatPropiedades(propiedades);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Propiedades disponibles:\n${listado}\n\n---\nMensaje del cliente:\n${mensaje}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    return { texto: "Disculpá, no pude procesar tu consulta. ¿Podrías reformularla?", propiedadIds: [] };
  }

  try {
    const parsed = JSON.parse(content.text) as ClaudeResponse;
    return {
      texto: parsed.texto || "Disculpá, hubo un error procesando tu consulta.",
      propiedadIds: Array.isArray(parsed.propiedadIds) ? parsed.propiedadIds : [],
    };
  } catch {
    // Si Claude no devolvió JSON válido, usar el texto directamente
    return { texto: content.text, propiedadIds: [] };
  }
}
