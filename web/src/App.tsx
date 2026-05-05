import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Files from "./pages/Files";
import FileAuditView from "./pages/FileAuditView";
import Audit from "./pages/Audit";
import Config from "./pages/Config";
import Projection from "./pages/Projection";
import ProgramDetail from "./pages/ProgramDetail";
import Simulador from "./pages/Simulador";
import { api } from "./lib/api";

function useAuth() {
  return useQuery({
    queryKey: ["auth"],
    queryFn: async () => (await api.get<{ authenticated: boolean }>("/auth/me")).data,
    staleTime: 60_000,
  });
}

function Protected({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <div className="p-8 text-slate-500">Cargando…</div>;
  if (!data?.authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/proyeccion" replace />} />
        <Route path="proyeccion" element={<Projection />} />
        <Route path="proyeccion/:slug/:segment" element={<ProgramDetail />} />
        <Route path="simulador" element={<Simulador />} />
        <Route path="archivos" element={<Files />} />
        <Route path="archivos/:id" element={<FileAuditView />} />
        <Route path="configuracion" element={<Config />} />
        <Route path="auditoria" element={<Audit />} />
      </Route>
    </Routes>
  );
}
