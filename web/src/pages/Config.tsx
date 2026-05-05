import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api, type Program, type ExcelFileRow, type Segment } from "@/lib/api";
import { MONTHS_LONG } from "@/lib/utils";

interface SettingsState {
  targetYear: number;
  baseYears: number[];
  currentMonthOverride: number | null; // null = autodetectar
  segmentSelection: Record<string, Segment[]>;
}

const DEFAULT_FAMILIA2_SEG: Segment[] = ["RENTA", "PRESTAMO"];

function defaultSettings(programs: Program[], availableYears: number[]): SettingsState {
  const target = availableYears[0] ?? new Date().getFullYear();
  const base = availableYears.filter((y) => y !== target).slice(0, 2);
  const seg: Record<string, Segment[]> = {};
  for (const p of programs) {
    seg[p.slug] = p.family === "FAMILIA1" ? ["SOLE"] : DEFAULT_FAMILIA2_SEG;
  }
  return {
    targetYear: target,
    baseYears: base,
    currentMonthOverride: null,
    segmentSelection: seg,
  };
}

export default function Config() {
  const qc = useQueryClient();
  const { data: programs = [] } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await api.get<Program[]>("/programs")).data,
  });
  const { data: files = [] } = useQuery({
    queryKey: ["files"],
    queryFn: async () => (await api.get<ExcelFileRow[]>("/files")).data,
  });
  const { data: settingsRemote } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<Record<string, unknown>>("/settings")).data,
  });

  const availableYears = useMemo(() => {
    const ys = Array.from(new Set(files.map((f) => f.year))).sort((a, b) => b - a);
    return ys;
  }, [files]);

  const [state, setState] = useState<SettingsState | null>(null);

  useEffect(() => {
    if (programs.length === 0 || availableYears.length === 0) return;
    if (state) return;
    const def = defaultSettings(programs, availableYears);
    if (settingsRemote && Object.keys(settingsRemote).length > 0) {
      setState({
        ...def,
        targetYear:
          (settingsRemote.targetYear as number | undefined) ?? def.targetYear,
        baseYears:
          (settingsRemote.baseYears as number[] | undefined) ?? def.baseYears,
        currentMonthOverride:
          (settingsRemote.currentMonthOverride as number | null | undefined) ??
          null,
        segmentSelection:
          (settingsRemote.segmentSelection as
            | Record<string, Segment[]>
            | undefined) ?? def.segmentSelection,
      });
    } else {
      setState(def);
    }
  }, [programs, availableYears, settingsRemote, state]);

  const persist = useMutation({
    mutationFn: async (patch: Partial<SettingsState>) => {
      for (const [key, value] of Object.entries(patch)) {
        await api.put("/settings", { key, value });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Guardado");
    },
  });

  if (!state) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500 mt-1">
          Subí al menos un archivo en <em>Archivos</em> antes de configurar la
          proyección.
        </p>
      </div>
    );
  }

  function update(patch: Partial<SettingsState>) {
    setState((s) => ({ ...(s as SettingsState), ...patch }));
  }

  function toggleBaseYear(year: number) {
    const has = state!.baseYears.includes(year);
    const next = has
      ? state!.baseYears.filter((y) => y !== year)
      : [...state!.baseYears, year];
    update({ baseYears: next });
  }

  function setSegment(slug: string, kind: "TOTAL" | "RENTA_PRESTAMO" | "OFF") {
    const next = { ...state!.segmentSelection };
    if (kind === "OFF") next[slug] = [];
    else if (kind === "TOTAL") next[slug] = ["TOTAL"];
    else next[slug] = ["RENTA", "PRESTAMO"];
    update({ segmentSelection: next });
  }

  function save() {
    persist.mutate({
      targetYear: state!.targetYear,
      baseYears: state!.baseYears,
      currentMonthOverride: state!.currentMonthOverride,
      segmentSelection: state!.segmentSelection,
    });
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Configuración</h1>
          <p className="text-sm text-slate-500 mt-1">
            Definí qué año proyectar, qué años usar como base histórica y qué
            segmento de cada programa va al consolidado.
          </p>
        </div>
        <Button onClick={save} disabled={persist.isPending} className="self-start sm:self-auto">
          {persist.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Año target</CardTitle>
            <CardDescription>El año que se proyecta.</CardDescription>
          </CardHeader>
          <CardBody>
            <Label>Año</Label>
            <Select
              className="w-full mt-1"
              value={state.targetYear}
              onChange={(e) => update({ targetYear: Number(e.target.value) })}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Años base históricos</CardTitle>
            <CardDescription>
              De acá sale el perfil mensual. Idealmente años cerrados.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-1.5">
            {availableYears
              .filter((y) => y !== state.targetYear)
              .map((y) => {
                const checked = state.baseYears.includes(y);
                return (
                  <label
                    key={y}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBaseYear(y)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>{y}</span>
                  </label>
                );
              })}
            {availableYears.filter((y) => y !== state.targetYear).length === 0 && (
              <p className="text-xs text-slate-500">
                Necesitás al menos un año adicional.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mes actual</CardTitle>
            <CardDescription>
              Hasta este mes el dato se considera real.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <Label>Mes</Label>
            <Select
              className="w-full mt-1"
              value={state.currentMonthOverride ?? "auto"}
              onChange={(e) => {
                const v = e.target.value;
                update({
                  currentMonthOverride: v === "auto" ? null : Number(v),
                });
              }}
            >
              <option value="auto">Autodetectar</option>
              {MONTHS_LONG.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m} ({i + 1})
                </option>
              ))}
            </Select>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Segmentos por programa</CardTitle>
          <CardDescription>
            Para programas con desglose, podés sumar Renta + Préstamo (default) o
            usar el Total agregado, pero no ambos a la vez para evitar duplicar.
          </CardDescription>
        </CardHeader>
        <CardBody className="p-0">
          {/* Desktop: tabla */}
          <table className="hidden sm:table w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-5 py-2.5 font-medium">Programa</th>
                <th className="px-5 py-2.5 font-medium">Familia</th>
                <th className="px-5 py-2.5 font-medium">Selección</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => {
                const sel = state.segmentSelection[p.slug] ?? [];
                const hasTotal = sel.includes("TOTAL");
                const hasRP = sel.includes("RENTA") || sel.includes("PRESTAMO");
                const hasSole = sel.includes("SOLE");
                return (
                  <tr key={p.slug} className="border-b border-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {p.name}
                    </td>
                    <td className="px-5 py-3">
                      {p.family === "FAMILIA1" ? (
                        <Badge tone="neutral">Sin desglose</Badge>
                      ) : (
                        <Badge tone="info">Con desglose</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {p.family === "FAMILIA1" ? (
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={hasSole}
                            onChange={() =>
                              setSegment(
                                p.slug,
                                hasSole ? "OFF" : "RENTA_PRESTAMO",
                              )
                            }
                            className="rounded border-slate-300 text-brand-600"
                          />
                          Incluir
                        </label>
                      ) : (
                        <div className="flex items-center gap-4">
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={`seg-${p.slug}`}
                              checked={hasRP && !hasTotal}
                              onChange={() => setSegment(p.slug, "RENTA_PRESTAMO")}
                            />
                            Renta + Préstamo
                          </label>
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={`seg-${p.slug}`}
                              checked={hasTotal}
                              onChange={() => setSegment(p.slug, "TOTAL")}
                            />
                            Total
                          </label>
                          <label className="inline-flex items-center gap-2 text-sm text-slate-500">
                            <input
                              type="radio"
                              name={`seg-${p.slug}`}
                              checked={!hasRP && !hasTotal}
                              onChange={() => setSegment(p.slug, "OFF")}
                            />
                            No incluir
                          </label>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile: cards apiladas */}
          <div className="sm:hidden divide-y divide-slate-100">
            {programs.map((p) => {
              const sel = state.segmentSelection[p.slug] ?? [];
              const hasTotal = sel.includes("TOTAL");
              const hasRP = sel.includes("RENTA") || sel.includes("PRESTAMO");
              const hasSole = sel.includes("SOLE");
              return (
                <div key={p.slug} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    {p.family === "FAMILIA1" ? (
                      <Badge tone="neutral">Sin desglose</Badge>
                    ) : (
                      <Badge tone="info">Con desglose</Badge>
                    )}
                  </div>
                  {p.family === "FAMILIA1" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={hasSole}
                        onChange={() =>
                          setSegment(p.slug, hasSole ? "OFF" : "RENTA_PRESTAMO")
                        }
                        className="rounded border-slate-300 text-brand-600"
                      />
                      Incluir
                    </label>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`seg-mob-${p.slug}`}
                          checked={hasRP && !hasTotal}
                          onChange={() => setSegment(p.slug, "RENTA_PRESTAMO")}
                        />
                        Renta + Préstamo
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`seg-mob-${p.slug}`}
                          checked={hasTotal}
                          onChange={() => setSegment(p.slug, "TOTAL")}
                        />
                        Total
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-500">
                        <input
                          type="radio"
                          name={`seg-mob-${p.slug}`}
                          checked={!hasRP && !hasTotal}
                          onChange={() => setSegment(p.slug, "OFF")}
                        />
                        No incluir
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
