import * as XLSX from "xlsx";
import type {
  BlockData,
  BlockSource,
  ObraData,
  ParseResult,
  ParseWarning,
  ProgramDef,
  ProgramExtraction,
  Segment,
} from "./types.js";
import { MONTH_HEADERS } from "./types.js";
import { PROGRAMS, findProgramBySheetName } from "./programMap.js";

// =============================================================================
// API pública
// =============================================================================

/** Detecta el año desde el filename: "RECURSOS Y EROGACIONES 2026 (2).xls" -> 2026 */
export function detectYearFromFilename(filename: string): number | null {
  const m = filename.match(/(20\d{2})/);
  return m ? Number(m[1]) : null;
}

export interface ParseOptions {
  /** Año a forzar (ignora detección por filename). */
  year?: number;
  filename?: string;
}

export function parseExcel(
  fileBuffer: Buffer,
  opts: ParseOptions = {},
): ParseResult {
  const wb = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });

  const warnings: ParseWarning[] = [];
  const programs: ProgramExtraction[] = [];
  const unmappedSheets: string[] = [];
  const seenPrograms = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const def = findProgramBySheetName(sheetName);
    if (!def) {
      unmappedSheets.push(sheetName);
      continue;
    }
    if (seenPrograms.has(def.slug)) {
      warnings.push({
        programSlug: def.slug,
        level: "warning",
        message: `Solapa duplicada para programa ${def.slug}: "${sheetName}". Se ignora.`,
      });
      continue;
    }

    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const grid = sheetToGrid(ws);
    try {
      const extraction = extractProgram(def, sheetName, grid, warnings);
      programs.push(extraction);
      seenPrograms.add(def.slug);
    } catch (err) {
      warnings.push({
        programSlug: def.slug,
        level: "error",
        message: `No se pudo extraer programa ${def.slug}: ${(err as Error).message}`,
      });
    }
  }

  // Detectar programas faltantes
  for (const def of PROGRAMS) {
    if (!seenPrograms.has(def.slug)) {
      warnings.push({
        programSlug: def.slug,
        level: "warning",
        message: `No se encontró solapa para el programa ${def.name}.`,
      });
    }
  }

  // Resolver año
  let year: number | null = opts.year ?? null;
  if (year == null && opts.filename) {
    year = detectYearFromFilename(opts.filename);
  }
  if (year == null) {
    // Como fallback, leer el header "CRÉDITO ORIGINAL PRESUPUESTO YYYY" del primer programa
    year = detectYearFromHeaders(programs);
  }
  if (year == null) {
    warnings.push({
      level: "error",
      message:
        "No se pudo detectar el año del archivo. Se requiere filename con el año o setting manual.",
    });
    year = new Date().getFullYear();
  }

  // Validaciones cruzadas
  for (const p of programs) {
    validateProgram(p, warnings);
  }

  return { year, programs, warnings, unmappedSheets };
}

// =============================================================================
// Internals
// =============================================================================

type Cell = string | number | null;
type Grid = Cell[][];

function sheetToGrid(ws: XLSX.WorkSheet): Grid {
  const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  const rowsMeta = (ws["!rows"] ?? []) as Array<{ hidden?: boolean } | undefined>;
  return arr.map((row, idx) => {
    if (rowsMeta[idx]?.hidden) return [];
    return (row ?? []).map((v) => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "number") return v;
      if (typeof v === "string") return v;
      return String(v);
    });
  }) as Grid;
}

function cellAsString(c: Cell): string {
  return c == null ? "" : String(c).trim();
}

