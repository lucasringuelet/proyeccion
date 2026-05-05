// Motor de proyección — funciones puras, sin I/O.
// Todas las cantidades en pesos absolutos.

export type Months12 = number[]; // length 12, índices 0..11 (ene..dic)

export interface YearActuals {
  year: number;
  creditoDefinitivo: number;
  /** Ejecución real mes a mes; meses futuros pueden ser 0. */
  monthlyActual: Months12;
}

export interface ProjectionInput {
  /** Histórico cerrado (años previos completos). */
  history: YearActuals[];
  /** Año target con datos hasta `currentMonth` y ceros después. */
  current: YearActuals;
  /** Mes 1..12 (último mes con dato real, inclusive). */
  currentMonth: number;
}

export interface ProjectionResult {
  /** Perfil mensual histórico promedio (suma ≈ tasa de ejecución histórica, no 1.0). */
  historicalProfile: Months12;
  /** Real para m≤current; renormalizado para consumir saldo en m>current. Suma → creditoDef. */
  plan: Months12;
  /** Real para m≤current; perfil*creditoDef directo para m>current (puede no consumir saldo). */
  esperado: Months12;
  /** Saldo − Σ(esperado futuro). >0 = sobra plata (margen); <0 = no alcanza el ritmo. */
  margenEsperado: number;
  /** Saldo a la fecha (creditoDef − gastado YTD). */
  saldo: number;
  /** Σ(monthlyActual hasta currentMonth). */
  gastadoYTD: number;
  /** Tasa de ejecución proyectada con Plan = 1.0 por construcción si saldo > 0. */
  tasaEjecucionPlan: number;
  /** Tasa de ejecución proyectada con Esperado = (gastadoYTD + Σ esperado futuro) / creditoDef. */
  tasaEjecucionEsperado: number;
}

// =============================================================================
// Helpers
// =============================================================================

export function months12(): Months12 {
  return Array(12).fill(0);
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

// =============================================================================
// API pública
// =============================================================================

/** Perfil mensual de un año = monthly / creditoDefinitivo (no normalizado). */
export function computeMonthlyProfile(y: YearActuals): Months12 {
  if (y.creditoDefinitivo <= 0) return months12();
  return y.monthlyActual.map((v) => v / y.creditoDefinitivo);
}

/** Promedio simple de N perfiles, mes a mes. */
export function averageProfile(profiles: Months12[]): Months12 {
  if (profiles.length === 0) return months12();
  const out = months12();
  for (const p of profiles) {
    for (let i = 0; i < 12; i++) out[i] = (out[i] ?? 0) + (p[i] ?? 0);
  }
  return out.map((v) => v / profiles.length);
}

export function project(input: ProjectionInput): ProjectionResult {
  const { history, current, currentMonth } = input;
  if (currentMonth < 0 || currentMonth > 12) {
    throw new Error(`currentMonth fuera de rango: ${currentMonth}`);
  }

  const profiles = history.map(computeMonthlyProfile);
  const historicalProfile = averageProfile(profiles);

  const gastadoYTD = sum(current.monthlyActual.slice(0, currentMonth));
  const saldo = current.creditoDefinitivo - gastadoYTD;

  const plan = months12();
  const esperado = months12();

  // Pasado: real
  for (let m = 0; m < currentMonth; m++) {
    plan[m] = current.monthlyActual[m] ?? 0;
    esperado[m] = current.monthlyActual[m] ?? 0;
  }

  // Futuro
  const futureWeights: number[] = [];
  for (let m = currentMonth; m < 12; m++) {
    futureWeights.push(historicalProfile[m] ?? 0);
  }
  const sumWeights = sum(futureWeights);

  for (let i = 0; i < futureWeights.length; i++) {
    const m = currentMonth + i;
    // Esperado = perfil * creditoDef (directo, sin renormalizar)
    esperado[m] = (historicalProfile[m] ?? 0) * current.creditoDefinitivo;
    // Plan = saldo distribuido proporcional al perfil futuro (renormalizado a 1)
    if (sumWeights > 0) {
      plan[m] = saldo * ((futureWeights[i] ?? 0) / sumWeights);
    } else {
      // Sin perfil futuro (raro): repartir uniforme
      const remaining = 12 - currentMonth;
      plan[m] = remaining > 0 ? saldo / remaining : 0;
    }
  }

  const sumEsperadoFuturo = sum(esperado.slice(currentMonth));
  // Margen positivo = saldo > esperado = sobra plata (a favor)
  // Margen negativo = saldo < esperado = no alcanza al ritmo histórico
  const margenEsperado = saldo - sumEsperadoFuturo;

  const tasaEjecucionPlan =
    current.creditoDefinitivo > 0 ? sum(plan) / current.creditoDefinitivo : 0;
  const tasaEjecucionEsperado =
    current.creditoDefinitivo > 0
      ? (gastadoYTD + sumEsperadoFuturo) / current.creditoDefinitivo
      : 0;

  return {
    historicalProfile,
    plan,
    esperado,
    margenEsperado,
    saldo,
    gastadoYTD,
    tasaEjecucionPlan,
    tasaEjecucionEsperado,
  };
}

/** Suma horizontal de varios resultados de proyección (consolidado). */
export function consolidate(parts: ProjectionResult[]): {
  plan: Months12;
  esperado: Months12;
  gastadoYTD: number;
  saldo: number;
  margenEsperado: number;
} {
  const plan = months12();
  const esperado = months12();
  let gastadoYTD = 0;
  let saldo = 0;
  let margenEsperado = 0;
  for (const p of parts) {
    for (let i = 0; i < 12; i++) {
      plan[i] = (plan[i] ?? 0) + (p.plan[i] ?? 0);
      esperado[i] = (esperado[i] ?? 0) + (p.esperado[i] ?? 0);
    }
    gastadoYTD += p.gastadoYTD;
    saldo += p.saldo;
    margenEsperado += p.margenEsperado;
  }
  return { plan, esperado, gastadoYTD, saldo, margenEsperado };
}
