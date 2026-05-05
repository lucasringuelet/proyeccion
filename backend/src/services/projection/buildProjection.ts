// Pipeline: lee datos persistidos en DB → arma input para el motor → corre proyección.

import type { Family, Segment } from "../parser/types.js";
import { prisma } from "../../db.js";
import {
  consolidate,
  project,
  type Months12,
  type ProjectionResult,
  type YearActuals,
} from "./projection.js";

export interface ProjectionParams {
  /** Año cuyo crédito se está proyectando. */
  targetYear: number;
  /** Años a usar como base histórica (idealmente cerrados). */
  baseYears: number[];
  /** 1..12. Hasta este mes el dato del target year se considera real. */
  currentMonth: number;
  /**
   * Por programa, qué segmentos suman al consolidado.
   * - Familia 1 admite ['SOLE'].
   * - Familia 2 admite ['RENTA','PRESTAMO'] o ['TOTAL'] (exclusivos).
   */
  segmentSelection: Record<string, Segment[]>;
}

export interface HistoricalRealYear {
  year: number;
  months: Months12;
  /** Suma de Crédito Definitivo en ese año a través de los programa-segmentos
   * incluidos. Permite calcular la tasa de ejecución histórica consolidada. */
  creditoDefinitivo: number;
}

export interface PerProgramSegmentResult extends ProjectionResult {
  programSlug: string;
  programName: string;
  family: Family;
  segment: Segment;
  creditoDefinitivo: number;
  creditoOriginal: number | null;
  realByMonth: Months12;
  /** Años históricos efectivamente usados (los que tenían datos para este programa+segment). */
  historyYearsUsed: number[];
  /** Datos reales mensuales de cada año base usado, para superponer en charts. */
  historicalReal: HistoricalRealYear[];
}

export interface ProjectionEnvelope {
  params: ProjectionParams;
  perProgram: PerProgramSegmentResult[];
  consolidated: {
    plan: Months12;
    esperado: Months12;
    gastadoYTD: number;
    saldo: number;
    margenEsperado: number;
    creditoDefinitivo: number;
    tasaEjecucionPlan: number;
    tasaEjecucionEsperado: number;
    /** Promedio entre años base de la tasa de ejecución total (Σreal/crédito). */
    tasaEjecucionHistorica: number;
    /** Real histórico consolidado: suma horizontal entre los programa-segmentos seleccionados, por año. */
    historicalReal: HistoricalRealYear[];
  };
  /** Programas que no se pudieron proyectar (sin data en target year, etc.). */
  skipped: Array<{ programSlug: string; segment: Segment; reason: string }>;
}

const MONTHS_FIELDS = [
  "m01", "m02", "m03", "m04", "m05", "m06",
  "m07", "m08", "m09", "m10", "m11", "m12",
] as const;

interface DbBlock {
  programSlug: string;
  segment: Segment;
  creditoOriginal: number | null;
  creditoDefinitivo: number;
  m01: number; m02: number; m03: number; m04: number;
  m05: number; m06: number; m07: number; m08: number;
  m09: number; m10: number; m11: number; m12: number;
}

function blockMonths(b: DbBlock): Months12 {
  return MONTHS_FIELDS.map((k) => b[k]);
}

/**
 * Para cada (year), levanta el snapshot más reciente del Excel de ese año
 * (por uploadedAt) y de ahí los bloques por programa+segmento.
 */
async function loadYearData(
  year: number,
): Promise<Map<string, Map<Segment, DbBlock>>> {
  const file = await prisma.excelFile.findFirst({
    where: { year },
    orderBy: { uploadedAt: "desc" },
    include: { yearData: true },
  });
  const map = new Map<string, Map<Segment, DbBlock>>();
  if (!file) return map;
  for (const d of file.yearData) {
    if (!map.has(d.programSlug)) map.set(d.programSlug, new Map());
    map.get(d.programSlug)!.set(d.segment as Segment, d as unknown as DbBlock);
  }
  return map;
}

