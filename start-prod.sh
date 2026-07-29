#!/bin/bash
cd /home/z/my-project/.next/standalone
export NODE_ENV=production
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NEXTAUTH_SECRET="d499cf837973efa67f978495230110fb296af39ef49ef76a100acce125d78006"
export PORT=3000
export HOSTNAME=0.0.0.0
exec node server.js
