// Tipos compartidos del parser de Excel.

export type Family = "FAMILIA1" | "FAMILIA2";
export type Segment = "SOLE" | "TOTAL" | "RENTA" | "PRESTAMO";

export const MONTH_HEADERS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

export type MonthIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

// Valores por mes en pesos absolutos (12 entradas, ene..dic).
export type MonthlyArray = readonly number[]; // length 12

export interface ProgramDef {
  slug: string;
  name: string;
  family: Family;
  /** Regex strings que matchean el nombre exacto de la solapa en el Excel. */
  sheetAliases: string[];
}

/** Localización de un valor dentro del Excel para trazabilidad. */
export interface CellRef {
  sheet: string;
  row: number; // índice 0-based
  col: number; // índice 0-based
}

export interface BlockSource {
  sheet: string;
  headerRow: number;
  totalRow: number;
  columns: {
    creditoOriginal: number | null;
    creditoDefinitivo: number;
    gastadoAcumulado: number | null;
    saldos: number | null;
    months: number[]; // 12 índices de columna
  };
}

export interface ObraData {
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
}

export interface BlockData {
  segment: Segment;
  creditoOriginal: number | null;
  creditoDefinitivo: number;
  gastadoAcumulado: number;
  saldos: number;
  months: number[]; // 12 valores absolutos en pesos
  source: BlockSource;
  obras: ObraData[];
}

export interface ProgramExtraction {
  programSlug: string;
  family: Family;
  matchedSheet: string;
  blocks: BlockData[];
  warnings: string[];
}

export interface ParseWarning {
  programSlug?: string;
  segment?: Segment;
  level: "info" | "warning" | "error";
  message: string;
}

export interface ParseResult {
  year: number;
  programs: ProgramExtraction[];
  warnings: ParseWarning[];
  /** Solapas presentes en el archivo que no matchearon ningún programa. */
  unmappedSheets: string[];
}
