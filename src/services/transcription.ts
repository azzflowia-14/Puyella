import OpenAI from "openai";
import { config } from "../config.js";

const client = new OpenAI({ apiKey: config.openaiApiKey });

export async function transcribirAudio(
  base64Audio: string,
  mimetype: string
): Promise<string | null> {
  try {
    // Determinar extensión según mimetype
    const ext = mimetype.includes("ogg")
      ? "ogg"
      : mimetype.includes("mp4") || mimetype.includes("m4a")
        ? "m4a"
        : mimetype.includes("mpeg")
          ? "mp3"
          : "ogg"; // default para WhatsApp voice notes

    const buffer = Buffer.from(base64Audio, "base64");
    const file = new File([buffer], `audio.${ext}`, { type: mimetype });

    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
      language: "es",
    });

    const texto = transcription.text?.trim();
    if (!texto) return null;

    console.log(`[Whisper] Transcripción: ${texto}`);
    return texto;
  } catch (error) {
    console.error("[Whisper] Error transcribiendo audio:", error);
    return null;
  }
}
