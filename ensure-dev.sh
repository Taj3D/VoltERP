#!/bin/bash
cd /home/z/my-project
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NODE_OPTIONS="--max-old-space-size=2048"

# Check if server is responding
if ! curl -s http://localhost:3000/ -o /dev/null -w "" 2>/dev/null; then
  echo "[$(date)] Dev server not responding, killing old processes and restarting..." >> /home/z/my-project/ensure-dev.log
  pkill -f "next dev" 2>/dev/null
  sleep 2
  nohup npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1 &
  disown
  echo "[$(date)] Restarted dev server" >> /home/z/my-project/ensure-dev.log
fi