export async function buildProjection(
  params: ProjectionParams,
): Promise<ProjectionEnvelope> {
  const programs = await prisma.program.findMany({ orderBy: { order: "asc" } });

  const targetData = await loadYearData(params.targetYear);
  const historyDataByYear = new Map<number, Map<string, Map<Segment, DbBlock>>>();
  for (const y of params.baseYears) {
    historyDataByYear.set(y, await loadYearData(y));
  }

  const perProgram: PerProgramSegmentResult[] = [];
  const skipped: ProjectionEnvelope["skipped"] = [];
  const partsForConsolidation: ProjectionResult[] = [];

  for (const prog of programs) {
    const requested = params.segmentSelection[prog.slug] ?? [];
    if (requested.length === 0) continue;
    // Validar exclusión Renta+Préstamo XOR Total
    if (
      requested.includes("TOTAL") &&
      (requested.includes("RENTA") || requested.includes("PRESTAMO"))
    ) {
      skipped.push({
        programSlug: prog.slug,
        segment: "TOTAL",
        reason:
          "Selección inválida: TOTAL y (RENTA/PRÉSTAMO) son mutuamente excluyentes.",
      });
      continue;
    }
    if (prog.family === "FAMILIA1" && !requested.includes("SOLE")) {
      // No es un programa con desglose; sólo SOLE tiene sentido. Si no lo eligen, lo saltamos.
      continue;
    }
    if (
      prog.family === "FAMILIA2" &&
      !requested.includes("RENTA") &&
      !requested.includes("PRESTAMO") &&
      !requested.includes("TOTAL")
    ) {
      continue;
    }

    for (const segment of requested) {
      if (segment === "SOLE" && prog.family !== "FAMILIA1") continue;
      if (segment !== "SOLE" && prog.family !== "FAMILIA2") continue;

      const targetBlock = targetData.get(prog.slug)?.get(segment);
      if (!targetBlock) {
        skipped.push({
          programSlug: prog.slug,
          segment,
          reason: `No hay datos para año ${params.targetYear}. ¿Subiste el Excel de ese año?`,
        });
        continue;
      }

      const history: YearActuals[] = [];
      const historyYearsUsed: number[] = [];
      for (const hYear of params.baseYears) {
        const hBlock = historyDataByYear.get(hYear)?.get(prog.slug)?.get(segment);
        if (!hBlock) continue;
        if (hBlock.creditoDefinitivo <= 0) continue;
        history.push({
          year: hYear,
          creditoDefinitivo: hBlock.creditoDefinitivo,
          monthlyActual: blockMonths(hBlock),
        });
        historyYearsUsed.push(hYear);
      }

      if (history.length === 0) {
        skipped.push({
          programSlug: prog.slug,
          segment,
          reason: "No hay año histórico con datos. Se requiere al menos uno.",
        });
        continue;
      }

      const realByMonth = blockMonths(targetBlock);
      const projection = project({
        history,
        current: {
          year: params.targetYear,
          creditoDefinitivo: targetBlock.creditoDefinitivo,
          monthlyActual: realByMonth,
        },
        currentMonth: params.currentMonth,
      });

      perProgram.push({
        ...projection,
        programSlug: prog.slug,
        programName: prog.name,
        family: prog.family as Family,
        segment,
        creditoDefinitivo: targetBlock.creditoDefinitivo,
        creditoOriginal: targetBlock.creditoOriginal,
        realByMonth,
        historyYearsUsed,
        historicalReal: history.map((h) => ({
          year: h.year,
          months: h.monthlyActual.slice(),
          creditoDefinitivo: h.creditoDefinitivo,
        })),
      });
      partsForConsolidation.push(projection);
    }
  }

  const cons = consolidate(partsForConsolidation);
  const totalCreditoDef = perProgram.reduce(
    (s, p) => s + p.creditoDefinitivo,
    0,
  );

  // Agregar Real histórico consolidado: para cada año base, sumar los reales
  // mes a mes y el crédito definitivo a través de los programa-segmentos
  // seleccionados.
  const histByYear = new Map<
    number,
    { months: number[]; creditoDefinitivo: number }
  >();
  for (const p of perProgram) {
    for (const h of p.historicalReal) {
      if (!histByYear.has(h.year)) {
        histByYear.set(h.year, {
          months: Array(12).fill(0),
          creditoDefinitivo: 0,
        });
      }
      const entry = histByYear.get(h.year)!;
      for (let i = 0; i < 12; i++) {
        entry.months[i] = (entry.months[i] ?? 0) + (h.months[i] ?? 0);
      }
      entry.creditoDefinitivo += h.creditoDefinitivo;
    }
  }
  const consolidatedHistorical: HistoricalRealYear[] = Array.from(
    histByYear.entries(),
  )
    .sort((a, b) => a[0] - b[0])
    .map(([year, entry]) => ({
      year,
      months: entry.months,
      creditoDefinitivo: entry.creditoDefinitivo,
    }));

  // Tasa de ejecución histórica consolidada = promedio entre años de
  // (Σ real / crédito definitivo) por año.
  const tasasPorAnio = consolidatedHistorical
    .map((h) => {
      const sumReal = h.months.reduce((a, b) => a + b, 0);
      return h.creditoDefinitivo > 0 ? sumReal / h.creditoDefinitivo : 0;
    })
    .filter((t) => t > 0);
  const tasaEjecucionHistorica =
    tasasPorAnio.length > 0
      ? tasasPorAnio.reduce((a, b) => a + b, 0) / tasasPorAnio.length
      : 0;

  const consolidated = {
    ...cons,
    creditoDefinitivo: totalCreditoDef,
    tasaEjecucionPlan:
      totalCreditoDef > 0
        ? cons.plan.reduce((a, b) => a + b, 0) / totalCreditoDef
        : 0,
    tasaEjecucionEsperado:
      totalCreditoDef > 0
        ? (cons.gastadoYTD +
            cons.esperado.slice(params.currentMonth).reduce((a, b) => a + b, 0)) /
          totalCreditoDef
        : 0,
    tasaEjecucionHistorica,
    historicalReal: consolidatedHistorical,
  };

  return { params, perProgram, consolidated, skipped };
}
