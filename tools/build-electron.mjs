import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist-electron', { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' });
