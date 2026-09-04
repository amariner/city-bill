// Runner de la suite: ejecuta TODOS los *.test.ts de src/ (no se detiene en el
// primer fallo) y resume al final. `npm test` = todo; `npm run test:fast`
// omite las sondas largas (sim.test.ts y growthLadder.test.ts, varios minutos).
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const fast = process.argv.includes('--fast');
// Sondas de días de juego (lentas): fuera de --fast, al final de la suite completa.
const SLOW = new Set(['src/sim/sim.test.ts', 'src/sim/growthLadder.test.ts']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const files = walk('src')
  .filter((f) => !(fast && SLOW.has(f)))
  .sort((a, b) => Number(SLOW.has(a)) - Number(SLOW.has(b)) || a.localeCompare(b));

const failed = [];
const t0 = Date.now();
for (const file of files) {
  const start = Date.now();
  const r = spawnSync('npx', ['tsx', file], { encoding: 'utf8' });
  const out = (r.stdout + r.stderr).trim().split('\n');
  const summary = out.filter((l) => /passed|fallos|ok,/.test(l)).at(-1) ?? out.at(-1) ?? '';
  const status = r.status === 0 ? 'ok ' : 'FAIL';
  console.log(`${status} ${file} (${((Date.now() - start) / 1000).toFixed(1)}s) ${summary.trim()}`);
  if (r.status !== 0) {
    failed.push(file);
    console.log(out.filter((l) => /✗|Error/.test(l)).join('\n'));
  }
}
console.log(`\n${files.length - failed.length}/${files.length} archivos verdes en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (failed.length) {
  console.log('FALLAN: ' + failed.join(', '));
  process.exit(1);
}
