import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  buildProjection,
  type ProjectionParams,
} from "../services/projection/buildProjection.js";

export const programDetailRouter = Router();

const SegmentEnum = z.enum(["SOLE", "TOTAL", "RENTA", "PRESTAMO"]);

const Body = z.object({
  targetYear: z.number().int().min(2000).max(2100),
  baseYears: z.array(z.number().int().min(2000).max(2100)).min(1),
  currentMonth: z.number().int().min(0).max(12),
  segmentSelection: z.record(z.string(), z.array(SegmentEnum)),
  // El programa+segmento que queremos detallar
  programSlug: z.string().min(1),
  segment: SegmentEnum,
});

const MONTHS_FIELDS = [
  "m01", "m02", "m03", "m04", "m05", "m06",
  "m07", "m08", "m09", "m10", "m11", "m12",
] as const;

programDetailRouter.post("/", async (req, res, next) => {
  try {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body inválido" });
      return;
    }

    const params: ProjectionParams = {
      targetYear: parsed.data.targetYear,
      baseYears: parsed.data.baseYears,
      currentMonth: parsed.data.currentMonth,
      segmentSelection: parsed.data.segmentSelection,
    };

    const env = await buildProjection(params);
    const perProg = env.perProgram.find(
      (p) =>
        p.programSlug === parsed.data.programSlug &&
        p.segment === parsed.data.segment,
    );
    if (!perProg) {
      res.status(404).json({
        error:
          "No se encontró el programa-segmento en la proyección. Verificá la configuración.",
      });
      return;
    }

    // Obras del segmento elegido en el año target
    // (Si segment="TOTAL", traemos las obras de RENTA + PRESTAMO concatenadas)
    const targetFile = await prisma.excelFile.findFirst({
      where: { year: parsed.data.targetYear },
      orderBy: { uploadedAt: "desc" },
    });
    let obras: Array<{
      rowIdx: number;
      expediente: string | null;
      montoAdjudicacion: number | null;
      pry: string | null;
      cuov: string | null;
      concepto: string;
      creditoOriginal: number | null;
      creditoDefinitivo: number;
      gastadoAcumulado: number;
      saldos: number;
      months: number[];
      segmentSource: string;
    }> = [];
    if (targetFile) {
      const segmentsToFetch =
        parsed.data.segment === "TOTAL"
          ? ["RENTA", "PRESTAMO"]
          : [parsed.data.segment];
      const yearDatas = await prisma.programYearData.findMany({
        where: {
          excelFileId: targetFile.id,
          programSlug: parsed.data.programSlug,
          segment: { in: segmentsToFetch },
        },
        include: { obras: { orderBy: { rowIdx: "asc" } } },
      });
      for (const yd of yearDatas) {
        for (const o of yd.obras) {
          obras.push({
            rowIdx: o.rowIdx,
            expediente: o.expediente,
            montoAdjudicacion: o.montoAdjudicacion,
            pry: o.pry,
            cuov: o.cuov,
            concepto: o.concepto,
            creditoOriginal: o.creditoOriginal,
            creditoDefinitivo: o.creditoDefinitivo,
            gastadoAcumulado: o.gastadoAcumulado,
            saldos: o.saldos,
            months: MONTHS_FIELDS.map((k) => o[k]),
            segmentSource: yd.segment,
          });
        }
      }
    }

    // Histórico real por año base (para superponer en el chart)
    const historicalReal: { year: number; months: number[] }[] = [];
    for (const hYear of parsed.data.baseYears) {
      const hFile = await prisma.excelFile.findFirst({
        where: { year: hYear },
        orderBy: { uploadedAt: "desc" },
      });
      if (!hFile) continue;
      const hData = await prisma.programYearData.findFirst({
        where: {
          excelFileId: hFile.id,
          programSlug: parsed.data.programSlug,
          segment: parsed.data.segment,
        },
      });
      if (!hData) continue;
      historicalReal.push({
        year: hYear,
        months: MONTHS_FIELDS.map((k) => hData[k]),
      });
    }

    res.json({
      params,
      programSlug: perProg.programSlug,
      programName: perProg.programName,
      family: perProg.family,
      segment: perProg.segment,
      summary: {
        creditoOriginal: perProg.creditoOriginal,
        creditoDefinitivo: perProg.creditoDefinitivo,
        gastadoYTD: perProg.gastadoYTD,
        saldo: perProg.saldo,
        margenEsperado: perProg.margenEsperado,
        tasaEjecucionPlan: perProg.tasaEjecucionPlan,
        tasaEjecucionEsperado: perProg.tasaEjecucionEsperado,
        historyYearsUsed: perProg.historyYearsUsed,
      },
      monthly: {
        real: perProg.realByMonth,
        plan: perProg.plan,
        esperado: perProg.esperado,
        historicalProfile: perProg.historicalProfile,
      },
      historicalReal,
      obras,
    });
  } catch (err) {
    next(err);
  }
});
