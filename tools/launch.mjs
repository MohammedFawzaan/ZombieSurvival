import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);

const env = { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'production' };
delete env.ELECTRON_RUN_AS_NODE;

const electronBinary = require('electron');

const child = spawn(electronBinary, ['.'], {
  cwd: root,
  env,
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error('failed to launch electron:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
