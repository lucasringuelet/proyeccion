import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Settings,
  ScrollText,
  FlaskConical,
  LogOut,
  Menu,
  X,
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

function NavList({ onItemClick }: { onItemClick?: () => void }) {
  return (
    <nav className="flex-1 px-2 py-3 space-y-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onItemClick}
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
  );
}

export default function Layout() {
  const nav = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => nav("/login", { replace: true }),
  });

  // Cerrar drawer al cambiar de ruta y al presionar Esc
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen flex flex-col sm:flex-row">
      {/* Topbar mobile */}
      <header className="sm:hidden flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-md"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold text-slate-900">
          Proyección Vialidad
        </div>
        <div className="w-9" />
      </header>

      {/* Sidebar desktop */}
      <aside className="hidden sm:flex w-60 shrink-0 bg-white border-r border-slate-200 flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="text-sm uppercase tracking-wider text-slate-500">
            Vialidad PBA
          </div>
          <div className="text-base font-semibold text-slate-900 leading-tight mt-0.5">
            Proyección de Gastos
          </div>
        </div>
        <NavList />
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

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col shadow-xl animate-in slide-in-from-left">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Vialidad PBA
                </div>
                <div className="text-base font-semibold text-slate-900 leading-tight">
                  Proyección de Gastos
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onItemClick={() => setDrawerOpen(false)} />
            <div className="p-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  logout.mutate();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-x-hidden">
        <div className="max-w-[1400px] mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
