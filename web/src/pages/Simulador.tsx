import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
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
import { Input, Label, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Button } from "@/components/ui/Button";
import { FlaskConical, Search, RotateCcw, FileText, X } from "lucide-react";
import {
  api,
  type ExcelFileRow,
  type ObraDetail,
  type ObrasListResponse,
  type Segment,
} from "@/lib/api";
import { cn, fmtMoney, fmtMoneyCompact, MONTHS_ES, MONTHS_LONG } from "@/lib/utils";

interface SettingsRemote {
  targetYear?: number;
  currentMonthOverride?: number | null;
}

const SEG_LABEL: Record<Segment, string> = {
  SOLE: "Sin desglose",
  TOTAL: "Total",
  RENTA: "Renta",
  PRESTAMO: "Préstamo",
};

function detectCurrentMonthFromObras(obras: ObraDetail[]): number {
  let last = 0;
  for (const o of obras) {
    for (let i = 0; i < 12; i++) {
      if ((o.months[i] ?? 0) > 0 && i + 1 > last) last = i + 1;
    }
  }
  return last;
}

export default function Simulador() {
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

  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    if (year != null) return;
    if (availableYears.length === 0) return;
    setYear(settings.targetYear ?? availableYears[0]!);
  }, [availableYears, settings.targetYear, year]);

  const { data: obrasData, isLoading: loadingObras } = useQuery({
    queryKey: ["obras", year],
    queryFn: async () =>
      (await api.get<ObrasListResponse>(`/obras?year=${year}`)).data,
    enabled: !!year,
  });

  const obras = obrasData?.obras ?? [];

  const detectedCurrentMonth = useMemo(
    () => detectCurrentMonthFromObras(obras),
    [obras],
  );
  const currentMonth =
    settings.currentMonthOverride ?? detectedCurrentMonth ?? 0;

  // ---------------------------------------------------------------------------
  // Combobox de obras
  // ---------------------------------------------------------------------------

  const [obraId, setObraId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    const eligible = obras.filter((o) => o.creditoDefinitivo > 0);
    if (!search.trim()) return eligible.slice(0, 100);
    const s = search.toLowerCase();
    return eligible
      .filter(
        (o) =>
          o.concepto.toLowerCase().includes(s) ||
          (o.pry ?? "").toLowerCase().includes(s) ||
          (o.cuov ?? "").toLowerCase().includes(s) ||
          (o.expediente ?? "").toLowerCase().includes(s) ||
          o.programName.toLowerCase().includes(s),
      )
      .slice(0, 100);
  }, [obras, search]);

  const obra = useMemo(
    () => obras.find((o) => o.id === obraId) ?? null,
    [obras, obraId],
  );

  // ---------------------------------------------------------------------------
  // Estado de la simulación
  // ---------------------------------------------------------------------------

  // percentages[i] = % del crédito definitivo a ejecutar en el mes i
  const [percentages, setPercentages] = useState<number[]>(() =>
    Array(12).fill(0),
  );
  const [touched, setTouched] = useState(false);

  // Cuando se selecciona una obra, prefilleamos: meses pasados con el % real,
  // futuros con un reparto uniforme del saldo.
  useEffect(() => {
    if (!obra) return;
    initFromObra(obra, currentMonth);
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra?.id]);

  function initFromObra(o: ObraDetail, cm: number) {
    const cd = o.creditoDefinitivo;
    if (cd <= 0) {
      setPercentages(Array(12).fill(0));
      return;
    }
    const realPct = o.months.map((m) => (m / cd) * 100);
    const saldoPct = (o.saldos / cd) * 100;
    const futureMonths = Math.max(12 - cm, 0);
    const evenFuturePct = futureMonths > 0 ? saldoPct / futureMonths : 0;
    const next = realPct.map((p, i) =>
      i < cm ? p : Number(evenFuturePct.toFixed(2)),
    );
    setPercentages(next);
  }

  function setPctAt(monthIdx: number, val: string) {
    const num = Number(val);
    setPercentages((prev) => {
      const next = prev.slice();
      next[monthIdx] = Number.isFinite(num) ? num : 0;
      return next;
    });
    setTouched(true);
  }

  function distribuirEnPartesIguales() {
    if (!obra) return;
    const cd = obra.creditoDefinitivo;
    const realPct = obra.months.map((m) => (m / cd) * 100);
    const saldoPct = (obra.saldos / cd) * 100;
    const futureMonths = Math.max(12 - currentMonth, 0);
    const even = futureMonths > 0 ? saldoPct / futureMonths : 0;
    const next = realPct.map((p, i) =>
      i < currentMonth ? p : Number(even.toFixed(2)),
    );
    setPercentages(next);
    setTouched(true);
  }

  function ponerSaldoEnUnMes(monthIdx: number) {
    if (!obra) return;
    const cd = obra.creditoDefinitivo;
    const realPct = obra.months.map((m) => (m / cd) * 100);
    const saldoPct = (obra.saldos / cd) * 100;
    const next = realPct.map((p, i) => {
      if (i < currentMonth) return p;
      if (i === monthIdx) return Number(saldoPct.toFixed(2));
      return 0;
    });
    setPercentages(next);
    setTouched(true);
  }

  // ---------------------------------------------------------------------------
  // Cálculos derivados
  // ---------------------------------------------------------------------------

  const cd = obra?.creditoDefinitivo ?? 0;
  const amounts = percentages.map((p) => (p / 100) * cd);

  const totalSimulado = amounts.reduce((a, b) => a + b, 0);
  const totalPctAsignado = percentages.reduce((a, b) => a + b, 0);
  const futureSimulado = amounts
    .slice(currentMonth)
    .reduce((a, b) => a + b, 0);
  const expectedFutureFromSaldo = obra?.saldos ?? 0;
  const saldoNoEjecutado = (obra?.saldos ?? 0) - futureSimulado;
  const tasaFinalProyectada = cd > 0 ? totalSimulado / cd : 0;

  const chartData = MONTHS_ES.map((m, i) => {
    const isReal = i < currentMonth;
    return {
      mes: m,
      Real: isReal ? Math.round(obra?.months[i] ?? 0) : 0,
      Simulado: !isReal ? Math.round(amounts[i] ?? 0) : 0,
    };
  });

  if (availableYears.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Simulador de obra
        </h1>
        <Card className="mt-6">
          <CardBody className="p-10 text-center text-slate-500">
            Subí al menos un Excel en <em>Archivos</em> para empezar a simular.
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="h-5 w-5 text-brand-600" />
          <h1 className="text-2xl font-semibold text-slate-900">
            Simulador de obra
          </h1>
        </div>
        <p className="text-sm text-slate-500">
          Elegí una obra y experimentá cómo se distribuye el saldo a lo largo
          del año. Las cifras reales del Excel quedan fijas; vos definís el % a
          ejecutar mes a mes en lo que falta.
        </p>
      </div>

      {/* Selector de año + obra */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-32">
              <Label>Año</Label>
              <Select
                className="w-full mt-1"
                value={year ?? ""}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  setObraId(null);
                  setSearch("");
                }}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex-1 min-w-[280px]" ref={pickerRef}>
              <Label>Obra</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  className="pl-8 pr-9"
                  placeholder={
                    loadingObras
                      ? "Cargando obras…"
                      : "Buscar por concepto, PRY, CUOV, expediente…"
                  }
                  value={
                    !pickerOpen && obra
                      ? `${obra.programName} · ${obra.concepto}`
                      : search
                  }
                  onFocus={() => setPickerOpen(true)}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPickerOpen(true);
                  }}
                />
                {obra && !pickerOpen && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setObraId(null);
                      setSearch("");
                    }}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {pickerOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-slate-200 rounded-md shadow-lg max-h-80 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500 text-center">
                        Sin resultados
                      </div>
                    ) : (
                      filtered.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setObraId(o.id);
                            setPickerOpen(false);
                            setSearch("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm text-slate-900 line-clamp-2">
                              {o.concepto}
                            </div>
                            <span className="shrink-0 text-xs tabular text-slate-700 font-medium">
                              {fmtMoneyCompact(o.creditoDefinitivo)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <Badge tone="neutral">{o.programName}</Badge>
                            {o.segment !== "SOLE" && (
                              <Badge tone="info">{SEG_LABEL[o.segment]}</Badge>
                            )}
                            {o.pry && <span>PRY {o.pry}</span>}
                            {o.cuov && <span>CUOV {o.cuov}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {obras.filter((o) => o.creditoDefinitivo > 0).length} obras con
                crédito disponibles para {year}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {!obra ? (
        <Card>
          <CardBody className="p-12 text-center text-slate-500">
            Elegí una obra del listado para empezar la simulación.
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Info de la obra */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{obra.concepto}</CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{obra.programName}</Badge>
                    {obra.segment !== "SOLE" && (
                      <Badge tone="info">{SEG_LABEL[obra.segment]}</Badge>
                    )}
                    {obra.pry && (
                      <span className="text-xs">PRY {obra.pry}</span>
                    )}
                    {obra.cuov && (
                      <span className="text-xs">· CUOV {obra.cuov}</span>
                    )}
                  </CardDescription>
                </div>
                <Badge tone="neutral" className="shrink-0">
                  Año {year}
                </Badge>
              </div>
            </CardHeader>
            <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {obra.expediente && (
                <div>
                  <div className="text-xs uppercase text-slate-500">
                    Expediente
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-slate-700">
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    {obra.expediente}
                  </div>
                </div>
              )}
              {obra.montoAdjudicacion != null && (
                <div>
                  <div className="text-xs uppercase text-slate-500">
                    Monto adjudicado
                  </div>
                  <div className="mt-0.5 tabular text-slate-700">
                    {fmtMoney(obra.montoAdjudicacion)}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-4">
            <SimTile
              label="Crédito definitivo"
              value={fmtMoney(cd)}
              tooltip="Presupuesto vigente de la obra para este año."
            />
            <SimTile
              label="Gastado YTD"
              value={fmtMoney(obra.gastadoAcumulado)}
              hint={
                currentMonth > 0
                  ? `Hasta ${MONTHS_ES[currentMonth - 1]}`
                  : "Sin cierre"
              }
              tooltip="Lo ejecutado de esta obra desde enero hasta el último mes con dato real."
            />
            <SimTile
              label="Saldo a ejecutar"
              value={fmtMoney(obra.saldos)}
              tooltip="Crédito Definitivo − Gastado YTD. Esto es lo que la simulación debe distribuir."
            />
            <SimTile
              label="Total simulado"
              value={fmtMoney(totalSimulado)}
              hint={`= Real + futuro simulado`}
              highlight
              tooltip="Suma de los meses pasados (real) + los meses futuros con el % que vos elegiste."
            />
            <SimTile
              label="Saldo sin ejecutar"
              value={fmtMoney(saldoNoEjecutado)}
              tone={
                Math.abs(saldoNoEjecutado) < cd * 0.005
                  ? "neutral"
                  : saldoNoEjecutado > 0
                    ? "warning"
                    : "danger"
              }
              hint={
                saldoNoEjecutado > 0
                  ? "Quedaría crédito sin asignar"
                  : saldoNoEjecutado < 0
                    ? "Te pasaste del saldo"
                    : "Saldo cubierto exacto"
              }
              tooltip="Saldo − Σ(montos simulados a futuro). Idealmente cero (cubrís todo el saldo)."
              tooltipAlign="right"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Tabla mensual */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Distribución mensual</CardTitle>
                    <CardDescription>
                      Editá el % de los meses futuros. Los pasados (sombreados)
                      vienen del Excel y no se editan.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={distribuirEnPartesIguales}
                      title="Repartir el saldo en partes iguales entre los meses futuros"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Repartir parejo
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-100 bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 font-medium">Mes</th>
                      <th className="px-4 py-2 font-medium text-right w-32">%</th>
                      <th className="px-4 py-2 font-medium text-right">Monto</th>
                      <th className="px-4 py-2 font-medium w-32"></th>
                      <th className="px-2 py-2 font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS_LONG.map((m, i) => {
                      const isPast = i < currentMonth;
                      const pct = percentages[i] ?? 0;
                      const amt = amounts[i] ?? 0;
                      const maxBar = Math.max(...amounts, 1);
                      const barW = (amt / maxBar) * 100;
                      return (
                        <tr
                          key={m}
                          className={cn(
                            "border-b border-slate-50",
                            isPast && "bg-slate-50/40 text-slate-500",
                          )}
                        >
                          <td className="px-4 py-2 font-medium">
                            {m}
                            {isPast && (
                              <span className="ml-2 text-xs text-slate-400">
                                (real)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {isPast ? (
                              <span className="tabular text-slate-500">
                                {pct.toFixed(2)}%
                              </span>
                            ) : (
                              <div className="relative inline-flex items-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={pct}
                                  onChange={(e) => setPctAt(i, e.target.value)}
                                  className="h-8 w-24 text-right pr-6 rounded-md border border-slate-300 text-sm tabular focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                                />
                                <span className="absolute right-2 text-slate-400 text-xs pointer-events-none">
                                  %
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular text-slate-700">
                            {amt > 0 ? fmtMoney(amt) : "—"}
                          </td>
                          <td className="px-4 py-2">
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  isPast ? "bg-slate-400" : "bg-brand-500",
                                )}
                                style={{ width: `${barW}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            {!isPast && (
                              <button
                                type="button"
                                onClick={() => ponerSaldoEnUnMes(i)}
                                title="Concentrar todo el saldo en este mes"
                                className="text-slate-300 hover:text-brand-600"
                              >
                                ⤓
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-slate-200 font-semibold bg-slate-50">
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-4 py-2.5 text-right tabular">
                        {totalPctAsignado.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">
                        {fmtMoney(totalSimulado)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumen</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4 text-sm">
                <ResumenItem
                  label="Tasa de ejecución proyectada"
                  value={`${(tasaFinalProyectada * 100).toFixed(1)}%`}
                  hint="Σ(real + simulado) / crédito definitivo"
                />
                <ResumenItem
                  label="Σ futuro simulado"
                  value={fmtMoney(futureSimulado)}
                  hint={`vs saldo ${fmtMoney(expectedFutureFromSaldo)}`}
                />
                <ResumenItem
                  label="Diferencia con saldo"
                  value={fmtMoney(saldoNoEjecutado)}
                  tone={
                    Math.abs(saldoNoEjecutado) < cd * 0.005
                      ? "ok"
                      : saldoNoEjecutado > 0
                        ? "warning"
                        : "danger"
                  }
                />
                <div className="pt-3 border-t border-slate-100 text-slate-600 leading-relaxed">
                  {Math.abs(saldoNoEjecutado) < cd * 0.005 ? (
                    <>
                      Tu simulación cubre <strong>todo el saldo</strong>. Vas a
                      ejecutar el {(tasaFinalProyectada * 100).toFixed(1)}% del
                      crédito definitivo.
                    </>
                  ) : saldoNoEjecutado > 0 ? (
                    <>
                      Te están sobrando{" "}
                      <strong className="text-amber-700">
                        {fmtMoney(saldoNoEjecutado)}
                      </strong>{" "}
                      sin ejecutar. Si fuera real, sería sub-ejecución de la
                      obra.
                    </>
                  ) : (
                    <>
                      Te estás pasando{" "}
                      <strong className="text-red-700">
                        {fmtMoney(-saldoNoEjecutado)}
                      </strong>{" "}
                      del saldo disponible. No alcanza el crédito.
                    </>
                  )}
                </div>
                {touched && (
                  <button
                    type="button"
                    onClick={() => obra && initFromObra(obra, currentMonth)}
                    className="text-xs text-brand-700 hover:text-brand-800 underline"
                  >
                    ↺ Volver al reparto inicial
                  </button>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Distribución mensual de la obra</CardTitle>
              <CardDescription>
                Barras grises: ejecución real. Barras azules: simulación a
                futuro.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <div className="h-[320px]">
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
                    {currentMonth > 0 && currentMonth < 12 && (
                      <ReferenceLine
                        x={MONTHS_ES[currentMonth - 1]}
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                        label={{
                          value: "Mes actual",
                          fontSize: 11,
                          fill: "#64748b",
                        }}
                      />
                    )}
                    <Bar dataKey="Real" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Simulado" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

// =============================================================================

function SimTile({
  label,
  value,
  hint,
  tooltip,
  tooltipAlign = "left",
  tone,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  tooltip?: React.ReactNode;
  tooltipAlign?: "left" | "right" | "center";
  tone?: "ok" | "warning" | "danger" | "neutral";
  highlight?: boolean;
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
    <div className={cn("rounded-xl border px-5 py-4 shadow-card min-w-0", cls)}>
      <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center">
        {label}
        {tooltip && <InfoTooltip align={tooltipAlign}>{tooltip}</InfoTooltip>}
      </div>
      <div className="text-2xl 2xl:text-xl font-semibold text-slate-900 mt-1 tabular whitespace-nowrap">
        {value}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function ResumenItem({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warning" | "danger";
}) {
  const valueCls =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-slate-900";
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={cn("text-lg font-semibold tabular mt-0.5", valueCls)}>
        {value}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
