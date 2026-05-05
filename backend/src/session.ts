import type { SessionOptions } from "iron-session";
import { config } from "./config.js";

export type AppSession = {
  authenticated?: boolean;
  loggedInAt?: number;
};

export const sessionOptions: SessionOptions = {
  cookieName: "vialidad_session",
  password: config.sessionSecret.padEnd(32, "0").slice(0, 64),
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: 60 * 60 * 12, // 12 horas
  },
};