function cellAsNumber(c: Cell): number {
  if (c == null || c === "") return 0;
  if (typeof c === "number") return c;
  const s = String(c).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Combining marks U+0300..U+036F
const DIACRITIC_RE = /[̀-ͯ]/g;

const norm = (s: string): string =>
  s
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .replace(/\s+/g, " ")
    .trim();

// -----------------------------------------------------------------------------
// Detección de bloques dentro de una solapa
// -----------------------------------------------------------------------------

interface HeaderRow {
  rowIdx: number;
  conceptoCol: number;
  creditoOriginalCol: number | null;
  creditoDefinitivoCol: number;
  gastadoAcumuladoCol: number | null;
  saldosCol: number | null;
  monthCols: number[]; // 12 índices, ene..dic
}

interface ObraMetaCols {
  expedienteCol: number | null;
  montoAdjCol: number | null;
  pryCol: number | null;
  cuovCol: number | null;
}

/**
 * Busca en TODA la solapa las celdas con los rótulos de las columnas
 * meta de obra (EX/EXPTE, MONTO ADJ, PRY/PROY, CUOV). Cada solapa tiene
 * un layout distinto (ej. CAF 11 tiene PRY y CUOV invertidos).
 */
function findObraMetaCols(grid: Grid): ObraMetaCols {
  let expedienteCol: number | null = null;
  let montoAdjCol: number | null = null;
  let pryCol: number | null = null;
  let cuovCol: number | null = null;

  for (let r = 0; r < grid.length && r < 30; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const v = norm(cellAsString(row[c] ?? null));
      if (!v) continue;
      if (
        expedienteCol == null &&
        (v === "ex" || v === "exp" || v === "expte" || v === "expediente")
      ) {
        expedienteCol = c;
      }
      if (
        montoAdjCol == null &&
        v.includes("monto") &&
        (v.includes("adj") || v.includes("adjudicacion"))
      ) {
        montoAdjCol = c;
      }
      if (
        pryCol == null &&
        (v === "pry" || v === "proy" || v === "proyecto")
      ) {
        pryCol = c;
      }
      if (cuovCol == null && v === "cuov") {
        cuovCol = c;
      }
    }
  }
  return { expedienteCol, montoAdjCol, pryCol, cuovCol };
}

/** Encuentra una fila válida que actúa como header (CONCEPTO, CRED.DEF., 12 meses). */
function findHeaderRows(grid: Grid): HeaderRow[] {
  const out: HeaderRow[] = [];
  const monthsSet = new Set(MONTH_HEADERS.map((m) => norm(m)));

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;

    let conceptoCol = -1;
    let creditoOriginalCol: number | null = null;
    let creditoDefinitivoCol = -1;
    let gastadoAcumuladoCol: number | null = null;
    let saldosCol: number | null = null;
    const monthFound = new Map<number, number>(); // monthIdx -> col

    for (let c = 0; c < row.length; c++) {
      const text = norm(cellAsString(row[c] ?? null));
      if (!text) continue;
      if (text === "concepto") conceptoCol = c;
      else if (
        text.includes("credito original") ||
        text.includes("credito original presupuesto")
      ) {
        creditoOriginalCol = c;
      } else if (
        text.includes("credito definitivo") ||
        text.includes("credito definitivo ejercicio")
      ) {
        creditoDefinitivoCol = c;
      } else if (text.includes("gastado acumulado")) {
        gastadoAcumuladoCol = c;
      } else if (text === "saldos" || text === "saldo") {
        saldosCol = c;
      } else if (monthsSet.has(text)) {
        const idx = MONTH_HEADERS.findIndex((m) => norm(m) === text);
        if (idx >= 0 && !monthFound.has(idx)) monthFound.set(idx, c);
      }
    }

    if (
      conceptoCol >= 0 &&
      creditoDefinitivoCol >= 0 &&
      monthFound.size === 12
    ) {
      const monthCols: number[] = [];
      for (let i = 0; i < 12; i++) {
        const col = monthFound.get(i);
        if (col === undefined) {
          monthCols.length = 0;
          break;
        }
        monthCols.push(col);
      }
      if (monthCols.length === 12) {
        out.push({
          rowIdx: r,
          conceptoCol,
          creditoOriginalCol,
          creditoDefinitivoCol,
          gastadoAcumuladoCol,
          saldosCol,
          monthCols,
        });
      }
    }
  }
  return out;
}

/** Decide qué segmento es una fila "Total P.P.X..." según el texto del concepto. */
function classifyTotalRow(concepto: string): Segment | null {
  const n = norm(concepto);
  if (!n.startsWith("total p.p")) return null;

  // ¿Es la fila Total agregada? (no menciona ni Rentas Generales ni nombre de préstamo)
  const hasRentas = /rentas?\s+general/.test(n);
  const hasPrestamo = /(bid|caf|fonplata|recursos|economia|prestamo|crédito\s+externo|credito\s+externo)/.test(n);

  if (!hasRentas && !hasPrestamo) return "TOTAL";
  if (hasRentas && !hasPrestamo) return "RENTA";
  if (!hasRentas && hasPrestamo) return "PRESTAMO";
  // Si menciona ambos, asumimos Préstamo (dominante en el rótulo).
  return "PRESTAMO";
}

