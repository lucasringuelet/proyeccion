# Proyección de Gastos — Dirección Provincial de Vialidad

> 📘 **¿Buscás cómo desplegar / actualizar / administrar la app en producción?**
> Mirá [`OPERACIONES.md`](./OPERACIONES.md) — incluye infra, paths, contraseñas,
> backups, troubleshooting y cheatsheet de comandos para el server.

App web interna que automatiza el cálculo mensual de la proyección presupuestaria
que el equipo de Vialidad PBA hoy hace a mano sobre planillas Excel.

Lee los `.xls` de "Recursos y Erogaciones", extrae las 6 solapas relevantes y
calcula dos proyecciones complementarias:

- **Plan**: cómo se reparte el saldo siguiendo la forma del histórico,
  renormalizado para consumir el saldo entero. Es la proyección operativa que
  va a Tesorería.
- **Esperado**: cuánto se gastaría aplicando el % histórico directo al crédito
  vigente. Es el termómetro: muestra si sobra o falta crédito al ritmo
  histórico.

La diferencia entre ambos (**Margen = Saldo − Σ Esperado futuro**) es la
métrica clave:

- **Margen positivo** → sobra plata: el ritmo histórico no consumiría todo el
  saldo (subejecución potencial — hay que acelerar para no perder crédito).
- **Margen negativo** → falta plata: el ritmo histórico consumiría más de lo
  disponible (hay que pedir ampliación o frenar adjudicaciones).

Además, el botón "Exportar Excel" abre un modal donde el usuario configura,
por fuente de financiamiento (programa+segmento) y por mes futuro, un % de
consumo. El export resultante incluye una hoja **"Obras"** con la proyección mensual obra
por obra, y una hoja **"Por Fuente"** con el resumen agregado por fuente de
financiamiento.

---

## Stack

- **Backend**: Node 20 + TypeScript + Express + Prisma + SQLite + SheetJS.
- **Frontend**: Vite + React 18 + TypeScript + Tailwind + Recharts.
- **Auth**: clave única compartida + cookie HTTP-only firmada (iron-session).
- **Deploy**: en producción el backend sirve los assets de React desde
  `web/dist` — un solo proceso, un solo puerto.

---

## Programas que procesa

| Slug         | Nombre               | Familia             | Desglose         |
|--------------|----------------------|---------------------|------------------|
| obras_ff11   | Obras FF 11          | Provincial          | sin desglose     |
| obras_ff12   | Obras FF 12          | Provincial          | sin desglose     |
| bid_4416     | BID 4416             | Crédito Externo     | Renta + Préstamo |
| bid_5418     | BID 5418             | Crédito Externo     | Renta + Préstamo |
| caf_11       | CAF 11               | Crédito Externo     | Renta + Préstamo |
| fonplata     | FONPLATA             | Crédito Externo     | Renta + Préstamo |

Cualquier otra solapa del Excel (`RESUMEN`, `CONVENIOS`, `BIRF`, `FFV`,
`FORMO`, `Vialidad Nacional`, etc.) se ignora.

### Convención de nombres del archivo

La app detecta el año desde el filename buscando `YYYY` (cualquier `20XX`).
Filenames esperados:

```
RECURSOS Y EROGACIONES 2024*.xls
RECURSOS Y EROGACIONES 2025*.xls
RECURSOS Y EROGACIONES 2026*.xls
```

Si no matchea, podés pasar `?year=2026` en el upload o cambiar el filename.

### Un solo archivo por año (reemplazo silencioso)

A nivel base de datos hay un constraint `@unique` sobre `ExcelFile.year`. Esto
significa que solo puede haber **un único Excel por año**.

- Si subís un archivo del 2026 y ya existía otro del 2026 con distinto
  contenido → el viejo se borra (cascade limpia `ProgramYearData` y `Obra`),
  el .xls físico viejo se elimina del disco, y el nuevo queda como único.
  La auditoría queda registrada como `REPLACE_FILE`.
- Si los bytes del archivo nuevo son idénticos al ya cargado (mismo SHA-256),
  el sistema lo detecta antes de procesar y no hace nada.
- Si el parseo del archivo nuevo falla (formato roto), nada se modifica:
  el archivo viejo y sus datos quedan intactos.

Esto significa que la base **nunca acumula versiones**: siempre refleja el
snapshot del último archivo subido por año.

