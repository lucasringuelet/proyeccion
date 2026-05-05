import type { Request, Response, NextFunction } from "express";
import { getIronSession, type IronSession } from "iron-session";
import { sessionOptions, type AppSession } from "../session.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await getIronSession<AppSession>(req, res, sessionOptions);
  if (!session.authenticated) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  next();
}

export async function getSession(
  req: Request,
  res: Response,
): Promise<IronSession<AppSession>> {
  return getIronSession<AppSession>(req, res, sessionOptions);
}
