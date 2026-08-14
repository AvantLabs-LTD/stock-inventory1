#!/bin/bash
# Reliable server keepalive for the inventory app
cd /home/z/my-project

while true; do
  # Check if server is already running and healthy
  if curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null | grep -q '200\|302\|307'; then
    sleep 5
    continue
  fi
  
  # Kill any stale processes
  pkill -f 'next-server' 2>/dev/null
  pkill -f 'node.*server.js' 2>/dev/null
  sleep 1
  
  # Start server
  echo "[$(date)] Starting server..." >> /home/z/my-project/dev.log
  PORT=3000 HOSTNAME=0.0.0.0 NODE_OPTIONS='--max-old-space-size=256' nohup node .next/standalone/server.js >> /home/z/my-project/dev.log 2>&1 &
  
  # Wait for it to be ready
  for i in $(seq 1 15); do
    sleep 1
    if curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null | grep -q '200\|302\|307'; then
      echo "[$(date)] Server ready" >> /home/z/my-project/dev.log
      break
    fi
  done
  
  sleep 5
done
