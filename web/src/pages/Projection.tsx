import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
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
  AreaChart,
  Area,
} from "recharts";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  ObrasPctMatrixModal,
  type ObrasPctMatrix,
} from "@/components/projection/ObrasPctMatrixModal";
import { Download, Settings as SettingsIcon, ArrowRight } from "lucide-react";
import {
  api,
  type ExcelFileRow,
  type Program,
  type ProjectionEnvelope,
  type Segment,
  type ProjectionParams,
} from "@/lib/api";
import { fmtMoney, fmtMoneyCompact, fmtPct, MONTHS_ES } from "@/lib/utils";

interface SettingsRemote {
  targetYear?: number;
  baseYears?: number[];
  currentMonthOverride?: number | null;
  segmentSelection?: Record<string, Segment[]>;
}

function detectCurrentMonthFromFile(
  programs: { months: number[] }[],
): number {
  let last = 0;
  for (const p of programs) {
    for (let i = 0; i < 12; i++) {
      if ((p.months[i] ?? 0) > 0 && i + 1 > last) last = i + 1;
    }
  }
  return last;
}

export default function Projection() {
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
    queryFn: async () =>
      (await api.get<SettingsRemote>("/settings")).data,
  });

  const availableYears = useMemo(
    () => Array.from(new Set(files.map((f) => f.year))).sort((a, b) => b - a),
    [files],
  );

  const params: ProjectionParams | null = useMemo(() => {
    if (programs.length === 0 || availableYears.length === 0) return null;
    const targetYear =
      settings.targetYear ?? availableYears[0] ?? new Date().getFullYear();
    const baseYears =
      settings.baseYears && settings.baseYears.length > 0
        ? settings.baseYears
        : availableYears.filter((y) => y !== targetYear).slice(0, 2);
    const segmentSelection =
      settings.segmentSelection && Object.keys(settings.segmentSelection).length
        ? settings.segmentSelection
        : programs.reduce<Record<string, Segment[]>>((acc, p) => {
            acc[p.slug] =
              p.family === "FAMILIA1" ? ["SOLE"] : ["RENTA", "PRESTAMO"];
            return acc;
          }, {});
    const currentMonth =
      settings.currentMonthOverride ?? null;
    return {
      targetYear,
      baseYears,
      currentMonth: currentMonth ?? 0, // se reemplaza abajo si auto
      segmentSelection,
    };
  }, [programs, availableYears, settings]);

  // Necesitamos saber el mes actual auto: lo derivamos del audit del archivo del target year
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
    const auto = targetAudit
      ? detectCurrentMonthFromFile(targetAudit.extractions)
      : 0;
    const cm = settings.currentMonthOverride ?? auto;
    return { ...params, currentMonth: cm };
  }, [params, targetAudit, settings.currentMonthOverride]);

  const [envelope, setEnvelope] = useState<ProjectionEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch cuando cambian params
  useEffect(() => {
    if (!finalParams || finalParams.baseYears.length === 0) return;
    setError(null);
    api
      .post<ProjectionEnvelope>("/projection", finalParams)
      .then((r) => setEnvelope(r.data))
      .catch((err) => {
        setError(err?.response?.data?.error ?? "Error al proyectar");
      });
  }, [finalParams]);

  const [exportModalOpen, setExportModalOpen] = useState(false);

  const exportXlsx = useMutation({
    mutationFn: async (args: { pctMatrix: ObrasPctMatrix }) => {
      if (!finalParams) return;
      const body = { ...finalParams, obrasPctMatrix: args.pctMatrix };
      const res = await api.post("/projection/export", body, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proyeccion_${finalParams.targetYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success("Exportado"),
    onError: () => toast.error("Falló la exportación"),
  });

  if (availableYears.length === 0) {
    return (
      <EmptyState
        title="Sin archivos cargados"
        message="Subí al menos un .xls en Archivos para empezar a proyectar."
        cta={{ to: "/archivos", label: "Ir a Archivos" }}
      />
    );
  }
  if (!finalParams) {
    return <div className="text-slate-500">Cargando configuración…</div>;
  }
  if (finalParams.baseYears.length === 0) {
    const onlyOneYear = availableYears.length === 1;
    return (
      <EmptyState
        title={onlyOneYear ? "Falta histórico para proyectar" : "Falta año base"}
        message={
          onlyOneYear
            ? `Solo tenés cargado el año ${finalParams.targetYear}. Para proyectar Plan/Esperado necesitás al menos un año histórico adicional. Subí otro Excel desde Archivos.`
            : "Necesitás al menos un año histórico distinto del target. Configuralo en Configuración."
        }
        cta={
          onlyOneYear
            ? { to: "/archivos", label: "Ir a Archivos" }
            : { to: "/configuracion", label: "Configurar" }
        }
      />
    );
  }
  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Proyección</h1>
        <p className="text-red-600 mt-2">{error}</p>
      </div>
    );
  }
  if (!envelope) {
    return <div className="text-slate-500">Calculando proyección…</div>;
  }

  const c = envelope.consolidated;
  const sumPlanFuturo = c.plan
    .slice(finalParams.currentMonth)
    .reduce((a, b) => a + b, 0);
  const sumEspFuturo = c.esperado
    .slice(finalParams.currentMonth)
    .reduce((a, b) => a + b, 0);
  const margenTone =
    Math.abs(c.margenEsperado) < c.creditoDefinitivo * 0.02
      ? "neutral"
      : c.margenEsperado > 0
        ? "ok"
        : "danger";
  const chartData = MONTHS_ES.map((m, i) => {
    const row: Record<string, number | string> = {
      mes: m,
      Plan: Math.round(c.plan[i] ?? 0),
      Esperado: Math.round(c.esperado[i] ?? 0),
    };
    for (const h of c.historicalReal) {
      row[`Real ${h.year}`] = Math.round(h.months[i] ?? 0);
    }
    return row;
  });

  const HISTORICAL_COLORS = ["#94a3b8", "#cbd5e1", "#64748b"];

  return (
    <div className="space-y-6">
      <ObrasPctMatrixModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        currentMonth={finalParams.currentMonth}
        programs={programs}
        segmentSelection={finalParams.segmentSelection}
        submitting={exportXlsx.isPending}
        onSubmit={(matrix) => {
          exportXlsx.mutate({ pctMatrix: matrix });
          setExportModalOpen(false);
        }}
      />
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
            Proyección {finalParams.targetYear}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Base histórica: {finalParams.baseYears.join(" + ")} · Mes actual:{" "}
            {finalParams.currentMonth > 0
              ? `${MONTHS_ES[finalParams.currentMonth - 1]} (real hasta acá)`
              : "Sin cierre todavía"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/configuracion" className="flex-1 sm:flex-none">
            <Button variant="outline" size="md" className="w-full sm:w-auto">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Configurar</span>
            </Button>
          </Link>
          <Button
            size="md"
            onClick={() => setExportModalOpen(true)}
            disabled={exportXlsx.isPending}
            className="flex-1 sm:flex-none"
          >
            <Download className="h-4 w-4" />
            <span className="whitespace-nowrap">Exportar Excel</span>
          </Button>
        </div>
      </div>

      {/* HERO KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-4">
        <KpiTile
          label="Crédito definitivo"
          value={fmtMoney(c.creditoDefinitivo)}
          hint="Suma de los programas seleccionados"
          tooltip={
            <>
              <strong>Presupuesto vigente</strong> al día de hoy, después de
              modificaciones presupuestarias (ampliaciones, reducciones,
              reasignaciones). Es el monto total que la app intenta proyectar
              hasta fin de año. Se diferencia del <em>Crédito Original</em>{" "}
              (el sancionado por la legislatura al inicio del ejercicio).
            </>
          }
        />
        <KpiTile
          label="Gastado YTD"
          value={fmtMoney(c.gastadoYTD)}
          hint={
            finalParams.currentMonth > 0
              ? `Hasta ${MONTHS_ES[finalParams.currentMonth - 1]}`
              : "Sin cierre"
          }
          tooltip={
            <>
              <strong>Year-To-Date.</strong> Es la suma de lo que se ejecutó
              (devengado) desde el 1° de enero del año en curso hasta el último
              mes con dato real. En otras palabras: lo que ya se gastó del
              crédito de este año.
            </>
          }
        />
        <KpiTile
          label="Saldo a ejecutar"
          value={fmtMoney(c.saldo)}
          hint="Lo que queda hasta diciembre"
          tooltip={
            <>
              <strong>Crédito Definitivo − Gastado YTD.</strong> Es la plata que
              aún tenés disponible para ejecutar entre el mes siguiente al
              actual y diciembre.
            </>
          }
        />
        <KpiTile
          label="Plan restante"
          value={fmtMoney(sumPlanFuturo)}
          hint={`= Saldo distribuido por perfil histórico`}
          highlight
          tooltip={
            <>
              Suma del <strong>Plan</strong> para los meses futuros. Es el saldo
              repartido mes a mes siguiendo la forma del histórico,
              renormalizado para sumar 100% del saldo. Es la receta operativa
              para Tesorería.
            </>
          }
        />
        <KpiTile
          label="Margen vs Esperado"
          value={fmtMoney(c.margenEsperado)}
          hint={
            c.margenEsperado > 0
              ? "Plata a favor: el ritmo histórico no consume todo el saldo"
              : c.margenEsperado < 0
                ? "Falta plata: al ritmo histórico no alcanza el saldo"
                : "El ritmo histórico está alineado con el saldo"
          }
          tone={margenTone}
          tooltipAlign="right"
          tooltip={
            <>
              <strong>Saldo − Σ Esperado futuro.</strong> El termómetro:{" "}
              <em>positivo</em> = sobra plata, queda margen a favor;{" "}
              <em>negativo</em> = no alcanza el saldo al ritmo histórico;{" "}
              <em>≈ 0</em> = bien calibrado.
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Distribución mensual consolidada</CardTitle>
            <CardDescription>
              Barras: Plan (real hasta el mes actual, distribución del saldo
              después). Línea naranja: Esperado (perfil histórico aplicado al
              crédito). Líneas grises punteadas: ejecución real de cada año
              base.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <div className="h-[240px] sm:h-[320px]">
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
                  {finalParams.currentMonth > 0 && finalParams.currentMonth < 12 && (
                    <ReferenceLine
                      x={MONTHS_ES[finalParams.currentMonth - 1]}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      label={{
                        value: "Mes actual",
                        fontSize: 11,
                        fill: "#64748b",
                      }}
                    />
                  )}
                  <Bar dataKey="Plan" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Line
                    dataKey="Esperado"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  {c.historicalReal.map((h, i) => (
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

        <Card>
          <CardHeader>
            <CardTitle>Tasa de ejecución</CardTitle>
            <CardDescription>
              Plan = 100% por construcción. Esperado = lo que daría el ritmo
              histórico aplicado al crédito vigente. Histórico = qué % del
              crédito se ejecutó en los años base.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <ExecBar
              label="Plan (proyectado)"
              pct={c.tasaEjecucionPlan}
              color="bg-brand-600"
            />
            <ExecBar
              label="Esperado (al ritmo histórico)"
              pct={c.tasaEjecucionEsperado}
              color="bg-amber-500"
            />
            {c.historicalReal.length > 0 && (
              <ExecBar
                label={`Histórico promedio (${c.historicalReal.map((h) => h.year).join(", ")})`}
                pct={c.tasaEjecucionHistorica}
                color="bg-slate-400"
              />
            )}
            <div className="text-sm text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
              {c.tasaEjecucionEsperado < 0.95 ? (
                <>
                  Al ritmo histórico se ejecutaría el{" "}
                  <strong>{fmtPct(c.tasaEjecucionEsperado)}</strong> del crédito
                  vigente — sobra crédito (margen a favor). Hay que acelerar
                  para llegar al 100%.
                </>
              ) : c.tasaEjecucionEsperado > 1.05 ? (
                <>
                  El ritmo histórico consumiría más del crédito vigente (
                  {fmtPct(c.tasaEjecucionEsperado)}) — el saldo no alcanza
                  (margen en contra). Probablemente haya que pedir ampliación.
                </>
              ) : (
                <>
                  El ritmo histórico está alineado con el crédito vigente (≈
                  {fmtPct(c.tasaEjecucionEsperado)}).
                </>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {envelope.skipped.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Programas no proyectados</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5">
            {envelope.skipped.map((s, i) => (
              <div key={i} className="text-sm text-slate-700">
                <Badge tone="warning" className="mr-2">
                  {s.programSlug} / {s.segment}
                </Badge>
                {s.reason}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          Detalle por programa
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {envelope.perProgram.map((p) => (
            <ProgramCard key={`${p.programSlug}-${p.segment}`} p={p} currentMonth={finalParams.currentMonth} />
          ))}
        </div>
      </div>

      {/* Tabla mensual */}
      <Card>
        <CardHeader>
          <CardTitle>Mensual por programa</CardTitle>
          <CardDescription>Plan en pesos absolutos.</CardDescription>
        </CardHeader>
        <CardBody className="p-0">
          {/* Desktop: tabla mensual completa */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium sticky left-0 bg-slate-50">
                    Programa
                  </th>
                  {MONTHS_ES.map((m, i) => (
                    <th
                      key={m}
                      className={
                        "px-3 py-2 font-medium text-right " +
                        (i + 1 === finalParams.currentMonth
                          ? "text-brand-700"
                          : "")
                      }
                    >
                      {m}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium text-right">Σ</th>
                </tr>
              </thead>
              <tbody>
                {envelope.perProgram.map((p) => {
                  const sum = p.plan.reduce((a, b) => a + b, 0);
                  return (
                    <tr
                      key={`${p.programSlug}-${p.segment}-row`}
                      className="border-b border-slate-50 hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-white">
                        {p.programName}{" "}
                        {p.segment !== "SOLE" && (
                          <span className="text-slate-400 text-xs">/ {p.segment}</span>
                        )}
                      </td>
                      {p.plan.map((v, i) => (
                        <td
                          key={i}
                          className={
                            "px-3 py-2 text-right text-slate-600 " +
                            (i < finalParams.currentMonth ? "" : "text-brand-700")
                          }
                        >
                          {v > 0 ? fmtMoneyCompact(v).replace("$ ", "") : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {fmtMoneyCompact(sum).replace("$ ", "")}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-200 font-semibold bg-slate-50/60">
                  <td className="px-3 py-2 sticky left-0 bg-slate-50/60">Total</td>
                  {c.plan.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right">
                      {fmtMoneyCompact(v).replace("$ ", "")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    {fmtMoneyCompact(c.plan.reduce((a, b) => a + b, 0)).replace("$ ", "")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile: cards apiladas con meses en grid 3x4 */}
          <div className="sm:hidden divide-y divide-slate-100">
            {envelope.perProgram.map((p) => {
              const sum = p.plan.reduce((a, b) => a + b, 0);
              return (
                <div key={`${p.programSlug}-${p.segment}-mobcard`} className="p-3">
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="font-medium text-sm text-slate-900">
                      {p.programName}
                      {p.segment !== "SOLE" && (
                        <span className="text-slate-400 text-xs ml-1">/ {p.segment}</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold tabular text-slate-900">
                      {fmtMoneyCompact(sum).replace("$ ", "")}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs tabular">
                    {p.plan.map((v, i) => (
                      <div
                        key={i}
                        className={
                          "flex justify-between " +
                          (i < finalParams.currentMonth
                            ? "text-slate-600"
                            : "text-brand-700")
                        }
                      >
                        <span className="text-slate-400 w-8">{MONTHS_ES[i]}</span>
                        <span>{v > 0 ? fmtMoneyCompact(v).replace("$ ", "") : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="p-3 bg-slate-50/60">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <div className="font-semibold text-sm text-slate-900">Total consolidado</div>
                <div className="text-sm font-semibold tabular">
                  {fmtMoneyCompact(c.plan.reduce((a, b) => a + b, 0)).replace("$ ", "")}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs tabular">
                {c.plan.map((v, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-slate-400 w-8">{MONTHS_ES[i]}</span>
                    <span>{fmtMoneyCompact(v).replace("$ ", "")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ============================================================================
// Subcomponentes
// ============================================================================

function KpiTile({
  label,
  value,
  hint,
  tone,
  highlight,
  tooltip,
  tooltipAlign = "left",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "warning" | "danger";
  highlight?: boolean;
  tooltip?: React.ReactNode;
  tooltipAlign?: "left" | "right" | "center";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50/60"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/60"
        : tone === "danger"
          ? "border-red-200 bg-red-50/60"
          : highlight
            ? "border-brand-200 bg-brand-50/60"
            : "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border ${toneCls} px-4 py-3 sm:px-5 sm:py-4 shadow-card min-w-0`}>
      <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center">
        {label}
        {tooltip && <InfoTooltip align={tooltipAlign}>{tooltip}</InfoTooltip>}
      </div>
      <div className="text-lg sm:text-xl lg:text-2xl 2xl:text-xl font-semibold text-slate-900 mt-1 tabular whitespace-nowrap">
        {value}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
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
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900 tabular">
          {fmtPct(pct)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function ProgramCard({
  p,
  currentMonth,
}: {
  p: ProjectionEnvelope["perProgram"][number];
  currentMonth: number;
}) {
  const sumPlanFuturo = p.plan.slice(currentMonth).reduce((a, b) => a + b, 0);
  const data = MONTHS_ES.map((m, i) => ({ mes: m, plan: p.plan[i] ?? 0 }));
  const tone =
    Math.abs(p.margenEsperado) < p.creditoDefinitivo * 0.05
      ? "neutral"
      : p.margenEsperado > 0
        ? "ok"
        : "danger";
  return (
    <Link
      to={`/proyeccion/${p.programSlug}/${p.segment}`}
      className="block group"
    >
      <Card className="transition-all hover:shadow-md hover:border-brand-300 cursor-pointer h-full">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="group-hover:text-brand-700 transition-colors flex items-center gap-1.5">
                {p.programName}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-brand-600" />
              </CardTitle>
              <CardDescription className="mt-0.5">
                {p.segment === "SOLE" ? "Sin desglose" : p.segment}
              </CardDescription>
            </div>
            <Badge tone={tone}>Margen {fmtMoneyCompact(p.margenEsperado)}</Badge>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-slate-500">Crédito def.</div>
              <div className="font-medium tabular">
                {fmtMoneyCompact(p.creditoDefinitivo)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Saldo</div>
              <div className="font-medium tabular">
                {fmtMoneyCompact(p.saldo)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Plan futuro</div>
              <div className="font-medium tabular text-brand-700">
                {fmtMoneyCompact(sumPlanFuturo)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tasa Esp.</div>
              <div className="font-medium tabular">
                {fmtPct(p.tasaEjecucionEsperado)}
              </div>
            </div>
          </div>
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <Area
                  type="monotone"
                  dataKey="plan"
                  stroke="#2563eb"
                  fill="#bfdbfe"
                  strokeWidth={1.5}
                />
                <XAxis dataKey="mes" tick={{ fontSize: 9, fill: "#94a3b8" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

function EmptyState({
  title,
  message,
  cta,
}: {
  title: string;
  message: string;
  cta: { to: string; label: string };
}) {
  return (
    <Card>
      <CardBody className="p-12 text-center">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">{title}</h2>
        <p className="text-sm text-slate-500 mb-5">{message}</p>
        <Link to={cta.to}>
          <Button>{cta.label}</Button>
        </Link>
      </CardBody>
    </Card>
  );
}
