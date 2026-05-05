import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";
import { api, type FileAudit } from "@/lib/api";
import { fmtMoney, MONTHS_ES } from "@/lib/utils";

export default function FileAuditView() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["file-audit", id],
    queryFn: async () =>
      (await api.get<FileAudit>(`/files/${id}/audit`)).data,
    enabled: !!id,
  });

  if (isLoading) return <div className="text-slate-500">Cargando…</div>;
  if (!data) return <div className="text-slate-500">No encontrado</div>;

  return (
    <div>
      <Link to="/archivos" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
        <ArrowLeft className="h-4 w-4" /> Archivos
      </Link>

      <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 break-words">
        Auditoría: {data.originalName}
      </h1>
      <p className="text-sm text-slate-500 mt-1">
        Año {data.year} · subido el {new Date(data.uploadedAt).toLocaleString("es-AR")}
      </p>

      {data.parserAudit.warnings.length > 0 && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Avisos del parser ({data.parserAudit.warnings.length})</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5">
            {data.parserAudit.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <Badge
                  tone={
                    w.level === "error"
                      ? "danger"
                      : w.level === "warning"
                        ? "warning"
                        : "info"
                  }
                  className="shrink-0"
                >
                  {w.level}
                </Badge>
                <span className="text-slate-700">
                  {w.programSlug && (
                    <span className="font-medium text-slate-900">
                      [{w.programSlug}
                      {w.segment ? `/${w.segment}` : ""}]{" "}
                    </span>
                  )}
                  {w.message}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {data.parserAudit.unmappedSheets.length > 0 && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Solapas ignoradas</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-500 mb-2">
              Estas solapas existen en el Excel pero no corresponden a ninguno de
              los 6 programas que la app procesa, así que se descartan.
            </p>
            <div className="flex flex-wrap gap-2">
              {data.parserAudit.unmappedSheets.map((s) => (
                <Badge key={s} tone="neutral">
                  {s}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Datos extraídos por programa</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {/* Desktop: tabla */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-2 font-medium">Programa</th>
                  <th className="px-4 py-2 font-medium">Segmento</th>
                  <th className="px-4 py-2 font-medium">Solapa</th>
                  <th className="px-4 py-2 font-medium">Fila</th>
                  <th className="px-4 py-2 font-medium text-right">Crédito Definitivo</th>
                  <th className="px-4 py-2 font-medium text-right">Gastado YTD</th>
                  <th className="px-4 py-2 font-medium text-right">Saldos</th>
                </tr>
              </thead>
              <tbody>
                {data.extractions.map((e) => (
                  <tr key={`${e.programSlug}-${e.segment}`} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {e.programName}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={e.segment === "RENTA" ? "info" : e.segment === "PRESTAMO" ? "warning" : "neutral"}>
                        {e.segment}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{e.source.sheet}</td>
                    <td className="px-4 py-2 text-slate-500 tabular">
                      {(e.source as any).totalRow >= 0
                        ? `R${(e.source as any).totalRow + 1}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular">{fmtMoney(e.creditoDefinitivo)}</td>
                    <td className="px-4 py-2 text-right tabular">{fmtMoney(e.gastadoAcumulado)}</td>
                    <td className="px-4 py-2 text-right tabular">{fmtMoney(e.saldos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards apiladas */}
          <div className="sm:hidden divide-y divide-slate-100">
            {data.extractions.map((e) => (
              <div key={`${e.programSlug}-${e.segment}-card`} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-slate-900">{e.programName}</div>
                  <Badge tone={e.segment === "RENTA" ? "info" : e.segment === "PRESTAMO" ? "warning" : "neutral"}>
                    {e.segment}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500">
                  Solapa: <span className="text-slate-700">{e.source.sheet}</span>
                  {(e.source as any).totalRow >= 0 && (
                    <span className="ml-2 tabular">· R{(e.source as any).totalRow + 1}</span>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm pt-1">
                  <dt className="text-slate-500">Crédito Def.</dt>
                  <dd className="text-right tabular">{fmtMoney(e.creditoDefinitivo)}</dd>
                  <dt className="text-slate-500">Gastado YTD</dt>
                  <dd className="text-right tabular">{fmtMoney(e.gastadoAcumulado)}</dd>
                  <dt className="text-slate-500">Saldos</dt>
                  <dd className="text-right tabular">{fmtMoney(e.saldos)}</dd>
                </dl>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Detalle mensual</CardTitle>
        </CardHeader>
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-xs sm:text-sm tabular">
            <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-3 py-2 font-medium sticky left-0 bg-slate-50">Programa / Segmento</th>
                {MONTHS_ES.map((m) => (
                  <th key={m} className="px-3 py-2 font-medium text-right">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.extractions.map((e) => (
                <tr key={`${e.programSlug}-${e.segment}-m`} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 bg-white">
                    {e.programName} <span className="text-slate-400 text-xs">/ {e.segment}</span>
                  </td>
                  {e.months.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right text-slate-600">
                      {v > 0 ? fmtMoney(v).replace("$ ", "") : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
