import { Notice, requestUrl } from 'obsidian';
import { spawn } from 'child_process';

export async function pingServer(serverUrl: string) {
  try {
    const res = await requestUrl({ url: `${serverUrl}/test`, method: 'GET' });
    console.log('Forge API Result:', res.json);
    new Notice('Forge: Data retrieved');
  } catch {
    console.log('Forge API Error: Server offline');
  }
}

export async function ensureServerRunning(serverUrl: string) {
  try {
    const res = await requestUrl({ url: `${serverUrl}/test`, method: 'GET' });
    if (res.status === 200) {
      console.log('Forge: Server heartbeat detected');
      return;
    }
  } catch {
    console.log('Forge: Server offline, attempting to spawn...');
    spawnForgeServer(serverUrl);
  }
}

function spawnForgeServer(url: string) {
  const port = new URL(url).port || '8000';
  // TODO: Make the Python path and working directory configurable
  const pythonPath = '/Users/odedfuhrmann/projects/forge/.venv/bin/python';
  const serverProcess = spawn(pythonPath, [
    '-m', 'uvicorn',
    'forge.api.server:app',
    '--host', '127.0.0.1',
    '--port', port,
  ], {
    cwd: '/Users/odedfuhrmann/projects/forge',
    detached: true,
    stdio: 'ignore',
  });

  serverProcess.unref();

  console.log(`Forge: Spawning server on port ${port}...`);
  new Notice('Forge: Starting background server');
}
