import { config } from "../config.js";

const baseUrl = `${config.evolutionApiUrl}/message/sendText/${config.evolutionInstance}`;
const mediaUrl = `${config.evolutionApiUrl}/message/sendMedia/${config.evolutionInstance}`;

const headers = {
  "Content-Type": "application/json",
  apikey: config.evolutionApiKey,
};

export async function enviarMensaje(
  numero: string,
  texto: string
): Promise<void> {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      number: numero,
      text: texto,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Evolution] Error enviando mensaje: ${res.status} ${body}`);
  }
}

export async function enviarImagen(
  numero: string,
  urlImagen: string,
  caption?: string
): Promise<void> {
  const res = await fetch(mediaUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      number: numero,
      mediatype: "image",
      media: urlImagen,
      caption: caption || "",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Evolution] Error enviando imagen: ${res.status} ${body}`);
  }
}

export async function enviarMultiplesImagenes(
  numero: string,
  urls: string[],
  caption?: string
): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    await enviarImagen(numero, urls[i], i === 0 ? caption : undefined);
    // Pequeña pausa entre imágenes para evitar rate limiting
    if (i < urls.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
