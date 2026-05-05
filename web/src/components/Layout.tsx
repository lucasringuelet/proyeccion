import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Settings,
  ScrollText,
  FlaskConical,
  LogOut,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/proyeccion", label: "Proyección", icon: LayoutDashboard },
  { to: "/simulador", label: "Simulador de obra", icon: FlaskConical },
  { to: "/archivos", label: "Archivos", icon: FileSpreadsheet },
  { to: "/configuracion", label: "Configuración", icon: Settings },
  { to: "/auditoria", label: "Auditoría", icon: ScrollText },
];

export default function Layout() {
  const nav = useNavigate();
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => nav("/login", { replace: true }),
  });

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="text-sm uppercase tracking-wider text-slate-500">
            Vialidad PBA
          </div>
          <div className="text-base font-semibold text-slate-900 leading-tight mt-0.5">
            Proyección de Gastos
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-slate-700 hover:bg-slate-100",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => logout.mutate()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="max-w-[1400px] mx-auto px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
