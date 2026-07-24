#!/bin/bash
# If no server is running on port 3000, start one
if ! ss -tlnp 2>/dev/null | grep -q ":3000 "; then
  cd /home/z/my-project
  NODE_ENV=production nohup node .next/standalone/server.js > /home/z/my-project/dev.log 2>&1 &
  echo "[$(date)] Server restarted" >> /home/z/my-project/dev.log
fi
