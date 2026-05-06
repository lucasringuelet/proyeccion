# Operaciones — Proyección Vialidad

Documento operativo de la app **Proyección de Gastos — Vialidad PBA**:
infraestructura, despliegue, mantenimiento, contraseñas y troubleshooting.

> ⚠️ **Sensible**: este archivo tiene credenciales actuales. El repo es privado
> (`lucasringuelet/proyeccion`). No lo hagas público sin antes rotar todas las
> claves y borrarlas de acá. Idealmente, mover las claves a un manager (1Password,
> Bitwarden, KeePass) y dejar acá solo placeholders + instrucciones.

---

## 1. Servidor

### Hardware

| Atributo | Valor |
|---|---|
| Hostname | `tivbasrv` |
| Ubicación | Físico, oficinas Vialidad PBA |
| Tipo | Desktop ASUS (no es server-class) |
| Network | LAN interna `10.25.96.0/22` |
| IP | `10.25.99.230` |
| Gateway | `10.25.97.254` |
| GPU | NVIDIA (legacy, no usada por nuestra app) |
| Acceso físico | Sin teclado/monitor conectados; SSH-only en operación normal |
| Out-of-band | **No tiene IPMI/BMC**. Si se pierde acceso SSH y sudo, hay que conectar teclado+monitor físicos para recuperar |

### OS y software base

| Item | Versión / Path |
|---|---|
| OS | Ubuntu 24.04.2 LTS (Noble) |
| Arquitectura | x86_64 |
| Kernel actual | 6.14.0-37-generic |
| Node.js | **v20.20.2 vía NVM** en `/home/tivba/.nvm/` |
| npm | v10.8.2 (viene con Node) |
| git | 2.43.0 (apt) |
| systemd | v255 |
| sqlite3 (CLI) | **No instalado**. Las queries se hacen vía Prisma Client en Node |
| Firewall (ufw) | **Inactivo**. La app es accesible directo en :3001 desde toda la LAN |

### Otras cosas que viven en este server (ignorar, no son nuestras)

- Calico (CNI de Kubernetes) — quedó de cuando la PC era un nodo K8s
- containerd
- NVIDIA drivers + CUDA toolkit
- nvidia-dkms (estos paquetes están en estado roto a nivel apt; ver Troubleshooting)

No las usamos. **No correr `apt upgrade` general** — explota por el conflicto de
NVIDIA con el kernel nuevo. Si hay que actualizar algún paquete específico,
hacerlo con `apt install <pkg> --no-install-recommends`.

---

## 2. Accesos

### SSH al server

| Item | Valor |
|---|---|
| Comando | `ssh tivba@10.25.99.230` |
| Usuario | `tivba` |
| Auth | Clave pública (sin password). La clave pública del cliente está en `/home/tivba/.ssh/authorized_keys` |
| Password de login | `Tivbaa086ean.` *(para recovery — normalmente no se usa)* |
| Network | Hay que estar conectado a la red corporativa de Vialidad para alcanzar `10.25.99.230` |

### sudo en el server

| Item | Valor |
|---|---|
| Password sudo | **`Tivbaa086ean.`** *(misma que el login, **incluye el punto final**)* |
| Para usar | `sudo <comando>` te pide el password |
| Vía SSH non-interactivo | `echo 'Tivbaa086ean.' \| ssh tivba@10.25.99.230 'sudo -S <comando>'` |

> ⚠️ **Rotar**: el password fue compartido en chat con asistentes externos.
> Cambiarlo cuanto antes con `passwd` desde el server.

### App (login a la web UI)

| Item | Valor |
|---|---|
| URL | `http://10.25.99.230:3001` |
| Password compartido | `dev123` |
| Define en | `/opt/vialidad/backend/.env` → `APP_PASSWORD` |
| Para cambiar | Editar el .env, después `sudo systemctl restart vialidad` |

> ⚠️ **`dev123` es muy débil**. Cambiar por algo fuerte antes de cualquier
> rollout más amplio. La app la usan con auth single-tenant — un solo password
> compartido por todos los usuarios.

### GitHub (deploy del server)

| Item | Valor |
|---|---|
| Repo | `git@github.com:lucasringuelet/proyeccion.git` (privado) |
| Auth | Deploy key SSH read-only en el server |
| Clave privada | `/home/tivba/.ssh/github_deploy` |
| Configuración | `/home/tivba/.ssh/config` mapea `github.com` → esa key |

---

## 3. Stack y paths en el server

