const { spawn } = require('child_process');
const fs = require('fs');

const env = {
  ...process.env,
  DATABASE_URL: 'file:/home/z/my-project/db/custom.db',
  NODE_OPTIONS: '--max-old-space-size=2048'
};

function startServer() {
  const log = (msg) => fs.appendFileSync('/home/z/my-project/server-monitor.log', `[${new Date().toISOString()}] ${msg}\n`);
  
  log('Starting Next.js dev server...');
  const child = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: '/home/z/my-project',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  
  child.stdout.on('data', (data) => {
    fs.appendFileSync('/home/z/my-project/dev.log', data);
  });
  
  child.stderr.on('data', (data) => {
    fs.appendFileSync('/home/z/my-project/dev.log', data);
  });
  
  child.on('exit', (code) => {
    log(`Server exited with code ${code}, restarting in 3s...`);
    setTimeout(startServer, 3000);
  });
  
  child.unref();
  log(`Server started with PID ${child.pid}`);
}

startServer();
