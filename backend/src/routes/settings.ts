import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const settingsRouter = Router();

const KNOWN_KEYS = [
  "targetYear",
  "baseYears",
  "currentMonthOverride",
  "segmentSelection",
] as const;
type KnownKey = (typeof KNOWN_KEYS)[number];

function isKnownKey(k: string): k is KnownKey {
  return (KNOWN_KEYS as readonly string[]).includes(k);
}

settingsRouter.get("/", async (_req, res) => {
  const all = await prisma.setting.findMany();
  const out: Record<string, unknown> = {};
  for (const s of all) {
    try {
      out[s.key] = JSON.parse(s.value);
    } catch {
      out[s.key] = s.value;
    }
  }
  res.json(out);
});

const PutBody = z.object({
  key: z.string(),
  value: z.unknown(),
});

settingsRouter.put("/", async (req, res) => {
  const parsed = PutBody.safeParse(req.body);
  if (!parsed.success || !isKnownKey(parsed.data.key)) {
    res.status(400).json({ error: "Setting inválido" });
    return;
  }
  const { key, value } = parsed.data;
  const stringified = JSON.stringify(value);
  await prisma.setting.upsert({
    where: { key },
    update: { value: stringified },
    create: { key, value: stringified },
  });
  res.json({ ok: true });
});
