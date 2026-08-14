#!/bin/bash
# Keepalive script for Next.js dev server
cd /home/z/my-project
while true; do
  if ! curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>/dev/null | grep -q '200'; then
    echo "$(date): Server down, restarting..." >> /tmp/keepalive.log
    pkill -f 'node.*standalone' 2>/dev/null
    sleep 1
    node .next/standalone/server.js -p 3000 > /tmp/srv.log 2>&1 &
    sleep 5
  fi
  sleep 10
done
