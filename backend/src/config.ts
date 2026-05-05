import "dotenv/config";
import path from "node:path";
import fs from "node:fs";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");
const excelsDir = path.join(dataDir, "excels");
fs.mkdirSync(excelsDir, { recursive: true });

const isProduction = process.env.NODE_ENV === "production";

const secureCookies =
  process.env.SECURE_COOKIES === "false"
    ? false
    : process.env.SECURE_COOKIES === "true"
      ? true
      : isProduction;

export const config = {
  port: Number(process.env.PORT ?? 3001),
  appPassword: required("APP_PASSWORD"),
  sessionSecret: required("SESSION_SECRET"),
  isProduction,
  secureCookies,
  dataDir,
  excelsDir,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
  devFrontendOrigin:
    process.env.DEV_FRONTEND_ORIGIN ?? "http://localhost:5173",
};
