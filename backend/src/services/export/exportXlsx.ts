import * as XLSX from "xlsx";
import type { ProjectionEnvelope } from "../projection/buildProjection.js";
import type { ObraProjectionRow } from "../projection/projectObras.js";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const SEGMENT_LABEL: Record<string, string> = {
  SOLE: "—",
  TOTAL: "Total",
  RENTA: "Renta",
  PRESTAMO: "Préstamo",
};

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}

export interface ExportOptions {
  obrasRows: ObraProjectionRow[];
  /** 0..12. Define qué columnas mensuales aparecen en la hoja "Obras". */
  currentMonth: number;
}

export function buildExportXlsx(
  env: ProjectionEnvelope,
  opts: ExportOptions,
): Buffer {
  const wb = XLSX.utils.book_new();

  // Hoja 1 — Resumen consolidado
  const resumenAOA: (string | number)[][] = [
    ["Proyección de gastos — Vialidad Provincia de Buenos Aires"],
    [`Año target: ${env.params.targetYear}`],
    [`Años base: ${env.params.baseYears.join(", ")}`],
    [`Mes actual: ${env.params.currentMonth} (${MONTH_NAMES[env.params.currentMonth - 1] ?? "—"})`],
    [],
    ["Crédito Definitivo", env.consolidated.creditoDefinitivo],
    ["Gastado YTD", env.consolidated.gastadoYTD],
    ["Saldo", env.consolidated.saldo],
    ["Plan restante (Σ futuro)", env.consolidated.plan.slice(env.params.currentMonth).reduce((a, b) => a + b, 0)],
    ["Esperado restante (Σ futuro)", env.consolidated.esperado.slice(env.params.currentMonth).reduce((a, b) => a + b, 0)],
    ["Margen (Saldo − Esperado futuro)", env.consolidated.margenEsperado],
    ["Tasa ejec. Plan", fmtPct(env.consolidated.tasaEjecucionPlan)],
    ["Tasa ejec. Esperado", fmtPct(env.consolidated.tasaEjecucionEsperado)],
    [],
    ["Mensual consolidado:"],
    ["", ...MONTH_NAMES],
    ["Plan", ...env.consolidated.plan],
    ["Esperado", ...env.consolidated.esperado],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenAOA);
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  // Hoja 2 — Detalle Plan por programa × mes
  const planAOA: (string | number)[][] = [
    ["Programa", "Segmento", "Crédito Definitivo", "Gastado YTD", "Saldo", ...MONTH_NAMES, "Σ Plan"],
  ];
  for (const p of env.perProgram) {
    const sumPlan = p.plan.reduce((a, b) => a + b, 0);
    planAOA.push([
      p.programName,
      SEGMENT_LABEL[p.segment] ?? p.segment,
      p.creditoDefinitivo,
      p.gastadoYTD,
      p.saldo,
      ...p.plan,
      sumPlan,
    ]);
  }
  const wsPlan = XLSX.utils.aoa_to_sheet(planAOA);
  XLSX.utils.book_append_sheet(wb, wsPlan, "Plan");

  // Hoja 3 — Detalle Esperado por programa × mes
  const espAOA: (string | number)[][] = [
    ["Programa", "Segmento", "Crédito Definitivo", "Saldo", ...MONTH_NAMES, "Σ Esperado", "Margen (Saldo−Esp.)"],
  ];
  for (const p of env.perProgram) {
    const sumEsp = p.esperado.reduce((a, b) => a + b, 0);
    espAOA.push([
      p.programName,
      SEGMENT_LABEL[p.segment] ?? p.segment,
      p.creditoDefinitivo,
      p.saldo,
      ...p.esperado,
      sumEsp,
      p.margenEsperado,
    ]);
  }
  const wsEsp = XLSX.utils.aoa_to_sheet(espAOA);
  XLSX.utils.book_append_sheet(wb, wsEsp, "Esperado");

  // Hoja 4 — Real (datos reales del año target)
  const realAOA: (string | number)[][] = [
    ["Programa", "Segmento", "Crédito Original", "Crédito Definitivo", ...MONTH_NAMES, "Gastado YTD"],
  ];
  for (const p of env.perProgram) {
    realAOA.push([
      p.programName,
      SEGMENT_LABEL[p.segment] ?? p.segment,
      p.creditoOriginal ?? "",
      p.creditoDefinitivo,
      ...p.realByMonth,
      p.gastadoYTD,
    ]);
  }
  const wsReal = XLSX.utils.aoa_to_sheet(realAOA);
  XLSX.utils.book_append_sheet(wb, wsReal, "Real");

  // Hoja 5 — Obras (proyección configurable mes a mes sobre saldo remanente)
  const futureMonthHeaders = MONTH_NAMES.slice(opts.currentMonth).map(
    (n) => `${n} proy.`,
  );
  const obrasAOA: (string | number)[][] = [
    [
      "Programa",
      "Segmento",
      "Expediente",
      "PRY",
      "CUOV",
      "Concepto",
      "Crédito Definitivo",
      "Gastado YTD",
      "Saldo Actual",
      "Descuento %",
      "Saldo Proyectable",
      ...futureMonthHeaders,
      "Total Proyectado",
      "Saldo Final",
    ],
  ];
  for (const o of opts.obrasRows) {
    obrasAOA.push([
      o.programName,
      SEGMENT_LABEL[o.segment] ?? o.segment,
      o.expediente ?? "",
      o.pry ?? "",
      o.cuov ?? "",
      o.concepto,
      o.creditoDefinitivo,
      o.gastadoYTD,
      o.saldoActual,
      o.descuentoPct,
      o.saldoProyectable,
      ...o.proyMonths.slice(opts.currentMonth),
      o.totalProyectado,
      o.saldoFinal,
    ]);
  }
  const wsObras = XLSX.utils.aoa_to_sheet(obrasAOA);
  XLSX.utils.book_append_sheet(wb, wsObras, "Obras");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return out as Buffer;
}