```
/opt/vialidad/                               ← raíz de la app (owned by tivba)
├── backend/
│   ├── .env                                 ← config + secrets (NO commiteado)
│   ├── data/
│   │   ├── app.db                           ← SQLite (toda la data persistida)
│   │   └── excels/<año>/<sha-prefix>__*.xls ← .xls cargados por usuarios
│   ├── dist/                                ← JS compilado (output de tsc)
│   ├── prisma/schema.prisma
│   └── src/
├── web/
│   └── dist/                                ← assets estáticos React (output de Vite)
└── ...resto del repo

/home/tivba/.nvm/versions/node/v20.20.2/    ← Node.js
/etc/systemd/system/vialidad.service        ← Unit systemd (la app corre acá)
```

### Variables de entorno (`backend/.env` actual)

```bash
APP_PASSWORD=dev123
SESSION_SECRET=<64-hex aleatorio generado con openssl rand -hex 32>
PORT=3001
DATA_DIR=./data
MAX_UPLOAD_MB=20
DEV_FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL="file:../data/app.db"
SECURE_COOKIES=false                          ← clave: necesario porque servimos sobre HTTP
```

> Si en el futuro ponen HTTPS adelante (nginx + Let's Encrypt), cambiar
> `SECURE_COOKIES=true` o sacar la línea.

### Systemd unit (`/etc/systemd/system/vialidad.service`)

```ini
[Unit]
Description=Proyeccion Vialidad PBA
After=network.target

[Service]
Type=simple
User=tivba
Group=tivba
WorkingDirectory=/opt/vialidad
EnvironmentFile=/opt/vialidad/backend/.env
Environment=NODE_ENV=production
ExecStart=/home/tivba/.nvm/versions/node/v20.20.2/bin/node /opt/vialidad/backend/dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

> ⚠️ El path al binario `node` está **hardcodeado a v20.20.2**. Si hacés
> `nvm install` de una versión nueva, hay que **editar el systemd unit** y
> hacer `sudo systemctl daemon-reload && sudo systemctl restart vialidad`.

---

## 4. Comandos operativos cotidianos

### Estado de la app

```bash
# Estado del servicio
sudo systemctl status vialidad

# ¿Está activo?
systemctl is-active vialidad        # → "active" o "failed"

# Logs en tiempo real
sudo journalctl -u vialidad -f

# Logs últimos 200 lines
sudo journalctl -u vialidad -n 200 --no-pager

# Logs desde hoy
sudo journalctl -u vialidad --since today

# Ver puerto escuchando
ss -tlnp | grep :3001

# Health check
curl -s http://localhost:3001/api/health
# → {"ok":true,"version":"0.1.0"}
```

### Reiniciar / parar / arrancar

```bash
sudo systemctl restart vialidad     # reiniciar (uso típico tras git pull/build)
sudo systemctl stop vialidad
sudo systemctl start vialidad
sudo systemctl reload-or-restart vialidad
```

### Actualizar la app a la última versión del repo

```bash
# Conectarse al server
ssh tivba@10.25.99.230

# Activar Node 20 (si no se cargó automáticamente)
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"

# Pull del código nuevo
cd /opt/vialidad
git pull --ff-only

# Si hubo cambios en package.json, reinstalar deps
npm install

# Si hubo cambios en prisma/schema.prisma, sincronizar la DB
cd backend
npx prisma db push
npx prisma generate
cd ..

# Buildear backend + frontend
npm run build

# Reiniciar el servicio para tomar el cambio
sudo systemctl restart vialidad

# Verificar que arrancó OK
systemctl status vialidad --no-pager | head -10
curl -s http://localhost:3001/api/health
```

### Rollback a una versión anterior

```bash
cd /opt/vialidad
git log --oneline -10                         # ver últimos commits
git checkout <sha-bueno>                       # checkout del commit anterior
npm run build
sudo systemctl restart vialidad
```

Para volver a `main`: `git checkout main && git pull`.

---

## 5. Base de datos (SQLite)

### Donde vive

```
/opt/vialidad/backend/data/app.db
```

Toda la data persistida (archivos cargados, programas, settings, snapshots,
auditoría) está acá. **Si borrás este archivo, perdés todo.**

### Backup manual

```bash
# Copiar a otro lado
cp /opt/vialidad/backend/data/app.db ~/backup-app.db-$(date +%Y%m%d).db

# Backup completo (DB + .xls subidos)
tar czf ~/vialidad-backup-$(date +%Y%m%d).tar.gz -C /opt/vialidad/backend data
```

Recomendado: **automatizar un backup diario** vía `cron` o `systemd timer`.

### Restaurar backup

```bash
sudo systemctl stop vialidad
cp ~/backup-app.db-YYYYMMDD.db /opt/vialidad/backend/data/app.db
chown tivba:tivba /opt/vialidad/backend/data/app.db
sudo systemctl start vialidad
```

### Aplicar cambios de schema (Prisma)

Cuando modificamos `backend/prisma/schema.prisma`:

```bash
cd /opt/vialidad/backend
npx prisma db push       # sincroniza el schema con la DB existente
npx prisma generate      # regenera el client TypeScript
```

> Usamos `db push` porque el proyecto **no tiene migrations** (la carpeta
> `prisma/migrations/` solo tiene `migration_lock.toml`). Para producción
> "real" lo correcto sería usar `prisma migrate deploy` con migrations
> versionadas, pero para esta app single-tenant `db push` alcanza.

### Re-poblar los 6 programas (idempotente)

```bash
cd /opt/vialidad
npm run seed
```

### Inspeccionar la DB sin sqlite3 CLI

`sqlite3` no está instalado en el server. Para queries ad-hoc, usar Prisma:

```bash
cd /opt/vialidad/backend
node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const files = await p.excelFile.findMany();
  console.log(files);
  await p.$disconnect();
})();
'
```

O instalar el CLI: `sudo apt install -y sqlite3` *(podría enredarse con el
estado roto de apt — usar con cuidado, ver Troubleshooting)*.

---

## 6. Archivos Excel cargados

Se almacenan en `/opt/vialidad/backend/data/excels/<año>/<sha-12chars>__<nombre>.xls`.

```bash
# Ver cuánto ocupan
du -sh /opt/vialidad/backend/data/excels/

