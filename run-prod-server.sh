#!/bin/bash
set -e
cd /home/z/my-project

# Start production server
NODE_ENV=production node .next/standalone/server.js &
SERVER_PID=$!
echo "Production server started (PID: $SERVER_PID)"

# Health check
for i in $(seq 1 30); do
    if curl -s --connect-timeout 1 --max-time 2 http://localhost:3000 > /dev/null 2>&1; then
        echo "Server is ready!"
        break
    fi
    sleep 1
done

# Keep alive by waiting on the server
echo "Waiting for server process..."
wait $SERVER_PID 2>/dev/null || true
echo "Server process ended, exiting..."
