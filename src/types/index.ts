export interface Propiedad {
  id: string;
  tipo: "Venta" | "Alquiler";
  ubicacion: string;
  direccion: string;
  ambientes: number;
  precio: number;
  moneda: "ARS" | "USD";
  superficie: number;
  descripcion: string;
  fotos: string[];
  disponible: boolean;
}

export interface WebhookMessage {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
    };
    messageType?: string;
    messageTimestamp?: number;
  };
}

export interface ClaudeResponse {
  texto: string;
  propiedadIds: string[];
}