# Listar todos
find /opt/vialidad/backend/data/excels/ -name "*.xls"
```

Reglas (implementadas en el código):
- **1 archivo por año** (constraint `@unique` en `ExcelFile.year`).
- Subir uno nuevo del mismo año **reemplaza** al anterior (el .xls físico viejo
  se borra del disco).
- Si el parser detecta errores **bloqueantes** (ej. faltan solapas), el upload
  se rechaza y el archivo viejo queda intacto.
- El parser ignora **filas ocultas** del .xls.

---

## 7. Network y acceso

### Acceso a la app desde la red corporativa

- URL: `http://10.25.99.230:3001`
- Cualquier máquina con ruta a `10.25.99.230` puede acceder
- No hay firewall (ufw inactivo)
- No hay HTTPS (HTTP plano)
- Por eso `SECURE_COOKIES=false` en el `.env`

### Acceso desde fuera de la red corporativa

**Hoy no es posible directo**. Para habilitar:

1. Port forwarding del router (puerto público → `10.25.99.230:3001`)
2. DNS público apuntando a la IP pública del router
3. (Recomendado) HTTPS con nginx + Let's Encrypt como reverse proxy
4. Cambiar `SECURE_COOKIES=true` en el `.env`
5. Idealmente: subir la fortaleza del `APP_PASSWORD`

---

## 8. Logs y monitoreo

### Logs de la app

Todo va a `journald` por estar bajo systemd. Comandos:

```bash
# En vivo
sudo journalctl -u vialidad -f

# Filtrar por nivel
sudo journalctl -u vialidad -p err

# Por rango de tiempo
sudo journalctl -u vialidad --since "1 hour ago"
sudo journalctl -u vialidad --since "2026-05-06 09:00"
```

### Auditoría a nivel app

La app tiene su propio log de auditoría en la tabla `AuditEntry` (Prisma).
Acciones registradas: `LOGIN`, `UPLOAD_FILE`, `REPLACE_FILE`, `DELETE_FILE`,
`EXPORT`. Visible desde la UI en `/auditoria` con todos los detalles.

---

## 9. Contraseñas y secretos — resumen

| Secreto | Dónde vive | Cómo cambiarlo |
|---|---|---|
| Password de **login del server** (usuario `tivba`) | `/etc/shadow` (hash) | `passwd` desde una sesión SSH |
| Password de **sudo** (usuario `tivba`) | Mismo que el de login | `passwd` desde una sesión SSH |
| **APP_PASSWORD** (login a la web app) | `/opt/vialidad/backend/.env` | Editar el archivo + `sudo systemctl restart vialidad` |
| **SESSION_SECRET** (firma de cookies) | `/opt/vialidad/backend/.env` | Generar con `openssl rand -hex 32`, editar el archivo, restart. **Invalida todas las sesiones activas** |
| **GitHub deploy key** (SSH para clonar/pullear) | `/home/tivba/.ssh/github_deploy` | Generar nueva par con `ssh-keygen`, agregar la pública a GitHub Settings → Deploy keys del repo, borrar la anterior |
| **SSH del cliente** (para entrar al server desde tu máquina) | `/home/tivba/.ssh/authorized_keys` (las claves públicas autorizadas) | Editar el archivo a mano para agregar/quitar claves |

