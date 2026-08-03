#!/bin/bash
cd /home/z/my-project/.next/standalone
# Ensure exceljs is available
if [ ! -d "node_modules/exceljs" ]; then
  mkdir -p node_modules
  cp -r /home/z/my-project/node_modules/exceljs node_modules/
fi
export NODE_ENV=production
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NEXTAUTH_SECRET="d499cf837973efa67f978495230110fb296af39ef49ef76a100acce125d78006"
export PORT=3000
export HOSTNAME=0.0.0.0
exec node server.js
