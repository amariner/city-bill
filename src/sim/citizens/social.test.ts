// H6.3 — acquaintNeighbours (hash espacial) debe producir EXACTAMENTE el mismo
// resultado que el barrido cuadrático i<j, incluido el orden de inserción en
// `friends` (así el cierre del día no cambia de trayectoria).
import { SocialSystem } from './social';
import type { Citizen } from './citizen';
import { createRng } from '../../rng';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' ' + detail : ''}`);
}

function town(seed: number, n: number, spread: number): Citizen[] {
  const rng = createRng(seed);
  const out: Citizen[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: i + 1, home: { ax: Math.floor(rng.range(-spread, spread)), az: Math.floor(rng.range(-spread, spread)) }, friends: new Map() } as unknown as Citizen);
  }
  return out;
}

function brute(all: Citizen[], range: number): void {
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (Math.abs(a.home.ax - b.home.ax) + Math.abs(a.home.az - b.home.az) < range) SocialSystem.acquaint(a, b);
    }
}

function fingerprint(all: Citizen[]): string {
  return JSON.stringify(all.map((c) => [...c.friends]));
}

for (const [seed, n, spread] of [[1, 60, 30], [2, 400, 120], [3, 1500, 400]] as const) {
  const a = town(seed, n, spread);
  const b = town(seed, n, spread);
  brute(a, 40);
  SocialSystem.acquaintNeighbours(b, 40);
  const links = a.reduce((s, c) => s + c.friends.size, 0);
  check(`hash espacial == barrido cuadrático (n=${n}, ${links} enlaces, con orden)`, fingerprint(a) === fingerprint(b));
  check(`hay vecinos que NO se conocen (n=${n})`, links < n * (n - 1));
}

{
  // Rendimiento: 3000 hogares dispersos, muy por debajo del presupuesto del cierre del día.
  // El worker vive durante toda la partida: medir caliente, con hogares nuevos
  // en cada muestra. La mediana evita que una pausa del SO/GC decida el test.
  SocialSystem.acquaintNeighbours(town(9, 3000, 600), 40);
  const samples: number[] = [];
  for (let sample = 0; sample < 5; sample++) {
    const c = town(9, 3000, 600);
    const t0 = performance.now();
    SocialSystem.acquaintNeighbours(c, 40);
    samples.push(performance.now() - t0);
  }
  const ms = [...samples].sort((a, b) => a - b)[2];
  check('3000 hogares en ≤ 25 ms (mediana de 5)', ms <= 25,
    `→ ${ms.toFixed(1)} ms [${samples.map((n) => n.toFixed(1)).join(', ')}]`);
}

console.log(`\nsocial.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
