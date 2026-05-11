import { Router } from "express";
import { z } from "zod";
import { buildProjection } from "../services/projection/buildProjection.js";
import { buildExportXlsx } from "../services/export/exportXlsx.js";
import { projectObras } from "../services/projection/projectObras.js";
import { audit } from "../services/audit.js";

export const projectionRouter = Router();

const SegmentEnum = z.enum(["SOLE", "TOTAL", "RENTA", "PRESTAMO"]);

const ProjectionBody = z.object({
  targetYear: z.number().int().min(2000).max(2100),
  baseYears: z.array(z.number().int().min(2000).max(2100)).min(1),
  currentMonth: z.number().int().min(0).max(12),
  segmentSelection: z.record(z.string(), z.array(SegmentEnum)),
});

const ExportBody = ProjectionBody.extend({
  obrasPctMatrix: z
    .record(z.string(), z.array(z.number().min(0).max(500)).length(12))
    .optional(),
  obrasDescuentoPct: z
    .record(z.string(), z.number().min(0).max(100))
    .optional(),
});

projectionRouter.post("/", async (req, res, next) => {
  try {
    const parsed = ProjectionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body inválido", details: parsed.error.flatten() });
      return;
    }
    const env = await buildProjection(parsed.data);
    res.json(env);
  } catch (err) {
    next(err);
  }
});

projectionRouter.post("/export", async (req, res, next) => {
  try {
    const parsed = ExportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body inválido" });
      return;
    }
    const { obrasPctMatrix, obrasDescuentoPct, ...projectionParams } = parsed.data;
    const env = await buildProjection(projectionParams);
    const obrasRows = await projectObras({
      targetYear: projectionParams.targetYear,
      currentMonth: projectionParams.currentMonth,
      segmentSelection: projectionParams.segmentSelection,
      pctMatrix: obrasPctMatrix,
      descuentoPctByFuente: obrasDescuentoPct,
    });
    const buf = buildExportXlsx(env, {
      obrasRows,
      currentMonth: projectionParams.currentMonth,
    });
    await audit("EXPORT", `Exportó proyección año ${projectionParams.targetYear}`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="proyeccion_${projectionParams.targetYear}.xlsx"`,
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});
