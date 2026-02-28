/**
 * Script para scrapear propiedades de www.puyella.com.ar
 * Genera un CSV listo para importar en Google Sheets.
 *
 * Uso: npx tsx scripts/scrape.ts
 */

const BASE = "http://www.puyella.com.ar";

interface PropiedadRaw {
  id: string;
  tipo: string;
  direccion: string;
  tipoPropiedad: string;
  dormitorios: string;
  superficie: string;
  cochera: boolean;
  descripcion: string;
  fotos: string[];
  ubicacionUrl: string;
}

// ── Paso 1: obtener códigos de propiedades del listado ──

async function obtenerCodigos(cat: number): Promise<string[]> {
  const res = await fetch(`${BASE}/sections/propiedades.php?cat=${cat}`);
  const html = await res.text();

  const codigos: string[] = [];
  const regex = /sec=propiedad&cod=(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (!codigos.includes(match[1])) {
      codigos.push(match[1]);
    }
  }
  return codigos;
}

// ── Paso 2: scrapear detalle de cada propiedad ──

async function scrapearPropiedad(
  cod: string,
  tipo: string
): Promise<PropiedadRaw | null> {
  try {
    const res = await fetch(`${BASE}/index.php?sec=propiedad&cod=${cod}`);
    const html = await res.text();

    // Dirección (título)
    const tituloMatch = html.match(/<h3 class="titulo">(.*?)<\/h3>/);
    const direccion = tituloMatch
      ? decodeEntities(tituloMatch[1].trim())
      : `Propiedad ${cod}`;

    // Tipo de propiedad (Casa, Departamento, etc.)
    const tipoPropMatch = html.match(/<h3 class="tipo">(.*?)<\/h3>/);
    const tipoPropiedad = tipoPropMatch ? tipoPropMatch[1].trim() : "";

    // Dormitorios
    const dormMatch = html.match(
      /<i class="fa fa-bed"[^>]*><\/i>\s*(\d+)/
    );
    const dormitorios = dormMatch ? dormMatch[1] : "0";

    // Superficie
    const supMatch = html.match(/(\d[\d.,]+)\s*m2/);
    const superficie = supMatch ? supMatch[1].replace(".", "") : "0";

    // Cochera
    const cochera = html.includes('fa-car');

    // Descripción (texto libre en div.desc)
    const descMatch = html.match(
      /<div class="desc">([\s\S]*?)<\/div>/
    );
    let descripcion = "";
    if (descMatch) {
      // Limpiar HTML tags y sacar solo texto después del div de iconos
      const descHtml = descMatch[1];
      // Sacar el div interno de iconos
      const afterIcons = descHtml.replace(/<div[^>]*>[\s\S]*?<\/div>/, "");
      descripcion = afterIcons
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Foto principal
    const fotos: string[] = [];
    const mainImgMatch = html.match(
      /imagen-principal[\s\S]*?src="(images\/propiedades\/[^"]+)"/
    );
    if (mainImgMatch) {
      fotos.push(`${BASE}/${mainImgMatch[1]}`);
    }

    // Galería de fotos
    const galeriaRegex = /src="(images\/propiedades\/\d+\/[^"]+)"/g;
    let fotoMatch: RegExpExecArray | null;
    while ((fotoMatch = galeriaRegex.exec(html)) !== null) {
      const url = `${BASE}/${fotoMatch[1]}`;
      if (!fotos.includes(url)) {
        fotos.push(url);
      }
    }

    // Link ubicación (Google Maps)
    const ubiMatch = html.match(
      /href="(https:\/\/goo\.gl\/maps\/[^"]+)"/
    );
    const ubicacionUrl = ubiMatch ? ubiMatch[1] : "";

    return {
      id: cod,
      tipo,
      direccion,
      tipoPropiedad,
      dormitorios,
      superficie,
      cochera,
      descripcion,
      fotos,
      ubicacionUrl,
    };
  } catch (err) {
    console.error(`Error scrapeando cod=${cod}:`, err);
    return null;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&ordm;/g, "º")
    .replace(/&deg;/g, "°");
}

// ── Paso 3: escapar CSV ──

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── Main ──

async function main() {
  console.log("Scrapeando propiedades de puyella.com.ar...\n");

  // Obtener códigos
  const [codigosVenta, codigosAlquiler] = await Promise.all([
    obtenerCodigos(1),
    obtenerCodigos(2),
  ]);

  console.log(`Ventas: ${codigosVenta.length} propiedades`);
  console.log(`Alquileres: ${codigosAlquiler.length} propiedades\n`);

  // Scrapear detalle de cada una
  const propiedades: PropiedadRaw[] = [];

  for (const cod of codigosVenta) {
    process.stdout.write(`  Scrapeando venta cod=${cod}...`);
    const prop = await scrapearPropiedad(cod, "Venta");
    if (prop) {
      propiedades.push(prop);
      process.stdout.write(` OK (${prop.direccion})\n`);
    } else {
      process.stdout.write(` ERROR\n`);
    }
    // Pausa para no saturar el servidor
    await new Promise((r) => setTimeout(r, 300));
  }

  for (const cod of codigosAlquiler) {
    process.stdout.write(`  Scrapeando alquiler cod=${cod}...`);
    const prop = await scrapearPropiedad(cod, "Alquiler");
    if (prop) {
      propiedades.push(prop);
      process.stdout.write(` OK (${prop.direccion})\n`);
    } else {
      process.stdout.write(` ERROR\n`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nTotal scrapeadas: ${propiedades.length}\n`);

  // Generar CSV
  const header =
    "ID,Tipo,Ubicación,Dirección,Ambientes,Precio,Moneda,Superficie,Descripción,Fotos,Disponible";
  const rows = propiedades.map((p) => {
    const ubicacion = p.direccion; // Usamos dirección como ubicación también
    const ambientes = p.dormitorios;
    const precio = "0"; // La web no muestra precios
    const moneda = "ARS";
    const superficie = p.superficie;
    const desc = `${p.tipoPropiedad}. ${p.descripcion}${p.cochera ? " Cochera." : ""}`;
    const fotos = p.fotos.join(",");

    return [
      p.id,
      p.tipo,
      csvEscape(ubicacion),
      csvEscape(p.direccion),
      ambientes,
      precio,
      moneda,
      superficie,
      csvEscape(desc),
      csvEscape(fotos),
      "Sí",
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");

  // Guardar
  const outPath = "data/propiedades-web.csv";
  const fs = await import("fs");
  fs.writeFileSync(outPath, csv, "utf-8");
  console.log(`CSV guardado en ${outPath}`);
  console.log(`\nNOTA: Los precios están en 0 porque la web no los muestra.`);
  console.log(`Deberás completar los precios manualmente en el Google Sheet.`);
}

main().catch(console.error);
