import { Link } from "react-router-dom";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  BookOpen,
  Calculator,
  TrendingUp,
  TrendingDown,
  Equal,
  FileSearch,
  Layers,
  Download,
  RefreshCw,
} from "lucide-react";

export default function Audit() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Auditoría y metodología
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Cómo se calcula cada número, qué significa cada métrica y cómo
          rastrear cualquier cifra hasta el Excel original.
        </p>
      </div>

      {/* === IDEA CENTRAL ============================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-600" />
            <CardTitle>Idea central</CardTitle>
          </div>
          <CardDescription>
            La proyección parte del supuesto de que cada programa gasta cada año
            con un patrón mensual parecido al patrón histórico.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-slate-700 leading-relaxed">
          <p>
            Para cada uno de los 6 programas la app responde dos preguntas, mes
            a mes:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              <strong>¿Cómo conviene repartir el saldo restante</strong> entre los
              meses que faltan, para llegar a fin de año habiendo gastado todo
              el crédito? <span className="text-slate-500">→ Plan.</span>
            </li>
            <li>
              <strong>¿Qué pasaría si me ejecuto al ritmo de los años
              anteriores</strong> sin forzar nada?{" "}
              <span className="text-slate-500">→ Esperado.</span>
            </li>
          </ol>
          <p>
            La diferencia entre las dos proyecciones es la métrica más
            importante: te dice si hay que acelerar (ritmo histórico no
            alcanza) o si sobra margen (ritmo histórico se pasa).
          </p>
        </CardBody>
      </Card>

      {/* === PERFIL MENSUAL ============================================ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-brand-600" />
            <CardTitle>Paso 1 — Perfil mensual histórico</CardTitle>
          </div>
          <CardDescription>
            La pieza clave. Cómo se distribuye el gasto a lo largo del año,
            expresado como % del crédito anual.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <p>
            Tomamos un programa cualquiera (ej. <em>BID 4416</em>) en un año
            cerrado (ej. 2025) y armamos una tabla con el % que cada mes
            representó sobre el crédito anual:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular border border-slate-200 rounded-md">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Mes</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Gastado en 2025
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    % sobre crédito
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50/50">
                  <td className="px-3 py-2 font-medium">Crédito def. 2025</td>
                  <td className="px-3 py-2 text-right">$ 100</td>
                  <td className="px-3 py-2 text-right text-slate-400">—</td>
                </tr>
                {[
                  ["Enero", 5],
                  ["Febrero", 8],
                  ["Marzo", 10],
                  ["Abril", 7],
                  ["Mayo", 9],
                  ["Junio", 9],
                  ["Julio", 7],
                  ["Agosto", 5],
                  ["Septiembre", 6],
                  ["Octubre", 5],
                  ["Noviembre", 4],
                  ["Diciembre", 3],
                ].map(([m, v]) => (
                  <tr key={m as string} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{m}</td>
                    <td className="px-3 py-1.5 text-right">$ {v}</td>
                    <td className="px-3 py-1.5 text-right">{v}%</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
                  <td className="px-3 py-2">Total ejecutado</td>
                  <td className="px-3 py-2 text-right">$ 78</td>
                  <td className="px-3 py-2 text-right">78%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm">
            <strong className="text-amber-900">Detalle clave:</strong>{" "}
            <span className="text-amber-900">
              el perfil <em>no</em> suma 100%. Suma la <strong>tasa real de
              ejecución del año</strong> (acá 78%). Si en 2025 sobró un 22% del
              crédito sin gastar, eso queda reflejado en el perfil — y el
              cálculo de Esperado lo va a respetar.
            </span>
          </div>

          <p>
            Si elegís <strong>varios años base</strong> (ej. 2024 + 2025), la
            app calcula el perfil de cada uno y hace el{" "}
            <strong>promedio simple mes a mes</strong>:
          </p>
          <pre className="bg-slate-900 text-slate-100 text-xs rounded-md p-3 overflow-x-auto">
{`profile_avg[mes] = (profile_2024[mes] + profile_2025[mes]) / 2`}
          </pre>
        </CardBody>
      </Card>

      {/* === EJEMPLO ============================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-brand-600" />
            <CardTitle>Paso 2 — Cálculo paso a paso</CardTitle>
          </div>
          <CardDescription>
            Imaginá que estamos a fin de abril 2026 y BID 4416 tiene este
            estado.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase text-slate-500">
                Crédito definitivo 2026
              </div>
              <div className="text-xl font-semibold tabular text-slate-900">
                $ 200
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                típicamente más alto que 2025
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase text-slate-500">
                Gastado real ene-abr
              </div>
              <div className="text-xl font-semibold tabular text-slate-900">
                $ 33
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Ene 5 + Feb 9 + Mar 11 + Abr 8
              </div>
            </div>
            <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3">
              <div className="text-xs uppercase text-brand-700">
                Saldo restante
              </div>
              <div className="text-xl font-semibold tabular text-brand-900">
                $ 167
              </div>
              <div className="text-xs text-brand-700 mt-0.5">
                = 200 − 33
              </div>
            </div>
          </div>

          {/* Plan */}
          <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge tone="info">Plan</Badge>
              <span className="font-medium text-slate-900">
                Reparto del saldo siguiendo la forma del histórico
              </span>
            </div>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Para los meses <strong>pasados</strong> (ene-abr), el dato real
                se mantiene tal cual.
              </li>
              <li>
                Para los meses <strong>futuros</strong> (may-dic), tomamos los %
                de 2025 y los <strong>renormalizamos</strong> para que sumen
                100% del saldo:
                <pre className="mt-2 bg-slate-900 text-slate-100 text-xs rounded-md p-3 overflow-x-auto">
{`Suma de % may-dic en 2025 = 9+9+7+5+6+5+4+3 = 48%

Mayo       = 167 × (9 / 48) = $ 31,3
Junio      = 167 × (9 / 48) = $ 31,3
Julio      = 167 × (7 / 48) = $ 24,4
Agosto     = 167 × (5 / 48) = $ 17,4
Septiembre = 167 × (6 / 48) = $ 20,9
Octubre    = 167 × (5 / 48) = $ 17,4
Noviembre  = 167 × (4 / 48) = $ 13,9
Diciembre  = 167 × (3 / 48) = $ 10,4
                              ────────
                              $ 167   ✓`}
                </pre>
              </li>
              <li>
                Por construcción <strong>Σ Plan = Crédito Definitivo</strong>.
                Tasa de ejecución del Plan = <strong>100%</strong>.
              </li>
            </ol>
            <p className="mt-3 text-slate-600">
              Esto es lo que se le anticipa a Tesorería: "en mayo voy a
              necesitar $31,3, en junio $31,3, etc."
            </p>
          </div>

          {/* Esperado */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge tone="warning">Esperado</Badge>
              <span className="font-medium text-slate-900">
                Aplicar el perfil histórico directo, sin reescalar
              </span>
            </div>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Pasado: igual al Plan, los datos reales.
              </li>
              <li>
                Futuro: aplicamos los % de 2025 <strong>directos al crédito
                2026</strong>, sin renormalizar:
                <pre className="mt-2 bg-slate-900 text-slate-100 text-xs rounded-md p-3 overflow-x-auto">
{`Mayo       = 200 × 9% = $ 18
Junio      = 200 × 9% = $ 18
Julio      = 200 × 7% = $ 14
Agosto     = 200 × 5% = $ 10
Septiembre = 200 × 6% = $ 12
Octubre    = 200 × 5% = $ 10
Noviembre  = 200 × 4% = $  8
Diciembre  = 200 × 3% = $  6
                       ──────
                       $ 96`}
                </pre>
              </li>
              <li>
                Σ Esperado = $33 (real) + $96 (futuro) = <strong>$129</strong>.
                Tasa de ejecución Esperado ={" "}
                <strong>129 / 200 = 64,5%</strong>.
              </li>
            </ol>
            <p className="mt-3 text-slate-600">
              No se garantiza llegar al 100%: depende de si el ritmo histórico
              alcanza para el crédito vigente. Acá deja <strong>$71 sin
              ejecutar</strong> — eso se traduce en un Margen de{" "}
              <span className="text-emerald-700 font-medium">+$71</span> (a
              favor).
            </p>
          </div>
        </CardBody>
      </Card>

      {/* === MARGEN =================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand-600" />
            <CardTitle>Paso 3 — El Margen (la métrica que dispara decisiones)</CardTitle>
          </div>
          <CardDescription>
            Es la diferencia entre lo que queda por ejecutar (saldo) y lo que
            el ritmo histórico va a ejecutar.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-slate-700 leading-relaxed">
          <pre className="bg-slate-900 text-slate-100 text-xs rounded-md p-3 overflow-x-auto">
{`Margen = Saldo − Σ Esperado futuro`}
          </pre>
          <p>
            La convención de signos es la natural: <strong>positivo = a favor</strong>{" "}
            (sobra plata), <strong>negativo = en contra</strong> (no alcanza). Tres
            lecturas posibles:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-700" />
                <strong className="text-emerald-900">Margen positivo</strong>
              </div>
              <div className="text-xs text-emerald-900 mb-1">
                Saldo &gt; Esperado
              </div>
              <p className="text-slate-700 text-sm">
                Sobra plata. Al ritmo histórico no se llega a usar todo el
                crédito. <em>Subejecución potencial.</em> Hay que acelerar
                licitaciones o pedir reasignación.
              </p>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50/60 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingDown className="h-4 w-4 text-red-700" />
                <strong className="text-red-900">Margen negativo</strong>
              </div>
              <div className="text-xs text-red-900 mb-1">
                Saldo &lt; Esperado
              </div>
              <p className="text-slate-700 text-sm">
                Falta plata. Al ritmo histórico el saldo se consume antes de
                fin de año. <em>Sobre-ejecución potencial.</em> Hay que pedir
                ampliación o frenar adjudicaciones.
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Equal className="h-4 w-4 text-slate-600" />
                <strong className="text-slate-900">Margen ≈ 0</strong>
              </div>
              <div className="text-xs text-slate-600 mb-1">
                Saldo ≈ Esperado
              </div>
              <p className="text-slate-700 text-sm">
                El ritmo histórico está bien calibrado para el crédito
                vigente. No requiere acción.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* === CONSOLIDADO ============================================== */}
      <Card>
        <CardHeader>
          <CardTitle>Cómo se calcula el consolidado</CardTitle>
          <CardDescription>
            La proyección se hace por programa-segmento por separado. El
            consolidado es la suma de todas las que el usuario eligió incluir.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-slate-700 leading-relaxed">
          <p>
            Cada programa con desglose (BID 4416, BID 5418, CAF 11, FONPLATA)
            se proyecta dos veces por separado: una para Renta Generales y
            otra para el Préstamo. Esto es porque cada porción se ejecuta a un
            ritmo distinto.
          </p>
          <div className="rounded-md border-l-4 border-brand-400 bg-brand-50 p-3">
            <strong className="text-brand-900">Regla de exclusión mutua:</strong>{" "}
            <span className="text-brand-900">
              en programas con desglose, podés sumar Renta + Préstamo (default,
              recomendado) <em>o</em> usar el Total agregado, pero no las tres
              líneas a la vez — si no estarías sumando el mismo dinero dos
              veces. La UI no te deja hacerlo: los radio buttons en{" "}
              <Link to="/configuracion" className="underline">
                Configuración
              </Link>{" "}
              fuerzan la exclusión.
            </span>
          </div>
        </CardBody>
      </Card>

      {/* === PROYECCIÓN POR OBRA ====================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-brand-600" />
            <CardTitle>Proyección por obra (export configurable)</CardTitle>
          </div>
          <CardDescription>
            Plan / Esperado son cálculos a nivel programa-segmento. Para tener una
            proyección mensual <em>obra por obra</em>, el botón "Exportar Excel"
            genera una hoja extra donde vos definís cómo se va a consumir el
            saldo de cada obra mes a mes.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <p>
            Al hacer click en <strong>Exportar Excel</strong> se abre un modal
            con una grilla de configuración: una fila por cada{" "}
            <strong>fuente de financiamiento</strong> (combinación
            programa+segmento — ej. BID 4416/Renta, BID 4416/Préstamo, FF 11,
            etc.) y una columna por cada <strong>mes futuro</strong> (a partir
            de Mes Actual + 1). En cada celda ingresás un porcentaje.
          </p>

          <div className="rounded-md border-l-4 border-brand-400 bg-brand-50 p-3">
            <strong className="text-brand-900">Regla de cálculo:</strong>{" "}
            <span className="text-brand-900">
              decay multiplicativo sobre el saldo remanente. Cada mes, la obra
              consume el porcentaje que vos definiste sobre lo que le quedaba
              <em> al cierre del mes anterior</em>.
            </span>
          </div>

          <p>
            Para cada obra del año target:
          </p>
          <pre className="bg-slate-900 text-slate-100 text-xs rounded-md p-3 overflow-x-auto">
{`saldo  = obra.saldoActual                        // viene del Excel
para cada mes futuro m (Mes Actual + 1 .. Diciembre):
  pct   = pctMatrix[programa][segmento][m] / 100  // saturado entre 0 y 1
  gasto = saldo × pct
  proy[m] = gasto
  saldo = max(0, saldo − gasto)                   // nunca negativo

TotalProyectado = Σ proy[m]
SaldoFinal      = saldoActual − TotalProyectado`}
          </pre>

          <p className="text-slate-600">
            Ejemplo: obra con saldo $100 y un 10% uniforme cada mes futuro a
            partir de mayo (8 meses). Mayo gasta 10% de $100 = $10 (queda $90),
            junio gasta 10% de $90 = $9 (queda $81), etc. El total proyectado
            converge pero <em>nunca</em> agota el saldo (decay exponencial). Si
            ponés 100% en un mes, ese mes consume todo lo que queda y los meses
            siguientes dan $0 automáticamente.
          </p>

          <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm">
            <strong className="text-amber-900">Diferencia con Plan/Esperado:</strong>{" "}
            <span className="text-amber-900">
              Plan y Esperado se calculan automáticamente a partir del histórico
              y operan sobre el agregado del programa-segmento (no por obra).
              Esta proyección por obra es <strong>manual</strong> — vos decidís
              el ritmo de gasto de cada fuente, mes a mes — y se calcula
              recién al apretar Exportar.
            </span>
          </div>

          <p>
            La hoja resultante <strong>"Obras"</strong> trae, por cada obra:
            programa, segmento, expediente, PRY, CUOV, concepto, crédito
            definitivo, gastado YTD, saldo actual, las columnas de los meses
            futuros con la proyección, total proyectado y saldo final
            (saldoActual − totalProyectado).
          </p>
        </CardBody>
      </Card>

      {/* === REEMPLAZO POR AÑO ======================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-brand-600" />
            <CardTitle>Un solo archivo por año</CardTitle>
          </div>
          <CardDescription>
            Cómo se actualizan los datos cuando se sube una versión nueva del
            mismo año.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-slate-700 leading-relaxed">
          <p>
            La app garantiza por base de datos que <strong>solo puede haber un
            Excel por año</strong>. Cuando subís un archivo nuevo del 2026 (con
            datos actualizados, p.ej. al cierre de un mes nuevo), pasa esto:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              El parser corre sobre el archivo nuevo. Si falla, no se toca nada.
            </li>
            <li>
              Si el parseo es OK, se borra el registro viejo del 2026{" "}
              (con todos sus <code>ProgramYearData</code> y{" "}
              <code>Obra</code> en cascada) y se inserta el nuevo en una sola
              transacción.
            </li>
            <li>
              El .xls físico viejo se elimina del disco; queda solo el más
              reciente.
            </li>
            <li>
              El registro de auditoría queda como <code>REPLACE_FILE</code> con
              el nombre del archivo viejo y el del nuevo.
            </li>
          </ol>
          <p className="text-slate-600">
            Esto significa que la base nunca acumula versiones — siempre refleja
            el snapshot del último archivo subido por año. Si subís el mismo
            archivo (mismos bytes) dos veces, el sistema lo detecta por hash
            SHA-256 y no hace nada.
          </p>
        </CardBody>
      </Card>

      {/* === TRAZABILIDAD ============================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-brand-600" />
            <CardTitle>Trazabilidad de los datos</CardTitle>
          </div>
          <CardDescription>
            Cada cifra que ves en la app proviene de una fila y columna
            concretas del Excel original. Para auditarla:
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-slate-700 leading-relaxed">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Andá a{" "}
              <Link to="/archivos" className="text-brand-700 underline">
                Archivos
              </Link>{" "}
              y abrí el detalle de auditoría del Excel correspondiente.
            </li>
            <li>
              Ahí ves <strong>qué solapa matcheó cada programa</strong>, qué
              fila "Total P.P." se interpretó como Renta, Préstamo o Total y
              qué columnas se reconocieron como ENERO..DICIEMBRE.
            </li>
            <li>
              También vas a ver <strong>validaciones cruzadas</strong> automáticas:
              Renta + Préstamo ≈ Total, Σ(meses) ≈ Gastado Acumulado, Saldos ≈
              Crédito Definitivo − Gastado.
            </li>
            <li>
              Las solapas del Excel que no son ninguno de los 6 programas
              (RESUMEN, BIRF, FORMO, etc.) se descartan y aparecen listadas en
              la auditoría.
            </li>
          </ol>
          <div className="rounded-md border-l-4 border-slate-400 bg-slate-50 p-3 mt-3">
            <strong className="text-slate-900">El parser no confía en:</strong>
            <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-700">
              <li>
                Los <em>nombres de solapa</em> (el archivo 2026 conserva
                "Obras 2025 FF 11").
              </li>
              <li>
                Las <em>posiciones de columnas</em> (cada solapa tiene su
                propio layout).
              </li>
              <li>
                Los rótulos <code>F.F. 1.1 / 1.2</code> (vienen con typos en
                BID 5418 y CAF 11).
              </li>
            </ul>
            <strong className="text-slate-900 block mt-2">Lo que sí usa para clasificar:</strong>
            <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-700">
              <li>El filename para detectar el año.</li>
              <li>
                Los textos de header (CONCEPTO, CRÉDITO DEFINITIVO, los nombres
                de los meses) para mapear columnas.
              </li>
              <li>
                El texto del concepto ("Rentas Generales", "BID/CAF/FONPLATA",
                "Recursos", "ECONOMIA") para clasificar bloques en RENTA vs
                PRÉSTAMO.
              </li>
            </ul>
          </div>
          <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 p-3 mt-3">
            <strong className="text-emerald-900">Filas ocultas:</strong>{" "}
            <span className="text-emerald-900">
              el parser ignora las filas marcadas como <em>hidden</em> en Excel.
              Esto evita que aparezcan en la app obras "fantasma" — filas que
              quedaron en el .xls de ejercicios anteriores y que el equipo
              esconde manualmente para limpiar la vista.
            </span>
          </div>
        </CardBody>
      </Card>

      {/* === GLOSARIO ================================================= */}
      <Card>
        <CardHeader>
          <CardTitle>Glosario rápido</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Crédito Original", "Presupuesto inicial sancionado por la legislatura al comienzo del ejercicio."],
                ["Crédito Definitivo", "Presupuesto vigente al día de hoy, después de modificaciones presupuestarias. Es el número que se usa para proyectar."],
                ["Gastado Acumulado / YTD", "Lo que ya se ejecutó (devengado) desde el 1° de enero hasta el mes actual."],
                ["Saldo", "Crédito Definitivo − Gastado Acumulado. Lo que queda por ejecutar."],
                ["Mes actual", "Último mes con dato real. Hasta ese mes se lee del Excel; a partir del siguiente, la app proyecta."],
                ["Perfil mensual", "% del crédito anual que cada mes representó en un año pasado. No suma 100% — suma la tasa de ejecución del año."],
                ["Plan", "Cuánto se va a gastar cada mes futuro asumiendo que el saldo se reparte siguiendo la forma del histórico, renormalizado para sumar el saldo entero. Por construcción cierra a 100% del crédito en diciembre."],
                ["Esperado", "Cuánto se gastaría cada mes futuro si se aplicara el % histórico directo al crédito vigente. Comparado con el saldo, puede dar margen positivo (sobra crédito) o negativo (no alcanza)."],
                ["Margen", "Saldo − Σ Esperado futuro. El termómetro: + (verde) = sobra plata al ritmo histórico, − (rojo) = no alcanza el saldo."],
                ["Renta", "Aporte de Rentas Generales del Tesoro Provincial — la contraparte local de los préstamos internacionales."],
                ["Préstamo", "Aporte del organismo internacional (BID, CAF, FONPLATA)."],
                ["Fuente de financiamiento", "Combinación programa+segmento sobre la que se configura la proyección por obra. Hay ~10 fuentes: FF 11, FF 12, BID 4416/Renta, BID 4416/Préstamo, etc."],
                ["Decay multiplicativo", "Modelo de gasto donde cada mes se consume un % del saldo remanente, no del saldo original. Resultado: el saldo decrece geométricamente y nunca se agota matemáticamente, salvo que algún mes se ponga 100%."],
                ["Total Proyectado (obra)", "Suma del gasto proyectado de la obra a lo largo de todos los meses futuros. Aparece en la hoja Obras del export."],
                ["Saldo Final (obra)", "Saldo Actual − Total Proyectado. Lo que quedaría sin ejecutar al final del año si se respetan los porcentajes ingresados en el modal de export."],
              ].map(([term, desc]) => (
                <tr key={term} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2.5 align-top w-48 font-medium text-slate-900">
                    {term}
                  </td>
                  <td className="px-5 py-2.5 align-top text-slate-700">
                    {desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="text-xs text-slate-500 text-center pt-2">
        Para ver los números reales de tu carga actual, andá a{" "}
        <Link to="/proyeccion" className="underline">
          Proyección
        </Link>
        .
      </div>
    </div>
  );
}
