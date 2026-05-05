import { describe, it, expect } from "vitest";
import {
  averageProfile,
  computeMonthlyProfile,
  consolidate,
  project,
  type YearActuals,
} from "./projection.js";

function ya(year: number, cd: number, monthly: number[]): YearActuals {
  return { year, creditoDefinitivo: cd, monthlyActual: monthly };
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("projection — comportamiento básico", () => {
  it("perfil mensual = monthly / creditoDef", () => {
    const p = computeMonthlyProfile(
      ya(2024, 1000, [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    );
    expect(p[0]).toBeCloseTo(0.1, 6);
    expect(p[1]).toBe(0);
  });

  it("Plan en meses futuros suma exactamente al saldo", () => {
    const history = [
      ya(2024, 1000, [50, 50, 50, 50, 100, 100, 100, 100, 100, 50, 50, 0]),
      ya(2025, 1000, [40, 60, 60, 40, 80, 100, 120, 80, 80, 60, 60, 20]),
    ];
    const current = ya(2026, 1200, [30, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const r = project({ history, current, currentMonth: 2 });
    expect(r.gastadoYTD).toBe(70);
    expect(r.saldo).toBe(1130);
    const futureSum = sum(r.plan.slice(2));
    expect(futureSum).toBeCloseTo(1130, 4);
  });

  it("Plan respeta el dato real en meses pasados", () => {
    const history = [
      ya(2024, 1000, [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 40]),
    ];
    const current = ya(2026, 1500, [100, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const r = project({ history, current, currentMonth: 2 });
    expect(r.plan[0]).toBe(100);
    expect(r.plan[1]).toBe(200);
  });

  it("Margen positivo cuando el ritmo histórico no alcanza para el crédito vigente", () => {
    // Histórico ejecuta ~80% del crédito; crédito 2026 sube fuerte → margen > 0
    // (saldo > esperado, sobra plata = sub-ejecución potencial pero "a favor" en términos monetarios)
    const history = [
      ya(2024, 1000, [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 0, 0]),
      ya(2025, 1000, [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 0, 0]),
    ];
    const current = ya(2026, 2000, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const r = project({ history, current, currentMonth: 0 });
    expect(r.margenEsperado).toBeGreaterThan(0);
    expect(r.tasaEjecucionEsperado).toBeCloseTo(0.8, 2);
    expect(r.tasaEjecucionPlan).toBeCloseTo(1.0, 4);
  });

  it("consolidate suma correctamente Plan/Esperado", () => {
    const history = [ya(2025, 100, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 0, 0])];
    const current = ya(2026, 200, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const r1 = project({ history, current, currentMonth: 0 });
    const r2 = project({ history, current, currentMonth: 0 });
    const c = consolidate([r1, r2]);
    expect(c.saldo).toBe(400);
    expect(sum(c.plan)).toBeCloseTo(400, 4);
  });

  it("averageProfile vacío devuelve ceros", () => {
    expect(averageProfile([])).toEqual(Array(12).fill(0));
  });
});
