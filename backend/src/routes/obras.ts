import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const obrasRouter = Router();

const YearQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

const MONTHS_FIELDS = [
  "m01", "m02", "m03", "m04", "m05", "m06",
  "m07", "m08", "m09", "m10", "m11", "m12",
] as const;

obrasRouter.get("/", async (req, res, next) => {
  try {
    const parsed = YearQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Falta query param year" });
      return;
    }

    const file = await prisma.excelFile.findFirst({
      where: { year: parsed.data.year },
      orderBy: { uploadedAt: "desc" },
    });
    if (!file) {
      res.json({ year: parsed.data.year, obras: [] });
      return;
    }

    const yearDatas = await prisma.programYearData.findMany({
      where: { excelFileId: file.id },
      include: {
        obras: { orderBy: { rowIdx: "asc" } },
        program: true,
      },
    });

    const obras = yearDatas.flatMap((d) =>
      d.obras.map((o) => ({
        id: o.id,
        programSlug: d.programSlug,
        programName: d.program.name,
        family: d.program.family,
        segment: d.segment,
        pry: o.pry,
        cuov: o.cuov,
        concepto: o.concepto,
        expediente: o.expediente,
        montoAdjudicacion: o.montoAdjudicacion,
        creditoOriginal: o.creditoOriginal,
        creditoDefinitivo: o.creditoDefinitivo,
        gastadoAcumulado: o.gastadoAcumulado,
        saldos: o.saldos,
        months: MONTHS_FIELDS.map((k) => o[k]),
      })),
    );

    res.json({ year: parsed.data.year, obras });
  } catch (err) {
    next(err);
  }
});