### Generación de un SESSION_SECRET nuevo

```bash
openssl rand -hex 32
# → ej: a1b2c3d4...64-chars-hex...
```

Editar `backend/.env`, reemplazar el valor, `sudo systemctl restart vialidad`.

### Cambiar APP_PASSWORD a algo fuerte

```bash
ssh tivba@10.25.99.230
nano /opt/vialidad/backend/.env
# Cambiar APP_PASSWORD=dev123 por algo tipo APP_PASSWORD=Pe5wM!4r8cJ@Kx2N
# Guardar (Ctrl+O, Enter, Ctrl+X)
sudo systemctl restart vialidad
# Probar el login con la nueva clave
```

---

## 10. Things to know — caveats importantes

### Del codebase

- **SQLite, no PostgreSQL**. Para >10-20 usuarios concurrentes habría que
  migrar a Postgres — Prisma soporta el cambio en una línea.
- **Single-tenant**: una sola clave, sin usuarios individuales, sin roles.
- **Snapshots y settings son globales**: lo que un user guarda lo ve cualquier
  otro. La app fue diseñada así por el cliente.
- **Hidden rows del Excel se ignoran** por el parser (cambio reciente). Útil
  porque la planilla fuente arrastra obras viejas escondidas.
- **1 archivo por año**: subir uno nuevo del mismo año reemplaza el anterior
  (silenciosamente, con audit trail). El .xls físico viejo se borra del disco.
- **Si el parseo del .xls tiene errores nivel `error`**, el upload se rechaza
  y la data anterior NO se toca (cambio reciente). Antes: se sobrescribía
  con data parcial.
- **CORS**: en producción el backend sirve `web/dist/` desde el mismo origen,
  sin CORS. La var `DEV_FRONTEND_ORIGIN` solo se usa cuando `NODE_ENV !== production`.

### Del server

- **Node está en NVM**, no en `/usr/bin/node`. El path está hardcodeado en el
  systemd unit. Si actualizan Node con `nvm install`, hay que **editar el
  unit** y reload + restart.
- **`apt upgrade` general explota** por el conflicto NVIDIA-DKMS con el kernel
  nuevo. Solo instalar paquetes individuales con cuidado, ver Troubleshooting.
- **Ese server originalmente era un nodo de Kubernetes**. Hay procesos
  `calico-node` corriendo que son del setup viejo de K8s (no se usan, no se
  pueden tirar fácil sin desinstalar más cosas). No interfieren con nuestra app.
- **No hay backups automáticos**. Hay que armar uno (cron + tar + scp a otro
  lado, idealmente).
- **No hay HTTPS**. La app sirve HTTP plano sobre `:3001`. Funciona en LAN
  interna; para uso externo conviene poner nginx + Let's Encrypt adelante.

---

## 11. Troubleshooting

### "La app no responde, ni siquiera el health check"

```bash
sudo systemctl status vialidad           # ¿está active?
sudo journalctl -u vialidad -n 100       # leer error reciente
```

Si está `failed`:
- Probable causa: `.env` mal formado, o el binario `node` no existe
- Revisar logs, corregir, `sudo systemctl restart vialidad`

### "Cambié `.env` pero no se aplicó"

`systemd` carga el `EnvironmentFile` solo al iniciar. Tras editar el `.env`:
```bash
sudo systemctl restart vialidad
```

### "Login no me toma la clave a veces"

Causa probable: whitespace en el password (autofill del browser).
Resuelto: cliente y servidor hacen `.trim()` del password.
Si sigue pasando: borrar passwords guardados del browser para esta URL y
tipear a mano.

### "Cookie/sesión no persiste — me deslogea solo"

Causa típica: el flag `Secure` en la cookie + estar accediendo por HTTP.
Resuelto con `SECURE_COOKIES=false` en `.env`.
Verificar:
```bash
grep SECURE_COOKIES /opt/vialidad/backend/.env
```

### "Apt está roto, me dice errores con NVIDIA"

```
ERROR: Cannot create report: ... nvidia-dkms-575-open.0.crash
```

Es por el conflicto NVIDIA-DKMS con el kernel nuevo. **Workaround**: NO usar
`apt upgrade`. Para instalar UN paquete específico:
```bash
sudo apt install <paquete> --no-install-recommends
```

