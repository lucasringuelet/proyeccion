import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Upload, FileSpreadsheet, Trash2, Eye, AlertTriangle } from "lucide-react";
import { api, type ExcelFileRow } from "@/lib/api";
import { fmtMoneyCompact } from "@/lib/utils";

export default function Files() {
  const qc = useQueryClient();
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: async () => (await api.get<ExcelFileRow[]>("/files")).data,
  });

  const upload = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return (await api.post("/files", fd)).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["files"] });
      const replacedName = data?.replaced?.[0]?.originalName as string | undefined;
      const warnCount = data?.warnings?.length ?? 0;
      if (data?.deduped) {
        toast.success("Archivo ya estaba cargado (mismo contenido).");
      } else if (replacedName) {
        const suffix = warnCount > 0 ? ` (con ${warnCount} aviso${warnCount === 1 ? "" : "s"})` : "";
        toast.success(`Se reemplazó "${replacedName}"${suffix}.`);
      } else if (warnCount > 0) {
        toast(`Procesado con ${warnCount} aviso(s).`, { icon: "⚠️" });
      } else {
        toast.success("Archivo procesado correctamente.");
      }
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      const baseMsg = data?.error ?? "Error al procesar archivo";
      const parseErrors = data?.parseErrors as
        | Array<{ programSlug?: string; segment?: string; message: string }>
        | undefined;
      if (parseErrors && parseErrors.length > 0) {
        const lines = parseErrors
          .slice(0, 5)
          .map((e) => `• [${e.programSlug ?? "?"}] ${e.message}`);
        const more = parseErrors.length > 5 ? `\n…y ${parseErrors.length - 5} más` : "";
        toast.error(`${baseMsg}\n\n${lines.join("\n")}${more}`, {
          duration: 12000,
          style: { maxWidth: "520px", whiteSpace: "pre-line" },
        });
      } else {
        toast.error(baseMsg);
      }
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });

  function handleFiles(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach((f) => upload.mutate(f));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Archivos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Subí los .xls de cada año. La app extrae los datos de las 6 solapas
            relevantes y los persiste para proyectar.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className={
          "rounded-xl border-2 border-dashed transition-colors cursor-pointer mb-6 " +
          (drag
            ? "border-brand-500 bg-brand-50"
            : "border-slate-300 bg-slate-50 hover:bg-slate-100")
        }
      >
        <div className="p-10 text-center">
          <Upload className="mx-auto h-8 w-8 text-slate-500 mb-3" />
          <div className="text-sm text-slate-700 font-medium">
            Arrastrá un .xls acá o hacé click para elegir
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Filename esperado: <code>RECURSOS Y EROGACIONES YYYY*.xls</code>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Archivos cargados</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6 text-slate-500 text-sm">Cargando…</div>
          ) : files.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">
              No hay archivos cargados todavía.
            </div>
          ) : (
            <>
              {/* Desktop: tabla */}
              <table className="hidden sm:table w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Año</th>
                    <th className="px-5 py-2.5 font-medium">Archivo</th>
                    <th className="px-5 py-2.5 font-medium">Tamaño</th>
                    <th className="px-5 py-2.5 font-medium">Subido</th>
                    <th className="px-5 py-2.5 font-medium">Estado</th>
                    <th className="px-5 py-2.5 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium tabular">{f.year}</td>
                      <td className="px-5 py-3 text-slate-700">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                          {f.originalName}
                        </div>
                      </td>
                      <td className="px-5 py-3 tabular text-slate-500">
                        {fmtMoneyCompact(f.sizeBytes).replace("$ ", "")} B
                      </td>
                      <td className="px-5 py-3 text-slate-500 tabular">
                        {new Date(f.uploadedAt).toLocaleString("es-AR")}
                      </td>
                      <td className="px-5 py-3">
                        {f.status === "OK" ? (
                          <Badge tone="ok">OK</Badge>
                        ) : f.status === "WARNING" ? (
                          <Badge tone="warning">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Avisos
                          </Badge>
                        ) : (
                          <Badge tone="danger">Error</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/archivos/${f.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                              Auditoría
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Eliminar ${f.originalName}?`)) {
                                del.mutate(f.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: cards apiladas */}
              <div className="sm:hidden divide-y divide-slate-100">
                {files.map((f) => (
                  <div key={f.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900 break-words">
                            {f.originalName}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 tabular">
                            {f.year} · {fmtMoneyCompact(f.sizeBytes).replace("$ ", "")} B ·{" "}
                            {new Date(f.uploadedAt).toLocaleDateString("es-AR")}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {f.status === "OK" ? (
                          <Badge tone="ok">OK</Badge>
                        ) : f.status === "WARNING" ? (
                          <Badge tone="warning">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Avisos
                          </Badge>
                        ) : (
                          <Badge tone="danger">Error</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Link to={`/archivos/${f.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <Eye className="h-4 w-4" />
                          Auditoría
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Eliminar ${f.originalName}?`)) {
                            del.mutate(f.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
