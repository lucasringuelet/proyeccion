import { Router } from "express";
import { prisma } from "../db.js";

export const programsRouter = Router();

programsRouter.get("/", async (_req, res) => {
  const programs = await prisma.program.findMany({ orderBy: { order: "asc" } });
  res.json(
    programs.map((p) => ({
      slug: p.slug,
      name: p.name,
      family: p.family,
      order: p.order,
    })),
  );
});