Si hay que reparar el estado (paquetes a medio instalar):
```bash
sudo dpkg --configure -a
# Si falla con NVIDIA, removerlo:
sudo apt remove nvidia-dkms-575-open nvidia-kernel-source-575-open
sudo apt-get install -f -y
```

### "Subí un .xls y dice ERROR"

Ir a `/archivos` → click en "Auditoría" del archivo. Ver la sección "Avisos
del parser" para saber qué falta (típicamente: una solapa esperada que no
existe, o tiene otro nombre que el regex no matchea).

Las regex de matching están en `backend/src/services/parser/programMap.ts`.

### "Pantalla en blanco al entrar a una página"

Probablemente un error de JS. Abrir DevTools (F12) → Console → leer el error.
Suele ser un hook fuera de orden o un null no chequeado. Reportar a quien
mantenga el código.

### "Quedé bloqueado de SSH y no me acuerdo el password de sudo"

- **Si tenés acceso físico al server**: conectar teclado + monitor → reiniciar
  → en GRUB elegir "Advanced" → "recovery mode" → "root shell" →
  `mount -o remount,rw /` → `passwd tivba`. **Ojo**: GRUB está configurado
  como hidden con timeout=0, hay que apretar ESC repetidamente apenas pasa
  el POST de la BIOS para que aparezca el menú.
- **Si NO tenés acceso físico**: bootear desde USB con Ubuntu Live, montar el
  disco, chroot, `passwd tivba`.
- (Esta PC no tiene IPMI/iDRAC/iLO, así que no hay opción remota.)

### "Quiero limpiar todo y empezar de cero"

```bash
sudo systemctl stop vialidad
rm -rf /opt/vialidad/backend/data         # ⚠️ borra DB y .xls
cd /opt/vialidad/backend
npx prisma db push
npm run seed
sudo systemctl start vialidad
```

---

## 12. Pendientes / mejoras futuras

| Item | Prioridad | Por qué |
|---|---|---|
| Cambiar `APP_PASSWORD` a algo fuerte | Alta | `dev123` es trivial |
| Cambiar password de sudo (rotar el actual) | Alta | Se compartió en chat |
| Backup automatizado de `app.db` y `excels/` | Alta | Hoy no hay nada — un disco roto = perder todo |
| HTTPS con nginx + Let's Encrypt | Media | Para uso externo |
| Migrations propias de Prisma (en vez de `db push`) | Baja | Para reproducibilidad de schema |
| Limpiar paquetes NVIDIA/CUDA/calico que no se usan | Baja | Liberar espacio + sacar errores apt |
| Mover secretos del `.env` a un manager externo | Media | Mejor seguridad |
| Migrar de SQLite a Postgres si crece la concurrencia | Baja | Hoy alcanza |
| UFW configurado (solo puerto 3001 + SSH 22) | Media | Defensa en profundidad |
| 2FA o login con AD/SSO | Baja | Si crece el equipo de usuarios |

---

## 13. Cheatsheet de comandos

```bash
# Levantar / reiniciar / parar
sudo systemctl start|stop|restart|reload-or-restart vialidad

# Estado
systemctl status vialidad
systemctl is-active vialidad

# Logs
sudo journalctl -u vialidad -f                    # en vivo
sudo journalctl -u vialidad -n 200                # últimas 200
sudo journalctl -u vialidad --since "2h ago"

# Health
curl -s http://localhost:3001/api/health
curl -s http://10.25.99.230:3001/api/health       # desde otra máquina LAN

# Update
cd /opt/vialidad && git pull && npm install && npm run build && sudo systemctl restart vialidad

# Cambiar APP_PASSWORD
nano /opt/vialidad/backend/.env && sudo systemctl restart vialidad

# Backup rápido
tar czf ~/vialidad-backup-$(date +%Y%m%d).tar.gz -C /opt/vialidad/backend data

# Inspeccionar DB sin sqlite3
cd /opt/vialidad/backend && node -e 'const { PrismaClient } = require("@prisma/client"); const p = new PrismaClient(); p.excelFile.findMany().then(console.log).finally(() => p.$disconnect())'

# Info de Node activo
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm current

# Editar systemd unit
sudo nano /etc/systemd/system/vialidad.service
sudo systemctl daemon-reload
sudo systemctl restart vialidad
```

---

## 14. Contactos

| Rol | Quién |
|---|---|
| Owner del repo GitHub | `lucasringuelet` |
| Admin del server | (a definir por el equipo) |
| Equipo de Presupuesto Vialidad | (consumidor de la app) |
| Soporte técnico | (a definir) |

---

**Última actualización**: 2026-05-06
