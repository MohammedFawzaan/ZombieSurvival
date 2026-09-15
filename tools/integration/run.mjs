import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const SUITES = {
  smoke: 'smoke.cjs',
  direction: 'direction.cjs',
  collision: 'collision.cjs',
  obstacles: 'obstacles.cjs',
  melee: 'melee.cjs',
  performance: 'performance.cjs',
  launch: 'launchcheck.cjs',
  screenshots: 'screenshots.cjs',
  pacing: 'pacing.cjs',
  flicker: 'flicker.cjs',
  zombieart: 'zombieart.cjs',
  zombieshots: 'zombieshots.cjs',
  deathflow: 'deathflow.cjs',
  menureset: 'menureset.cjs',
  uishot: 'uishot.cjs',
  atmosphere: 'atmosphere.cjs',
  skycheck: 'skycheck.cjs',
  prodlaunch: 'prodlaunch.cjs',
};

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const names = requested.length > 0 ? requested : Object.keys(SUITES).filter((n) => n !== 'screenshots' && n !== 'zombieshots' && n !== 'uishot');

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/index.html is missing. Run "npm run build" first.');
  process.exit(1);
}

const electron = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
);

const results = [];

for (const name of names) {
  const file = SUITES[name];
  if (!file) {
    console.error(`Unknown suite "${name}". Available: ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }

  const appDir = mkdtempSync(path.join(os.tmpdir(), `zs-${name}-`));
  writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify({ name: `zs-${name}`, version: '1.0.0', main: 'main.cjs' }),
  );
  const src = path.join(here, file);
  let code = readFileSync(src, 'utf8');
  // The harness resolves the project relative to its own location; point it at
  // the real repository now that it runs from a temp directory.
  code = code.replace(
    /const root = path\.resolve\([^)]*\);/,
    `const root = ${JSON.stringify(root)};`,
  );
  writeFileSync(path.join(appDir, 'main.cjs'), code);

  console.log(`\n${'='.repeat(70)}\n  ${name}\n${'='.repeat(70)}`);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const res = spawnSync(electron, [appDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32',
    timeout: 6 * 60 * 1000,
  });

  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  process.stdout.write(out);
  rmSync(appDir, { recursive: true, force: true });
  const verdict = /VERDICT[:\s=]*\b(PASS|FAIL)\b/.exec(out)?.[1] ?? 'none';
  results.push({ name, code: res.status ?? -1, verdict });
}

console.log(`\n${'='.repeat(70)}\n  SUMMARY\n${'='.repeat(70)}`);
let failed = 0;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.name}  (exit ${r.code}, reported ${r.verdict})`);
}
console.log('');
process.exit(failed > 0 ? 1 : 0);
