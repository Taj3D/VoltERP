#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting server..."
  DATABASE_URL='file:/home/z/my-project/db/custom.db' NODE_OPTIONS='--max-old-space-size=2048' node .next/standalone/server.js 2>&1
  echo "[$(date)] Server exited with code $?. Restarting in 2s..."
  sleep 2
done