/** Extrae todos los bloques (filas Total P.P.) que cuelgan de un header. */
function extractBlocksUnderHeader(
  grid: Grid,
  header: HeaderRow,
  nextHeaderRow: number,
  sheetName: string,
  meta: ObraMetaCols,
): { block: BlockData; rawSegment: Segment }[] {
  const out: { block: BlockData; rawSegment: Segment }[] = [];

  // Primer pase: encontrar todas las filas Total P.P. dentro del rango.
  const totalRows: { r: number; segment: Segment }[] = [];
  for (let r = header.rowIdx + 1; r < nextHeaderRow; r++) {
    const row = grid[r];
    if (!row) continue;
    const concepto = cellAsString(row[header.conceptoCol] ?? null);
    if (!concepto) continue;
    const seg = classifyTotalRow(concepto);
    if (seg == null) continue;
    totalRows.push({ r, segment: seg });
  }

  // Segundo pase: para cada Total P.P., construir el bloque + obras.
  for (let i = 0; i < totalRows.length; i++) {
    const { r, segment } = totalRows[i]!;
    const row = grid[r]!;

    const months: number[] = header.monthCols.map((c) =>
      cellAsNumber(row[c] ?? null),
    );
    const creditoDefinitivo = cellAsNumber(
      row[header.creditoDefinitivoCol] ?? null,
    );
    const creditoOriginal =
      header.creditoOriginalCol != null
        ? cellAsNumber(row[header.creditoOriginalCol] ?? null)
        : null;
    const gastadoAcumulado =
      header.gastadoAcumuladoCol != null
        ? cellAsNumber(row[header.gastadoAcumuladoCol] ?? null)
        : months.reduce((a, b) => a + b, 0);
    const saldos =
      header.saldosCol != null
        ? cellAsNumber(row[header.saldosCol] ?? null)
        : creditoDefinitivo - gastadoAcumulado;

    const source: BlockSource = {
      sheet: sheetName,
      headerRow: header.rowIdx,
      totalRow: r,
      columns: {
        creditoOriginal: header.creditoOriginalCol,
        creditoDefinitivo: header.creditoDefinitivoCol,
        gastadoAcumulado: header.gastadoAcumuladoCol,
        saldos: header.saldosCol,
        months: header.monthCols,
      },
    };

    // Las obras de este bloque están entre esta fila Total P.P. y la siguiente
    // (o el fin del rango).
    const obrasRangeEnd =
      i + 1 < totalRows.length ? totalRows[i + 1]!.r : nextHeaderRow;
    const obras = extractObras(grid, r + 1, obrasRangeEnd, header, meta);

    out.push({
      block: {
        segment,
        creditoOriginal,
        creditoDefinitivo,
        gastadoAcumulado,
        saldos,
        months,
        source,
        obras,
      },
      rawSegment: segment,
    });
  }

  return out;
}

function extractObras(
  grid: Grid,
  startRow: number,
  endRow: number,
  header: HeaderRow,
  meta: ObraMetaCols,
): ObraData[] {
  const out: ObraData[] = [];
  for (let r = startRow; r < endRow; r++) {
    const row = grid[r];
    if (!row) continue;

    const concepto = cellAsString(row[header.conceptoCol] ?? null);
    if (!concepto) continue;
    // Saltamos sub-headers que repiten labels en la columna concepto
    if (/^concepto$/i.test(concepto)) continue;
    if (classifyTotalRow(concepto)) continue;

    // PRY / CUOV: pueden venir como número o string
    const pryRaw =
      meta.pryCol != null ? cellAsString(row[meta.pryCol] ?? null) : "";
    const cuovRaw =
      meta.cuovCol != null ? cellAsString(row[meta.cuovCol] ?? null) : "";
    const expedienteRaw =
      meta.expedienteCol != null
        ? cellAsString(row[meta.expedienteCol] ?? null)
        : "";
    const montoAdjCell =
      meta.montoAdjCol != null ? row[meta.montoAdjCol] ?? null : null;

    // Filtrar filas que son sub-headers (contienen los labels mismos)
    const isLabelRow =
      /^(pry|proy|proyecto)$/i.test(pryRaw) ||
      /^cuov$/i.test(cuovRaw) ||
      /^(ex|exp|expte|expediente)$/i.test(expedienteRaw);
    if (isLabelRow) continue;

    // Una obra "real" tiene PRY o CUOV con contenido, o al menos un crédito > 0
    const creditoDefinitivo = cellAsNumber(
      row[header.creditoDefinitivoCol] ?? null,
    );
    const creditoOriginal =
      header.creditoOriginalCol != null
        ? cellAsNumber(row[header.creditoOriginalCol] ?? null)
        : null;

    const hasIdentifier = pryRaw !== "" || cuovRaw !== "";
    const hasCredit =
      (creditoOriginal ?? 0) > 0 || creditoDefinitivo > 0;
    if (!hasIdentifier && !hasCredit) continue;

    const months = header.monthCols.map((c) => cellAsNumber(row[c] ?? null));
    const gastadoAcumulado =
      header.gastadoAcumuladoCol != null
        ? cellAsNumber(row[header.gastadoAcumuladoCol] ?? null)
        : months.reduce((a, b) => a + b, 0);
    const saldos =
      header.saldosCol != null
        ? cellAsNumber(row[header.saldosCol] ?? null)
        : creditoDefinitivo - gastadoAcumulado;

    out.push({
      rowIdx: r,
      expediente: expedienteRaw || null,
      montoAdjudicacion: montoAdjCell != null ? montoAdjFromCell(montoAdjCell) : null,
      pry: pryRaw || null,
      cuov: cuovRaw || null,
      concepto,
      creditoOriginal,
      creditoDefinitivo,
      gastadoAcumulado,
      saldos,
      months,
    });
  }
  return out;
}

