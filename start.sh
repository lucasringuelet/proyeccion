#!/usr/bin/env bash
set -euo pipefail

# Inicia backend + frontend en modo dev (hot reload).
# Uso: ./start.sh

cd "$(dirname "$0")"

if [ ! -f backend/.env ]; then
  echo "Falta backend/.env. Copiá backend/.env.example y editalo:"
  echo "  cp backend/.env.example backend/.env"
  exit 1
fi

if [ ! -d node_modules ] || [ ! -d backend/node_modules ] || [ ! -d web/node_modules ]; then
  echo "Instalando dependencias…"
  npm install
fi

if [ ! -f backend/data/app.db ]; then
  echo "Inicializando base de datos…"
  npm run prisma:migrate -- --name init
  npm run seed
fi

npm run dev
