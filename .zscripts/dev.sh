#!/bin/bash
cd /home/z/my-project
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NODE_OPTIONS="--max-old-space-size=2048"

echo "Starting Next.js dev server with auto-restart..."
while true; do
  npx next dev -p 3000 2>&1 | tee /home/z/my-project/dev.log
  echo "[$(date)] Server exited, restarting in 3s..." >> /home/z/my-project/dev-restart.log
  sleep 3
done