/** El monto adjudicación a veces viene como texto "Adj. Coarco $ 591.247.000,00". */
function montoAdjFromCell(c: Cell): number | null {
  if (c == null) return null;
  if (typeof c === "number") return c;
  const s = String(c);
  const match = s.match(/[\d\.]+(?:,\d+)?/g);
  if (!match || match.length === 0) return null;
  // Toma el número más grande (típicamente el monto principal)
  let best = 0;
  for (const m of match) {
    const n = Number(m.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best > 0 ? best : null;
}

function extractProgram(
  def: ProgramDef,
  sheetName: string,
  grid: Grid,
  warnings: ParseWarning[],
): ProgramExtraction {
  const headers = findHeaderRows(grid);
  if (headers.length === 0) {
    throw new Error(
      `No se encontraron headers (CONCEPTO + CRÉDITO DEFINITIVO + 12 meses) en "${sheetName}".`,
    );
  }

  const meta = findObraMetaCols(grid);

  // Recorrer cada header y juntar bloques
  const collected: BlockData[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    const nextRow = i + 1 < headers.length ? headers[i + 1]!.rowIdx : grid.length;
    const blocks = extractBlocksUnderHeader(grid, h, nextRow, sheetName, meta);
    for (const b of blocks) collected.push(b.block);
  }

  // Reglas según familia
  const localWarnings: string[] = [];
  if (def.family === "FAMILIA1") {
    // Esperamos 1 sólo bloque "TOTAL" → lo guardamos como SOLE
    const candidates = collected.filter((b) => b.segment === "TOTAL");
    if (candidates.length === 0) {
      throw new Error(
        `Familia 1 (${def.slug}): no se encontró fila "Total P.P.X" sin desglose.`,
      );
    }
    const block = candidates[0]!;
    block.segment = "SOLE";
    return {
      programSlug: def.slug,
      family: def.family,
      matchedSheet: sheetName,
      blocks: [block],
      warnings: localWarnings,
    };
  }

  // FAMILIA2: necesitamos al menos RENTA + PRESTAMO. TOTAL opcional.
  // Si hay múltiples del mismo segmento, tomamos el primero (con warning).
  const dedup = new Map<Segment, BlockData>();
  for (const b of collected) {
    if (!dedup.has(b.segment)) dedup.set(b.segment, b);
    else
      localWarnings.push(
        `Múltiples bloques ${b.segment} en "${sheetName}", se ignoran los extras.`,
      );
  }

  const renta = dedup.get("RENTA");
  const prestamo = dedup.get("PRESTAMO");
  let total = dedup.get("TOTAL");

  if (!renta || !prestamo) {
    // Algunas solapas (CAF) tienen sólo dos bloques sin un "TOTAL" explícito;
    // si vemos bloques RENTA y PRESTAMO está OK. Si falta alguno, error.
    const missing = [!renta && "RENTA", !prestamo && "PRESTAMO"]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Familia 2 (${def.slug}): faltan bloques [${missing}] en "${sheetName}".`,
    );
  }

  // Si no hay TOTAL explícito, derivamos uno sumando RENTA + PRESTAMO.
  if (!total) {
    total = sumBlocks(renta, prestamo, sheetName);
    localWarnings.push(
      `Sin fila "Total P.P." agregada — se derivó sumando Renta + Préstamo.`,
    );
  }

  return {
    programSlug: def.slug,
    family: def.family,
    matchedSheet: sheetName,
    blocks: [total, renta, prestamo],
    warnings: localWarnings,
  };
}

function sumBlocks(a: BlockData, b: BlockData, sheetName: string): BlockData {
  const months = a.months.map((v, i) => v + (b.months[i] ?? 0));
  return {
    segment: "TOTAL",
    creditoOriginal:
      a.creditoOriginal != null && b.creditoOriginal != null
        ? a.creditoOriginal + b.creditoOriginal
        : null,
    creditoDefinitivo: a.creditoDefinitivo + b.creditoDefinitivo,
    gastadoAcumulado: a.gastadoAcumulado + b.gastadoAcumulado,
    saldos: a.saldos + b.saldos,
    months,
    source: {
      sheet: sheetName,
      headerRow: -1,
      totalRow: -1,
      columns: a.source.columns,
    },
    obras: [], // el total agregado no tiene obras propias; las tienen Renta y Préstamo
  };
}

// -----------------------------------------------------------------------------
// Validaciones cruzadas
// -----------------------------------------------------------------------------

const MONEY_TOLERANCE = 1; // ±1 ARS

function approxEqual(a: number, b: number, tol = MONEY_TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

function validateProgram(p: ProgramExtraction, warnings: ParseWarning[]): void {
  if (p.family === "FAMILIA2") {
    const total = p.blocks.find((b) => b.segment === "TOTAL");
    const renta = p.blocks.find((b) => b.segment === "RENTA");
    const prestamo = p.blocks.find((b) => b.segment === "PRESTAMO");
    if (total && renta && prestamo) {
      const sum = renta.creditoDefinitivo + prestamo.creditoDefinitivo;
      if (!approxEqual(sum, total.creditoDefinitivo, 100)) {
        warnings.push({
          programSlug: p.programSlug,
          level: "warning",
          message: `Renta (${renta.creditoDefinitivo.toFixed(0)}) + Préstamo (${prestamo.creditoDefinitivo.toFixed(0)}) = ${sum.toFixed(0)} ≠ Total (${total.creditoDefinitivo.toFixed(0)}).`,
        });
      }
    }
  }

  for (const b of p.blocks) {
    const sumMonths = b.months.reduce((a, v) => a + v, 0);
    if (
      Number.isFinite(b.gastadoAcumulado) &&
      !approxEqual(sumMonths, b.gastadoAcumulado, 100)
    ) {
      warnings.push({
        programSlug: p.programSlug,
        segment: b.segment,
        level: "info",
        message: `Σ(meses)=${sumMonths.toFixed(0)} ≠ Gastado Acumulado=${b.gastadoAcumulado.toFixed(0)}.`,
      });
    }
    const expectedSaldo = b.creditoDefinitivo - b.gastadoAcumulado;
    if (
      Number.isFinite(b.saldos) &&
      !approxEqual(b.saldos, expectedSaldo, 100)
    ) {
      warnings.push({
        programSlug: p.programSlug,
        segment: b.segment,
        level: "info",
        message: `Saldos (${b.saldos.toFixed(0)}) ≠ CreditoDef - Gastado (${expectedSaldo.toFixed(0)}).`,
      });
    }
  }
}

// -----------------------------------------------------------------------------
// Detección de año desde headers (fallback)
// -----------------------------------------------------------------------------

function detectYearFromHeaders(programs: ProgramExtraction[]): number | null {
  // No tenemos los textos crudos del header acá; la detección por filename
  // es la primaria y llamamos a este fallback sólo si no hay filename.
  // Devuelvo null para forzar un warning explícito.
  void programs;
  return null;
}

// -----------------------------------------------------------------------------
// Detección del mes actual: último mes con valor > 0 en la fila TOTAL/SOLE
// del primer programa con datos (heurística simple).
// -----------------------------------------------------------------------------

export function detectCurrentMonth(result: ParseResult): number {
  for (const p of result.programs) {
    const block =
      p.blocks.find((b) => b.segment === "TOTAL") ??
      p.blocks.find((b) => b.segment === "SOLE");
    if (!block) continue;
    let last = 0;
    for (let i = 0; i < 12; i++) {
      if ((block.months[i] ?? 0) > 0) last = i + 1;
    }
    if (last > 0) return last;
  }
  return 0;
}
