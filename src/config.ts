import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variable de entorno requerida: ${name}`);
  }
  return value;
}

export const config = {
  // Evolution API
  evolutionApiUrl: required("EVOLUTION_API_URL"),
  evolutionApiKey: required("EVOLUTION_API_KEY"),
  evolutionInstance: required("EVOLUTION_INSTANCE"),

  // OpenAI API
  openaiApiKey: required("OPENAI_API_KEY"),

  // Google Sheets
  googleSheetsId: required("GOOGLE_SHEETS_ID"),
  googleServiceAccountJson: required("GOOGLE_SERVICE_ACCOUNT_JSON"),

  // App
  port: parseInt(process.env.PORT || "3000", 10),
  webUrl: process.env.WEB_URL || "http://www.puyella.com.ar/index.php",
  webhookSecret: process.env.WEBHOOK_SECRET || "",
} as const;
