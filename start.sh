#!/bin/bash
cd /home/z/my-project
while true; do
  echo "=== Starting Next.js dev server at $(date) ==="
  bun run next dev -p 3000
  EXIT_CODE=$?
  echo "=== Server exited with code $EXIT_CODE, restarting in 3s ==="
  sleep 3
done
