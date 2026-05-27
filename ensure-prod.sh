#!/bin/bash
# Ensure VoltERP production server is running
pkill -f "server.js" 2>/dev/null
sleep 1
cd /home/z/my-project
DATABASE_URL='file:/home/z/my-project/db/custom.db' \
NODE_OPTIONS='--max-old-space-size=2048' \
nohup node .next/standalone/server.js > /home/z/my-project/prod.log 2>&1 &
disown
sleep 3
if curl -s http://127.0.0.1:3000/api/auth -X POST -H 'Content-Type: application/json' -d '{"email":"emart.amit","password":"Test_123"}' --max-time 5 | grep -q "usr1"; then
  echo "SUCCESS: Server running on port 3000"
else
  echo "FAILED: Server did not start"
fi
