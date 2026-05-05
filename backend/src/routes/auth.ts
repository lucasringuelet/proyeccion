import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { getSession } from "../middleware/requireAuth.js";
import { audit } from "../services/audit.js";

export const authRouter = Router();

const LoginBody = z.object({ password: z.string().min(1) });

authRouter.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Cuerpo inválido" });
    return;
  }
  if (parsed.data.password !== config.appPassword) {
    // Rate-limit naïve: pequeña pausa para mitigar guessing
    await new Promise((r) => setTimeout(r, 600));
    res.status(401).json({ error: "Clave incorrecta" });
    return;
  }
  const session = await getSession(req, res);
  session.authenticated = true;
  session.loggedInAt = Date.now();
  await session.save();
  await audit("LOGIN", "Inicio de sesión");
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  const session = await getSession(req, res);
  session.destroy();
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  const session = await getSession(req, res);
  res.json({ authenticated: !!session.authenticated });
});
