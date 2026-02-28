import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { handleWebhook } from "./webhook/handler.js";
import { obtenerPropiedades, invalidarCache } from "./services/sheets.js";

const app = new Hono();

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Webhook de Evolution API
app.post("/webhook/messages", handleWebhook);

// Debug: ver propiedades cargadas (protegido con API key)
app.get("/properties", async (c) => {
  const apiKey = c.req.header("x-api-key");
  if (!config.webhookSecret || apiKey !== config.webhookSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const propiedades = await obtenerPropiedades();
  return c.json({ count: propiedades.length, propiedades });
});

// Forzar recarga de propiedades
app.post("/properties/reload", async (c) => {
  const apiKey = c.req.header("x-api-key");
  if (!config.webhookSecret || apiKey !== config.webhookSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  invalidarCache();
  const propiedades = await obtenerPropiedades();
  return c.json({
    status: "reloaded",
    count: propiedades.length,
  });
});

console.log(`Puyella Bot iniciando en puerto ${config.port}...`);

serve({
  fetch: app.fetch,
  port: config.port,
});

console.log(`Puyella Bot corriendo en http://localhost:${config.port}`);
