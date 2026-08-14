#!/bin/bash
cd /home/z/my-project
while true; do
  bun run next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server died, restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
