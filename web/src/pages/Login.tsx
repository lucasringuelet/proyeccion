import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { Lock } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: (pwd: string) =>
      api.post("/auth/login", { password: pwd.trim() }),
    onSuccess: () => {
      qc.setQueryData(["auth"], { authenticated: true });
      nav("/proyeccion", { replace: true });
    },
    onError: () => toast.error("Clave incorrecta"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardBody className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-brand-600 text-white flex items-center justify-center">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Vialidad PBA
              </div>
              <div className="text-lg font-semibold text-slate-900">
                Proyección de Gastos
              </div>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate(password);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="pwd">Clave de acceso</Label>
              <Input
                id="pwd"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresá la clave compartida"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={login.isPending || !password}
            >
              {login.isPending ? "Verificando…" : "Entrar"}
            </Button>
          </form>
          <p className="mt-6 text-xs text-slate-500 text-center">
            Acceso interno. Si no tenés la clave, pedila al equipo de Presupuesto.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
