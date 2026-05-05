import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

export type Family = "FAMILIA1" | "FAMILIA2";
export type Segment = "SOLE" | "TOTAL" | "RENTA" | "PRESTAMO";

export interface Program {
  slug: string;
  name: string;
  family: Family;
  order: number;
}

export interface ExcelFileRow {
  id: string;
  year: number;
  originalName: string;
  sha256: string;
  sizeBytes: number;
  uploadedAt: string;
  status: "OK" | "WARNING" | "ERROR";
  notes: string | null;
}

export interface ParseWarning {
  programSlug?: string;
  segment?: Segment;
  level: "info" | "warning" | "error";
  message: string;
}

export interface FileAudit {
  id: string;
  year: number;
  originalName: string;
  uploadedAt: string;
  status: string;
  parserAudit: {
    warnings: ParseWarning[];
    unmappedSheets: string[];
    programs: Array<{
      programSlug: string;
      matchedSheet: string;
      warnings: string[];
      blocks: Array<{
        segment: Segment;
        source: {
          sheet: string;
          headerRow: number;
          totalRow: number;
          columns: {
            creditoOriginal: number | null;
            creditoDefinitivo: number;
            gastadoAcumulado: number | null;
            saldos: number | null;
            months: number[];
          };
        };
      }>;
    }>;
  };
  extractions: Array<{
    programSlug: string;
    programName: string;
    family: Family;
    segment: Segment;
    creditoOriginal: number | null;
    creditoDefinitivo: number;
    gastadoAcumulado: number;
    saldos: number;
    months: number[];
    source: {
      sheet: string;
      headerRow: number;
      totalRow: number;
      columns: Record<string, number | number[] | null>;
    };
  }>;
}

export interface ProjectionParams {
  targetYear: number;
  baseYears: number[];
  currentMonth: number;
  segmentSelection: Record<string, Segment[]>;
}

export interface HistoricalRealYear {
  year: number;
  months: number[];
  creditoDefinitivo?: number;
}

export interface ProjectionResultPerProgram {
  programSlug: string;
  programName: string;
  family: Family;
  segment: Segment;
  creditoDefinitivo: number;
  creditoOriginal: number | null;
  realByMonth: number[];
  historyYearsUsed: number[];
  historicalProfile: number[];
  plan: number[];
  esperado: number[];
  margenEsperado: number;
  saldo: number;
  gastadoYTD: number;
  tasaEjecucionPlan: number;
  tasaEjecucionEsperado: number;
  historicalReal: HistoricalRealYear[];
}

export interface ProjectionEnvelope {
  params: ProjectionParams;
  perProgram: ProjectionResultPerProgram[];
  consolidated: {
    plan: number[];
    esperado: number[];
    gastadoYTD: number;
    saldo: number;
    margenEsperado: number;
    creditoDefinitivo: number;
    tasaEjecucionPlan: number;
    tasaEjecucionEsperado: number;
    tasaEjecucionHistorica: number;
    historicalReal: HistoricalRealYear[];
  };
  skipped: Array<{ programSlug: string; segment: Segment; reason: string }>;
}

export interface ObraDetail {
  id: string;
  programSlug: string;
  programName: string;
  family: Family;
  segment: Segment;
  pry: string | null;
  cuov: string | null;
  concepto: string;
  expediente: string | null;
  montoAdjudicacion: number | null;
  creditoOriginal: number | null;
  creditoDefinitivo: number;
  gastadoAcumulado: number;
  saldos: number;
  months: number[];
}

export interface ObrasListResponse {
  year: number;
  obras: ObraDetail[];
}

export interface ObraRow {
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
}

export interface ProgramDetailResponse {
  params: ProjectionParams;
  programSlug: string;
  programName: string;
  family: Family;
  segment: Segment;
  summary: {
    creditoOriginal: number | null;
    creditoDefinitivo: number;
    gastadoYTD: number;
    saldo: number;
    margenEsperado: number;
    tasaEjecucionPlan: number;
    tasaEjecucionEsperado: number;
    historyYearsUsed: number[];
  };
  monthly: {
    real: number[];
    plan: number[];
    esperado: number[];
    historicalProfile: number[];
  };
  historicalReal: Array<{ year: number; months: number[] }>;
  obras: ObraRow[];
}

