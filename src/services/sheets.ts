import { google } from "googleapis";
import { config } from "../config.js";
import type { Propiedad } from "../types/index.js";

let cache: { data: Propiedad[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getAuth() {
  const credentials = JSON.parse(config.googleServiceAccountJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function parseRow(row: string[]): Propiedad | null {
  const [
    id,
    tipo,
    ubicacion,
    direccion,
    ambientes,
    precio,
    moneda,
    superficie,
    descripcion,
    fotos,
    disponible,
  ] = row;

  if (!id || !tipo) return null;

  const tipoNorm = tipo.trim().toLowerCase();
  if (tipoNorm !== "venta" && tipoNorm !== "alquiler") return null;

  return {
    id: id.trim(),
    tipo: tipoNorm === "venta" ? "Venta" : "Alquiler",
    ubicacion: ubicacion?.trim() || "",
    direccion: direccion?.trim() || "",
    ambientes: parseInt(ambientes || "0", 10) || 0,
    precio: parseFloat(precio || "0") || 0,
    moneda: (moneda?.trim().toUpperCase() === "USD" ? "USD" : "ARS") as
      | "ARS"
      | "USD",
    superficie: parseFloat(superficie || "0") || 0,
    descripcion: descripcion?.trim() || "",
    fotos: fotos
      ? fotos
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean)
      : [],
    disponible: disponible?.trim().toLowerCase() !== "no",
  };
}

export async function obtenerPropiedades(): Promise<Propiedad[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetsId,
    range: "A2:K", // Saltea header
  });

  const rows = response.data.values || [];
  const propiedades = rows
    .map((row) => parseRow(row as string[]))
    .filter((p): p is Propiedad => p !== null && p.disponible);

  cache = { data: propiedades, timestamp: Date.now() };
  console.log(`[Sheets] ${propiedades.length} propiedades cargadas`);

  return propiedades;
}

export function invalidarCache(): void {
  cache = null;
}