---

## Setup local

Requisitos: **Node ≥ 20**.

```bash
# 1. Clonar / descomprimir y entrar a la carpeta
cd proyeccion-vialidad

# 2. Configurar variables de entorno
cp backend/.env.example backend/.env
# Editar backend/.env: poner una APP_PASSWORD propia y un SESSION_SECRET aleatorio
#   openssl rand -hex 32   # genera un secret válido

# 3. Instalar todo
npm install

# 4. Crear la base de datos y poblarla con los 6 programas
npm run prisma:migrate -- --name init
npm run seed

# 5. Levantar dev (backend + web en paralelo, hot reload)
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173 (proxy a /api → backend)

O con un solo comando:

```bash
./start.sh
```

### Tests del backend

```bash
npm run test
```

El parser viene con tests que corren contra los `.xls` reales que ya están en
la raíz del repo. Al modificar el parser corré los tests para asegurar que
siguen pasando.

---

## Producción

### Build

```bash
npm install
cp backend/.env.example backend/.env  # editar valores
npm run prisma:migrate -- --name init
npm run seed
npm run build
```

`npm run build` genera:
- `backend/dist/` (JS compilado)
- `web/dist/` (assets estáticos de React)

En producción, el backend sirve `web/dist` desde el mismo origen, así que
**hay un solo proceso y un solo puerto**.

### Arrancar

```bash
NODE_ENV=production node backend/dist/index.js
```

### Deploy en Ubuntu Server (systemd)

1. Copiar todo el repo a `/opt/vialidad`.
2. Crear usuario `vialidad`: `useradd --system --home /opt/vialidad vialidad`.
3. `chown -R vialidad:vialidad /opt/vialidad`.
4. Como usuario vialidad: `cd /opt/vialidad && npm install && cp backend/.env.example backend/.env`.
5. Editar `backend/.env` (clave de prod, secret aleatorio).
6. `npm run prisma:migrate -- --name init && npm run seed && npm run build`.
7. Copiar el unit file: `sudo cp deploy/vialidad.service /etc/systemd/system/`.
8. `sudo systemctl daemon-reload && sudo systemctl enable --now vialidad`.
9. Verificar: `systemctl status vialidad`.
10. Si querés exponerlo en el puerto 80 sin sudo, poné nginx adelante o usá
    `setcap 'cap_net_bind_service=+ep' $(readlink -f $(which node))`.

Para actualizar:

```bash
sudo -u vialidad bash -c 'cd /opt/vialidad && git pull && npm install && npm run prisma:migrate && npm run build'
sudo systemctl restart vialidad
```

---

## Arquitectura

```
proyeccion-vialidad/
├── backend/
│   ├── src/
│   │   ├── index.ts                  Bootstrap Express + routing
│   │   ├── config.ts                 Env vars
│   │   ├── db.ts                     Prisma client
│   │   ├── session.ts                iron-session config
│   │   ├── middleware/               requireAuth, errorHandler
│   │   ├── routes/                   auth, programs, files, settings,
│   │   │                             projection, snapshots
│   │   └── services/
│   │       ├── parser/               Excel → datos normalizados + audit trail
│   │       ├── projection/           Motor de Plan/Esperado (funciones puras)
│   │       │                         + projectObras (proyección proporcional al saldo base por obra)
│   │       └── export/               Generación de .xlsx (6 hojas: Resumen, Plan,
│   │                                  Esperado, Real, Obras, Por Fuente)
│   ├── prisma/
│   │   ├── schema.prisma             Schema (ExcelFile, Program, etc.)
│   │   └── seed.ts                   Carga los 6 programas
│   └── data/                         (creado en runtime: app.db + excels/)
├── web/
│   └── src/
│       ├── App.tsx                   Routing + auth gate
│       ├── components/Layout.tsx     Sidebar + outlet
│       ├── components/ui/            Primitivas (Button, Card, Modal, etc.)
│       ├── components/projection/    ObrasPctMatrixModal (modal de export)
│       ├── lib/
│       │   ├── api.ts                Cliente axios + tipos
│       │   └── utils.ts              cn(), formateadores ARS/%
│       └── pages/
│           ├── Login.tsx
│           ├── Files.tsx              Drag-drop + listado
│           ├── FileAuditView.tsx      Detalle parser por archivo
│           ├── Audit.tsx              Información general de trazabilidad
│           ├── Config.tsx             Año target + base + segmentos por prog.
│           ├── Projection.tsx         KPIs + chart + cards + grid + export
│           ├── Snapshots.tsx          Historial guardado
│           └── SnapshotDetail.tsx     Vista de un snapshot
├── deploy/
│   └── vialidad.service              Unit systemd
├── start.sh                          Script dev local
├── package.json                      Workspaces
└── README.md
```

---

## API

Todos los endpoints excepto `/api/auth/*` requieren cookie de sesión válida.

| Método | Path                        | Qué hace                                                                  |
|--------|-----------------------------|----------------------------------------------------------------------------|
| POST   | `/api/auth/login`           | `{ password }` → setea cookie                                              |
| POST   | `/api/auth/logout`          | destruye cookie                                                            |
| GET    | `/api/auth/me`              | `{ authenticated: bool }`                                                  |
| GET    | `/api/health`               | `{ ok: true, version }`                                                    |
| GET    | `/api/programs`             | listado de los 6 programas                                                 |
| GET    | `/api/files`                | lista de archivos cargados                                                 |
| POST   | `/api/files`                | multipart `file` → parsea + persiste                                       |
| DELETE | `/api/files/:id`            | borra archivo + datos asociados                                            |
| GET    | `/api/files/:id/audit`      | audit trail completo                                                       |
| GET    | `/api/settings`             | preferencias del usuario                                                   |
| PUT    | `/api/settings`             | `{ key, value }`                                                           |
| POST   | `/api/projection`           | `{ targetYear, baseYears, currentMonth, segmentSelection }` → envelope     |
| POST   | `/api/projection/export`    | mismo body + `obrasPctMatrix?: Record<string, number[12]>` → descarga `.xlsx` con 6 hojas (Resumen, Plan, Esperado, Real, Obras, Por Fuente) |
| GET    | `/api/snapshots`            | lista de snapshots                                                         |
| POST   | `/api/snapshots`            | `{ label, params }` guarda                                                 |
| GET    | `/api/snapshots/:id`        | detalle                                                                    |
| DELETE | `/api/snapshots/:id`        | borra                                                                      |

---

## Validaciones del parser

Al subir un Excel, el parser corre validaciones cruzadas que aparecen en la
página de auditoría del archivo:

- En programas con desglose: **Renta + Préstamo ≈ Total** (tolerancia ±100 ARS).
- **Σ(meses) ≈ Gastado Acumulado** por programa.
- **Saldos ≈ Crédito Definitivo − Gastado Acumulado**.

Las discrepancias chicas son típicas (redondeos, ajustes contables) y aparecen
como nivel `info`. Si una cifra está netamente desalineada el parser sube el
nivel a `warning` o `error`.

El parser **no confía** en:
- los nombres de solapa (el archivo 2026 conserva nombres "Obras 2025 FF 11"),
- las posiciones de columnas (cada solapa tiene su propio layout),
- los rótulos `F.F. 1.1` / `F.F. 1.2` (vienen con typos en BID 5418 y CAF 11).

Lo que **sí** usa para clasificar:
- el filename para detectar el año,
- los textos de header (`CONCEPTO`, `CRÉDITO DEFINITIVO`, `ENERO`..`DICIEMBRE`)
  para mapear columnas,
- el texto del concepto (`Rentas Generales`, `BID/CAF/FONPLATA`, `Recursos`,
  `ECONOMIA`) para clasificar bloques en RENTA vs PRESTAMO.

### Filas ocultas

El parser **ignora las filas marcadas como `hidden` en Excel**. La planilla
fuente arrastra obras de ejercicios anteriores que el equipo esconde
manualmente para limpiar la vista; sin este filtro esas filas se ingestaban
como obras "fantasma" con todos los valores en cero. La detección se hace
leyendo el atributo `!rows[i].hidden` que SheetJS expone en el worksheet.

---

## Proyección por obra (export configurable)

Plan y Esperado se calculan automáticamente a partir del histórico, pero
**operan sobre el agregado del programa-segmento**, no sobre cada obra. Para
proyectar obra por obra, el botón "Exportar Excel" abre un modal donde el
usuario configura manualmente el ritmo de gasto de cada fuente.

### Modelo: porcentaje sobre el saldo base

Para cada obra del año target:

```
saldo_proyectable = obra.saldoActual × (1 − descuentoPct/100)
restante = saldo_proyectable
para cada mes futuro m (Mes Actual + 1 .. Diciembre):
  pct      = pctMatrix[programa__segmento][m] / 100    # saturado entre 0 y 1
  gasto    = min(saldo_proyectable × pct, restante)    # % del saldo base, no del remanente
  proy[m]  = gasto
  restante = max(0, restante − gasto)

TotalProyectado = Σ proy[m]
SaldoFinal      = saldoActual − TotalProyectado
```

- Si los porcentajes **suman exactamente 100%**, `TotalProyectado = saldo_proyectable`
  (se consume el saldo entero).
- Si suman menos del 100%, queda un remanente sin proyectar.
- Si suman más del 100%, los meses del final se truncan al remanente disponible
  (los primeros meses tienen prioridad).
- El cálculo se hace **al apretar Exportar** — no se guarda en la DB.

### UI del modal

- Filas: ~10 fuentes (programa+segmento). Para FAMILIA1 hay 1 por programa
  (`SOLE`); para FAMILIA2 hay 2 (RENTA, PRESTAMO). Si el usuario eligió
  `TOTAL` en `segmentSelection`, el modal igual muestra las dos reales —
  porque las obras viven en RENTA/PRESTAMO, no en TOTAL.
- Columnas: solo los meses futuros (a partir de Mes Actual + 1).
- Helpers: por fila "Uniforme" (replica un % en todos los meses futuros) y
  "Cero". Global: "Todo en cero".
- Si el año está cerrado (`currentMonth = 12`), el modal lo informa y el
  export sale sin columnas mensuales (solo headers + saldos actuales).

### Hoja "Obras" en el .xlsx

| Columna | Significado |
|---|---|
| Programa, Segmento, Expediente, PRY, CUOV, Concepto | Identificación |
| Crédito Definitivo | Como viene del Excel fuente |
| Gastado YTD | `gastadoAcumulado` |
| Saldo Actual | `saldos` (= CD − YTD) |
| `<mes> proy.` × N | Una columna por mes futuro con el gasto proyectado |
| Total Proyectado | Σ de las columnas mensuales |
| Saldo Final | Saldo Actual − Total Proyectado |

Las 4 hojas previas (Resumen, Plan, Esperado, Real) se mantienen sin cambios.

### Hoja "Por Fuente" en el .xlsx

Resumen agregado por fuente de financiamiento. Mismas columnas que "Obras" pero
sin identificación individual (sin Expediente/PRY/CUOV/Concepto): una fila por
fuente (programa+segmento) con la **suma** de todas sus obras.

| Columna | Significado |
|---|---|
| Programa, Segmento | Identificación de la fuente |
| Crédito Definitivo | Suma del crédito de todas las obras |
| Gastado YTD | Suma del gastado acumulado |
| Saldo Actual | Suma de los saldos actuales |
| Descuento % | % de descuento configurado para la fuente |
| Saldo Proyectable | Suma del saldo proyectable (post-descuento) |
| `<mes> proy.` × N | Suma de los gastos proyectados por mes |
| Total Proyectado | Σ de las columnas mensuales |
| Saldo Final | Suma de Saldo Actual − Total Proyectado |

---

## Decisiones de diseño

- **SQLite**: cero mantenimiento, file-based, suficiente para 10 usuarios
  internos. Migrable a PostgreSQL en una línea de Prisma cuando crezca.
- **Una sola clave compartida**: el cliente lo prefiere para evitar gestión
  de usuarios; bloquea acceso casual desde fuera de la red interna.
- **Promedio simple** entre años históricos: si en el futuro se prefiere
  ponderar el más reciente, la lógica está concentrada en
  `services/projection/projection.ts → averageProfile()`.
- **Snapshots** son globales (todos los usuarios los ven) porque la app es
  single-user-shared.

---

## Roadmap (no incluidos en MVP)

- Comparador lado a lado de dos snapshots.
- Login con AD / SSO.
- Integración directa con SIDIF para evitar el upload manual.
- Ponderación configurable del histórico (más peso al año reciente).
- Alertas automáticas por programa (margen < -X% del crédito → email).
