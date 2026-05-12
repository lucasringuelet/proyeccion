import type { Segment } from "../parser/types.js";
import { prisma } from "../../db.js";

export interface ObraProjectionRow {
  programSlug: string;
  programName: string;
  programOrder: number;
  segment: Segment;
  rowIdx: number;
  expediente: string | null;
  pry: string | null;
  cuov: string | null;
  concepto: string;
  creditoDefinitivo: number;
  gastadoYTD: number;
  saldoActual: number;
  /** % de descuento aplicado al saldo de la fuente antes de proyectar (0..100). */
  descuentoPct: number;
  /** Saldo efectivamente proyectable de la obra = saldoActual × (1 − descuentoPct/100). */
  saldoProyectable: number;
  /** length 12, índice 0-based. Meses pasados (< currentMonth) siempre 0. */
  proyMonths: number[];
  totalProyectado: number;
  saldoFinal: number;
}

export interface ProjectObrasArgs {
  targetYear: number;
  /** 0..12. 0 = sin mes cerrado, todos los meses son futuros. 12 = año cerrado. */
  currentMonth: number;
  /** Mismo formato que ProjectionParams.segmentSelection. */
  segmentSelection: Record<string, Segment[]>;
  /**
   * key = `${programSlug}__${segment}` (con segment = SOLE/RENTA/PRESTAMO, no TOTAL).
   * value = arreglo de 12 porcentajes (0..100+). Los meses pasados se ignoran.
   * Si la entrada falta, se asume 0% en todos los meses.
   */
  pctMatrix?: Record<string, number[]>;
  /**
   * % de descuento opcional por fuente (0..100). Reduce el saldo base de cada
   * obra de esa fuente antes del decay mensual.
   * key = `${programSlug}__${segment}`.
   */
  descuentoPctByFuente?: Record<string, number>;
}

const SEGMENT_ORDER: Record<Segment, number> = {
  RENTA: 0,
  PRESTAMO: 1,
  SOLE: 2,
  TOTAL: 3,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Para FAMILIA2: si el usuario seleccionó TOTAL, igual operamos sobre los
 * segmentos reales (RENTA/PRESTAMO) porque las obras viven ahí, no en TOTAL.
 */
function expandSelectedSegments(selected: Segment[]): Set<Segment> {
  const out = new Set<Segment>();
  for (const s of selected) {
    if (s === "TOTAL") {
      out.add("RENTA");
      out.add("PRESTAMO");
    } else {
      out.add(s);
    }
  }
  return out;
}

export async function projectObras(
  args: ProjectObrasArgs,
): Promise<ObraProjectionRow[]> {
  const {
    targetYear,
    currentMonth,
    segmentSelection,
    pctMatrix,
    descuentoPctByFuente,
  } = args;

  const programs = await prisma.program.findMany({ orderBy: { order: "asc" } });
  const programByslug = new Map(programs.map((p) => [p.slug, p]));

  const file = await prisma.excelFile.findFirst({
    where: { year: targetYear },
    orderBy: { uploadedAt: "desc" },
    include: { yearData: { include: { obras: true } } },
  });
  if (!file) return [];

  const rows: ObraProjectionRow[] = [];

  for (const yd of file.yearData) {
    const program = programByslug.get(yd.programSlug);
    if (!program) continue;

    const selectedRaw = segmentSelection[yd.programSlug] ?? [];
    const selected = expandSelectedSegments(selectedRaw);
    if (!selected.has(yd.segment as Segment)) continue;

    const fuenteKey = `${yd.programSlug}__${yd.segment}`;
    const pctRow = pctMatrix?.[fuenteKey];
    const descuentoPctRaw = descuentoPctByFuente?.[fuenteKey] ?? 0;
    const descuentoPct = Math.min(100, Math.max(0, Number.isFinite(descuentoPctRaw) ? descuentoPctRaw : 0));
    const descuentoFactor = 1 - descuentoPct / 100;

    for (const obra of yd.obras) {
      const proyMonths = new Array<number>(12).fill(0);
      const saldoProyectable = Math.max(0, obra.saldos * descuentoFactor);
      let remaining = saldoProyectable;

      for (let m = currentMonth + 1; m <= 12; m++) {
        const pctRaw = pctRow?.[m - 1] ?? 0;
        const pct = clamp01(pctRaw / 100);
        const gasto = Math.min(saldoProyectable * pct, remaining);
        proyMonths[m - 1] = gasto;
        remaining = Math.max(0, remaining - gasto);
      }

      const totalProyectado = proyMonths.reduce((a, b) => a + b, 0);
      const saldoFinal = obra.saldos - totalProyectado;

      rows.push({
        programSlug: yd.programSlug,
        programName: program.name,
        programOrder: program.order,
        segment: yd.segment as Segment,
        rowIdx: obra.rowIdx,
        expediente: obra.expediente,
        pry: obra.pry,
        cuov: obra.cuov,
        concepto: obra.concepto,
        creditoDefinitivo: obra.creditoDefinitivo,
        gastadoYTD: obra.gastadoAcumulado,
        saldoActual: obra.saldos,
        descuentoPct,
        saldoProyectable,
        proyMonths,
        totalProyectado,
        saldoFinal,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.programOrder !== b.programOrder) return a.programOrder - b.programOrder;
    const sa = SEGMENT_ORDER[a.segment] ?? 99;
    const sb = SEGMENT_ORDER[b.segment] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.rowIdx - b.rowIdx;
  });

  return rows;
}
