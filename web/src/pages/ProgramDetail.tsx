import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { ArrowLeft, Search, FileText } from "lucide-react";
import {
  api,
  type ExcelFileRow,
  type Program,
  type ProgramDetailResponse,
  type ProjectionParams,
  type Segment,
} from "@/lib/api";
import { cn, fmtMoney, fmtMoneyCompact, fmtPct, MONTHS_ES } from "@/lib/utils";

const SEGMENT_LABEL: Record<Segment, string> = {
  SOLE: "Sin desglose",
  TOTAL: "Total agregado",
  RENTA: "Renta Generales",
  PRESTAMO: "Préstamo",
};

interface SettingsRemote {
  targetYear?: number;
  baseYears?: number[];
  currentMonthOverride?: number | null;
  segmentSelection?: Record<string, Segment[]>;
}

function detectCurrentMonthFromFile(programs: { months: number[] }[]): number {
  let last = 0;
  for (const p of programs) {
    for (let i = 0; i < 12; i++) {
      if ((p.months[i] ?? 0) > 0 && i + 1 > last) last = i + 1;
    }
  }
  return last;
}

export default function ProgramDetail() {
  const { slug, segment } = useParams<{ slug: string; segment: Segment }>();

  const { data: programs = [] } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await api.get<Program[]>("/programs")).data,
  });
  const { data: files = [] } = useQuery({
    queryKey: ["files"],
    queryFn: async () => (await api.get<ExcelFileRow[]>("/files")).data,
  });
  const { data: settings = {} } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<SettingsRemote>("/settings")).data,
  });

  const availableYears = useMemo(
    () => Array.from(new Set(files.map((f) => f.year))).sort((a, b) => b - a),
    [files],
  );

  const params: ProjectionParams | null = useMemo(() => {
    if (programs.length === 0 || availableYears.length === 0) return null;
    const targetYear = settings.targetYear ?? availableYears[0]!;
    const baseYears =
      settings.baseYears && settings.baseYears.length > 0
        ? settings.baseYears
        : availableYears.filter((y) => y !== targetYear).slice(0, 2);
    const segmentSelection =
      settings.segmentSelection && Object.keys(settings.segmentSelection).length
        ? settings.segmentSelection
        : programs.reduce<Record<string, Segment[]>>((acc, p) => {
            acc[p.slug] = p.family === "FAMILIA1" ? ["SOLE"] : ["RENTA", "PRESTAMO"];
            return acc;
          }, {});
    return {
      targetYear,
      baseYears,
      currentMonth: settings.currentMonthOverride ?? 0,
      segmentSelection,
    };
  }, [programs, availableYears, settings]);

  const targetFile = useMemo(
    () => files.find((f) => f.year === params?.targetYear),
    [files, params?.targetYear],
  );
  const { data: targetAudit } = useQuery({
    queryKey: ["file-audit", targetFile?.id],
    queryFn: async () =>
      (await api.get(`/files/${targetFile!.id}/audit`)).data as {
        extractions: { months: number[] }[];
      },
    enabled: !!targetFile,
  });

  const finalParams: ProjectionParams | null = useMemo(() => {
    if (!params) return null;
    const auto = targetAudit ? detectCurrentMonthFromFile(targetAudit.extractions) : 0;
    const cm = settings.currentMonthOverride ?? auto;
    return { ...params, currentMonth: cm };
  }, [params, targetAudit, settings.currentMonthOverride]);

  // El segmento que viene en la URL puede no estar en la selección (ej. el
  // user clickea desde una card de SOLE pero después tira un endpoint con
  // selección distinta). Forzamos a que la consulta use ese segmento.
  const detailParams = useMemo(() => {
    if (!finalParams || !slug || !segment) return null;
    const enriched = { ...finalParams.segmentSelection };
    enriched[slug] = [segment];
    return {
      ...finalParams,
      segmentSelection: enriched,
      programSlug: slug,
      segment,
    };
  }, [finalParams, slug, segment]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["program-detail", detailParams],
    queryFn: async () =>
      (await api.post<ProgramDetailResponse>("/program-detail", detailParams!)).data,
    enabled: !!detailParams,
  });

  const [search, setSearch] = useState("");

  if (isLoading || !detailParams) {
    return <div className="text-slate-500">Cargando…</div>;
  }
  if (error) {
    return (
      <div>
        <Link to="/proyeccion" className="text-sm text-slate-500 hover:text-slate-700">
          ← Proyección
        </Link>
        <div className="text-red-600 mt-3">
          {(error as any)?.response?.data?.error ?? "Error cargando detalle"}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const cm = detailParams.currentMonth;
  const sumPlanFuturo = data.monthly.plan.slice(cm).reduce((a, b) => a + b, 0);
  const sumEsperadoFuturo = data.monthly.esperado.slice(cm).reduce((a, b) => a + b, 0);
  const tasaHist = data.monthly.historicalProfile.reduce((a, b) => a + b, 0);

  // Datos del chart: para cada mes mostramos Plan + Esperado + histórico real superpuesto
  const chartData = MONTHS_ES.map((m, i) => {
    const row: Record<string, number | string> = {
      mes: m,
      Plan: Math.round(data.monthly.plan[i] ?? 0),
      Esperado: Math.round(data.monthly.esperado[i] ?? 0),
    };
    for (const h of data.historicalReal) {
      row[`Real ${h.year}`] = Math.round(h.months[i] ?? 0);
    }
    return row;
  });

  // Filtrar obras por búsqueda
  const filteredObras = data.obras.filter((o) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      o.concepto?.toLowerCase().includes(s) ||
      o.pry?.toLowerCase().includes(s) ||
      o.cuov?.toLowerCase().includes(s) ||
      o.expediente?.toLowerCase().includes(s)
    );
  });

  const totalAdjudicado = data.obras.reduce(
    (a, o) => a + (o.montoAdjudicacion ?? 0),
    0,
  );

  const HISTORICAL_COLORS = ["#94a3b8", "#cbd5e1"];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/proyeccion"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Proyección
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {data.programName}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              <Badge tone="info" className="mr-2">
                {SEGMENT_LABEL[data.segment]}
              </Badge>
              Año {detailParams.targetYear} · base{" "}
              {detailParams.baseYears.join(" + ")} · {data.obras.length} obra
              {data.obras.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {/* === KPIs === */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Tile
          label="Crédito original"
          value={fmtMoneyCompact(data.summary.creditoOriginal)}
          tooltip={
            <>
              <strong>Presupuesto inicial</strong> sancionado por la legislatura
              al comienzo del ejercicio. Sirve como referencia; lo que importa
              para proyectar es el Crédito Definitivo.
            </>
          }
        />
        <Tile
          label="Crédito definitivo"
          value={fmtMoneyCompact(data.summary.creditoDefinitivo)}
          highlight
          tooltip={
            <>
              <strong>Presupuesto vigente</strong> al día de hoy, después de
              modificaciones presupuestarias. Es el monto que la app intenta
              proyectar hasta fin de año.
            </>
          }
        />
        <Tile
          label="Gastado YTD"
          value={fmtMoneyCompact(data.summary.gastadoYTD)}
          tooltip={
            <>
              <strong>Year-To-Date.</strong> Suma de lo ejecutado (devengado)
              desde el 1° de enero hasta el último mes con dato real.
            </>
          }
        />
        <Tile
          label="Saldo"
          value={fmtMoneyCompact(data.summary.saldo)}
          tooltip={
            <>
              <strong>Crédito Definitivo − Gastado YTD.</strong> La plata que
              queda por ejecutar entre el mes siguiente y diciembre.
            </>
          }
        />
        <Tile
          label="Plan futuro"
          value={fmtMoneyCompact(sumPlanFuturo)}
          hint="lo que se va a repartir"
          highlight
          tooltip={
            <>
              Suma del <strong>Plan</strong> para los meses futuros: el saldo
              repartido mes a mes siguiendo la forma del histórico,
              renormalizado para sumar 100%.
            </>
          }
        />
        <Tile
          label="Margen vs Esperado"
          value={fmtMoneyCompact(data.summary.margenEsperado)}
          tooltipAlign="right"
          tone={
            Math.abs(data.summary.margenEsperado) <
            data.summary.creditoDefinitivo * 0.05
              ? "neutral"
              : data.summary.margenEsperado > 0
                ? "ok"
                : "danger"
          }
          tooltip={
            <>
              <strong>Saldo − Σ Esperado futuro.</strong> Positivo = plata a
              favor (sobra al ritmo histórico); negativo = no alcanza el saldo.
              Es el termómetro que dispara decisiones.
            </>
          }
        />
      </div>

      {/* === Chart principal === */}
      <Card>
        <CardHeader>
          <CardTitle>Distribución mensual</CardTitle>
          <CardDescription>
            Barras: Plan (real hasta el mes actual, distribución del saldo
            después). Líneas: Esperado y datos reales de cada año base.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(v) => fmtMoneyCompact(Number(v))}
                  width={80}
                />
                <Tooltip
                  formatter={(v: number) => fmtMoney(v)}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {cm > 0 && cm < 12 && (
                  <ReferenceLine
                    x={MONTHS_ES[cm - 1]}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{ value: "Mes actual", fontSize: 11, fill: "#64748b" }}
                  />
                )}
                <Bar dataKey="Plan" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Line
                  dataKey="Esperado"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                {data.historicalReal.map((h, i) => (
                  <Line
                    key={h.year}
                    dataKey={`Real ${h.year}`}
                    stroke={HISTORICAL_COLORS[i % HISTORICAL_COLORS.length]}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {/* === Tabla mensual === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalle mensual</CardTitle>
            <CardDescription>
              Comparación de Real, Plan, Esperado y % histórico por mes.
            </CardDescription>
          </CardHeader>
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead className="text-xs uppercase text-slate-500 border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium text-left sticky left-0 bg-slate-50">
                    Métrica
                  </th>
                  {MONTHS_ES.map((m, i) => (
                    <th
                      key={m}
                      className={cn(
                        "px-3 py-2 font-medium text-right",
                        i + 1 === cm && "text-brand-700",
                      )}
                    >
                      {m}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium text-right">Σ</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="Real"
                  values={data.monthly.real}
                  total={data.summary.gastadoYTD}
                  highlightUntil={cm}
                />
                <Row
                  label="Plan"
                  values={data.monthly.plan}
                  total={data.monthly.plan.reduce((a, b) => a + b, 0)}
                  brand
                />
                <Row
                  label="Esperado"
                  values={data.monthly.esperado}
                  total={data.monthly.esperado.reduce((a, b) => a + b, 0)}
                  amber
                />
                <Row
                  label="% histórico"
                  values={data.monthly.historicalProfile}
                  total={tasaHist}
                  asPct
                />
                {data.historicalReal.map((h) => (
                  <Row
                    key={h.year}
                    label={`Real ${h.year}`}
                    values={h.months}
                    total={h.months.reduce((a, b) => a + b, 0)}
                    muted
                  />
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasas de ejecución</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <ExecBar
              label="Plan (proyectado)"
              pct={data.summary.tasaEjecucionPlan}
              color="bg-brand-600"
            />
            <ExecBar
              label="Esperado (al ritmo histórico)"
              pct={data.summary.tasaEjecucionEsperado}
              color="bg-amber-500"
            />
            <ExecBar
              label={`Histórico promedio (años ${data.summary.historyYearsUsed.join(",")})`}
              pct={tasaHist}
              color="bg-slate-400"
            />
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
              {data.summary.tasaEjecucionEsperado < 0.95 ? (
                <>
                  Al ritmo histórico se ejecutaría el{" "}
                  <strong>{fmtPct(data.summary.tasaEjecucionEsperado)}</strong>{" "}
                  — sobra crédito (margen a favor). Hay que acelerar para
                  llegar al 100%.
                </>
              ) : data.summary.tasaEjecucionEsperado > 1.05 ? (
                <>
                  El ritmo histórico consumiría más del crédito vigente (
                  {fmtPct(data.summary.tasaEjecucionEsperado)}) — el saldo no
                  alcanza (margen en contra). Probablemente haya que pedir
                  ampliación.
                </>
              ) : (
                <>El ritmo histórico está alineado con el crédito vigente.</>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* === Obras === */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Obras del programa</CardTitle>
              <CardDescription>
                {data.obras.length} obra{data.obras.length === 1 ? "" : "s"} ·
                Σ adjudicado: {fmtMoney(totalAdjudicado)}
              </CardDescription>
            </div>
            <div className="relative w-72">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Buscar por concepto, PRY, CUOV…"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0 overflow-x-auto">
          {filteredObras.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">
              {data.obras.length === 0
                ? "No hay obras registradas para este programa-segmento."
                : "No hay obras que coincidan con la búsqueda."}
            </div>
          ) : (
            <table className="w-full text-sm tabular">
              <thead className="text-xs uppercase text-slate-500 border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium text-left">PRY</th>
                  <th className="px-3 py-2 font-medium text-left">CUOV</th>
                  <th className="px-3 py-2 font-medium text-left">Concepto</th>
                  {data.segment === "TOTAL" && (
                    <th className="px-3 py-2 font-medium text-left">Sub-FF</th>
                  )}
                  <th className="px-3 py-2 font-medium text-left">Expediente</th>
                  <th className="px-3 py-2 font-medium text-right">Adjudicación</th>
                  <th className="px-3 py-2 font-medium text-right">Crédito original</th>
                  <th className="px-3 py-2 font-medium text-right">Crédito def.</th>
                  <th className="px-3 py-2 font-medium text-right">Gastado</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo</th>
                  <th className="px-3 py-2 font-medium text-right">% ejec.</th>
                </tr>
              </thead>
              <tbody>
                {filteredObras.map((o) => {
                  const pct =
                    o.creditoDefinitivo > 0
                      ? o.gastadoAcumulado / o.creditoDefinitivo
                      : 0;
                  return (
                    <tr
                      key={`${o.segmentSource}-${o.rowIdx}`}
                      className="border-b border-slate-50 hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-2 text-slate-600">{o.pry ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{o.cuov ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-900 max-w-md">
                        <div className="truncate" title={o.concepto}>
                          {o.concepto || "—"}
                        </div>
                      </td>
                      {data.segment === "TOTAL" && (
                        <td className="px-3 py-2">
                          <Badge
                            tone={o.segmentSource === "RENTA" ? "info" : "warning"}
                          >
                            {o.segmentSource === "RENTA" ? "Renta" : "Préstamo"}
                          </Badge>
                        </td>
                      )}
                      <td className="px-3 py-2 text-slate-500 text-xs">
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          <span className="truncate max-w-32" title={o.expediente ?? ""}>
                            {o.expediente ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {o.montoAdjudicacion ? fmtMoneyCompact(o.montoAdjudicacion) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {o.creditoOriginal ? fmtMoneyCompact(o.creditoOriginal) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {fmtMoneyCompact(o.creditoDefinitivo)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {fmtMoneyCompact(o.gastadoAcumulado)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {fmtMoneyCompact(o.saldos)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center font-medium",
                            pct >= 0.8
                              ? "text-emerald-600"
                              : pct >= 0.4
                                ? "text-amber-600"
                                : "text-slate-500",
                          )}
                        >
                          {fmtPct(pct)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// =============================================================================
// Subcomponentes
// =============================================================================

function Tile({
  label,
  value,
  hint,
  highlight,
  tone,
  tooltip,
  tooltipAlign = "left",
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
  tone?: "ok" | "warning" | "danger" | "neutral";
  tooltip?: React.ReactNode;
  tooltipAlign?: "left" | "right" | "center";
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50/60"
      : tone === "danger"
        ? "border-red-200 bg-red-50/60"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50/60"
          : highlight
            ? "border-brand-200 bg-brand-50/60"
            : "border-slate-200 bg-white";
  return (
    <div className={cn("rounded-lg border px-4 py-3 shadow-card", cls)}>
      <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center">
        {label}
        {tooltip && <InfoTooltip align={tooltipAlign}>{tooltip}</InfoTooltip>}
      </div>
      <div className="text-lg font-semibold text-slate-900 mt-0.5 tabular truncate">
        {value}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Row({
  label,
  values,
  total,
  highlightUntil,
  brand,
  amber,
  asPct,
  muted,
}: {
  label: string;
  values: number[];
  total: number;
  highlightUntil?: number;
  brand?: boolean;
  amber?: boolean;
  asPct?: boolean;
  muted?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-slate-50",
        brand && "bg-brand-50/30",
        amber && "bg-amber-50/20",
        muted && "text-slate-500",
      )}
    >
      <td
        className={cn(
          "px-3 py-2 font-medium sticky left-0",
          brand ? "bg-brand-50/30 text-brand-900" : amber ? "bg-amber-50/20 text-amber-900" : "bg-white",
        )}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            "px-3 py-2 text-right text-slate-600",
            highlightUntil != null && i + 1 <= highlightUntil && "font-medium text-slate-900",
          )}
        >
          {asPct
            ? `${(v * 100).toFixed(1)}%`
            : v > 0
              ? fmtMoneyCompact(v).replace("$ ", "")
              : "—"}
        </td>
      ))}
      <td className="px-3 py-2 text-right font-semibold text-slate-900">
        {asPct ? `${(total * 100).toFixed(1)}%` : fmtMoneyCompact(total).replace("$ ", "")}
      </td>
    </tr>
  );
}

function ExecBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  const w = Math.min(120, Math.max(0, pct * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-600 truncate">{label}</span>
        <span className="font-semibold text-slate-900 tabular ml-3">
          {fmtPct(pct)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={cn("h-full", color)} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}
