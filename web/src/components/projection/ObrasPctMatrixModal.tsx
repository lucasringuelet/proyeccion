import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { Program, Segment } from "@/lib/api";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const SEGMENT_LABEL: Record<Segment, string> = {
  SOLE: "—",
  TOTAL: "Total",
  RENTA: "Renta",
  PRESTAMO: "Préstamo",
};

const SEGMENT_ORDER: Record<Segment, number> = {
  RENTA: 0,
  PRESTAMO: 1,
  SOLE: 2,
  TOTAL: 3,
};

export type ObrasPctMatrix = Record<string, number[]>;

interface FuenteRow {
  key: string;
  programName: string;
  programOrder: number;
  segment: Segment;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 0..12. Solo se editan los meses con índice >= currentMonth (0-based). */
  currentMonth: number;
  programs: Program[];
  segmentSelection: Record<string, Segment[]>;
  onSubmit: (matrix: ObrasPctMatrix) => void;
  submitting?: boolean;
}

function expandToReal(selected: Segment[]): Segment[] {
  const out = new Set<Segment>();
  for (const s of selected) {
    if (s === "TOTAL") {
      out.add("RENTA");
      out.add("PRESTAMO");
    } else {
      out.add(s);
    }
  }
  return Array.from(out);
}

function buildRows(
  programs: Program[],
  segmentSelection: Record<string, Segment[]>,
): FuenteRow[] {
  const rows: FuenteRow[] = [];
  for (const p of programs) {
    const sel = segmentSelection[p.slug] ?? (p.family === "FAMILIA1" ? ["SOLE"] : []);
    const segs = expandToReal(sel as Segment[]);
    for (const seg of segs) {
      rows.push({
        key: `${p.slug}__${seg}`,
        programName: p.name,
        programOrder: p.order,
        segment: seg,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.programOrder !== b.programOrder) return a.programOrder - b.programOrder;
    return SEGMENT_ORDER[a.segment] - SEGMENT_ORDER[b.segment];
  });
  return rows;
}

function emptyMatrix(rows: FuenteRow[]): ObrasPctMatrix {
  const m: ObrasPctMatrix = {};
  for (const r of rows) m[r.key] = new Array(12).fill(0);
  return m;
}

export function ObrasPctMatrixModal({
  open,
  onClose,
  currentMonth,
  programs,
  segmentSelection,
  onSubmit,
  submitting,
}: Props) {
  const rows = useMemo(
    () => buildRows(programs, segmentSelection),
    [programs, segmentSelection],
  );

  const [matrix, setMatrix] = useState<ObrasPctMatrix>(() => emptyMatrix(rows));

  useEffect(() => {
    setMatrix((prev) => {
      const next = emptyMatrix(rows);
      for (const r of rows) {
        if (prev[r.key]) next[r.key] = prev[r.key];
      }
      return next;
    });
  }, [rows]);

  const futureMonthIdx = useMemo(() => {
    const arr: number[] = [];
    for (let i = currentMonth; i < 12; i++) arr.push(i);
    return arr;
  }, [currentMonth]);

  function setCell(key: string, monthIdx: number, value: number) {
    setMatrix((prev) => {
      const row = prev[key]?.slice() ?? new Array(12).fill(0);
      row[monthIdx] = Number.isFinite(value) ? Math.max(0, value) : 0;
      return { ...prev, [key]: row };
    });
  }

  function fillRowUniform(key: string) {
    const raw = window.prompt(
      "Porcentaje uniforme para los meses futuros de esta fuente (%)",
      "10",
    );
    if (raw == null) return;
    const v = Number(raw.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return;
    setMatrix((prev) => {
      const row = prev[key]?.slice() ?? new Array(12).fill(0);
      for (const m of futureMonthIdx) row[m] = v;
      return { ...prev, [key]: row };
    });
  }

  function zeroRow(key: string) {
    setMatrix((prev) => ({ ...prev, [key]: new Array(12).fill(0) }));
  }

  function zeroAll() {
    setMatrix(emptyMatrix(rows));
  }

  const isYearClosed = currentMonth >= 12;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configurar proyección por obra"
      maxWidth="6xl"
      footer={
        <>
          <Button variant="ghost" onClick={zeroAll} disabled={submitting || isYearClosed}>
            Todo en cero
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => onSubmit(matrix)} disabled={submitting}>
            {submitting ? "Generando…" : "Exportar"}
          </Button>
        </>
      }
    >
      {isYearClosed ? (
        <div className="text-sm text-slate-700">
          El año está cerrado (mes actual = 12). No hay meses futuros que proyectar — la
          hoja "Obras" se generará sin columnas mensuales. Podés exportar igual.
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600 mb-4">
            Para cada fuente de financiamiento, definí qué porcentaje del{" "}
            <strong>saldo remanente</strong> consume la obra en cada mes futuro. El cálculo
            es decay: cada mes el % se aplica sobre lo que quedó tras el mes anterior.
            Valores &gt; 100% se saturan al 100%.
          </p>
          <div className="overflow-auto border border-slate-200 rounded-lg">
            <table className="text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="sticky left-0 bg-slate-50 px-3 py-2 font-medium border-r border-slate-200 min-w-[220px]">
                    Programa / Segmento
                  </th>
                  {futureMonthIdx.map((m) => (
                    <th key={m} className="px-2 py-2 font-medium text-center min-w-[80px]">
                      {MONTH_NAMES[m]}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium text-center min-w-[140px]">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-white px-3 py-2 border-r border-slate-200 font-medium text-slate-800 whitespace-nowrap">
                      {r.programName}
                      <span className="text-slate-400 ml-1">
                        / {SEGMENT_LABEL[r.segment]}
                      </span>
                    </td>
                    {futureMonthIdx.map((m) => (
                      <td key={m} className="px-1 py-1">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={matrix[r.key]?.[m] ?? 0}
                          onChange={(e) =>
                            setCell(r.key, m, Number(e.target.value))
                          }
                          className="h-8 w-full rounded border border-slate-300 px-2 text-sm tabular text-right focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-center whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => fillRowUniform(r.key)}
                      >
                        Uniforme
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => zeroRow(r.key)}
                      >
                        Cero
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={futureMonthIdx.length + 2}>
                      No hay fuentes de financiamiento seleccionadas. Configurá segmentos en la pantalla de Proyección.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
