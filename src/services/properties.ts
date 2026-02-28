import type { Propiedad } from "../types/index.js";

export function buscarPorIds(
  propiedades: Propiedad[],
  ids: string[]
): Propiedad[] {
  return ids
    .map((id) => propiedades.find((p) => p.id === String(id)))
    .filter((p): p is Propiedad => p !== null && p !== undefined);
}

export function buscarPorTipo(
  propiedades: Propiedad[],
  tipo: "Venta" | "Alquiler"
): Propiedad[] {
  return propiedades.filter((p) => p.tipo === tipo);
}

export function buscarPorZona(
  propiedades: Propiedad[],
  zona: string
): Propiedad[] {
  const zonaNorm = zona.toLowerCase();
  return propiedades.filter(
    (p) =>
      p.ubicacion.toLowerCase().includes(zonaNorm) ||
      p.direccion.toLowerCase().includes(zonaNorm)
  );
}

export function buscarPorPrecioMax(
  propiedades: Propiedad[],
  maxPrecio: number,
  moneda: "ARS" | "USD"
): Propiedad[] {
  return propiedades.filter(
    (p) => p.moneda === moneda && p.precio <= maxPrecio
  );
}

export function buscarPorAmbientes(
  propiedades: Propiedad[],
  ambientes: number
): Propiedad[] {
  return propiedades.filter((p) => p.ambientes === ambientes);
}
