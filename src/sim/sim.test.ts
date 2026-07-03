/**
 * Tests headless de la simulación: corre días de juego en ms sin worker ni
 * THREE. Verifica los criterios de aceptación de la Fase 3:
 * - T3.4: el patrón diario EMERGE (dormir de noche, trabajar de día, comer).
 * - T3.2: las rutas se calculan y los agentes llegan a destino.
 * - T3.7: hay charlas emergentes.
 * - T3.8: hay empleo real asignado.
 * - Determinismo: dos runs con la misma semilla → mismo estado.
 */
import { seedWorld } from '../world/seed';
import { Simulation } from './simulation';
import { TICK_GAME_S, DAY_GAME_SECONDS } from './clock';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

const TICKS_PER_DAY = Math.round(DAY_GAME_SECONDS / TICK_GAME_S);

function runDays(seed: number, days: number) {
  const sim = new Simulation(seedWorld(), seed);
  // Muestreo por ciudadano: horas durmiendo/trabajando de noche vs día.
  const sleepAtNight = new Map<number, number>();
  const sleepAtDay = new Map<number, number>();
  const workDaylight = new Map<number, number>();
  let ateCount = new Map<number, number>();
  let chats = 0;
  let moves = 0;

  for (let t = 0; t < TICKS_PER_DAY * days; t++) {
    sim.step();
    for (const e of sim.takeEvents()) if (e.name === 'chatStarted') chats++;
    const dark = sim.clock.darkness > 0.5;
    for (const c of sim.citizens.values()) {
      if (c.activity === 'sleep' && c.phase.kind === 'doing') {
        const m = dark ? sleepAtNight : sleepAtDay;
        m.set(c.id, (m.get(c.id) ?? 0) + 1);
      }
      if (c.activity === 'work' && c.phase.kind === 'doing' && !dark)
        workDaylight.set(c.id, (workDaylight.get(c.id) ?? 0) + 1);
      if (c.activity === 'eat' && c.phase.kind === 'doing')
        ateCount.set(c.id, (ateCount.get(c.id) ?? 0) + 1);
      if (c.phase.kind === 'moving') moves++;
    }
  }
  return { sim, sleepAtNight, sleepAtDay, workDaylight, ateCount, chats, moves };
}

console.log('sim.test — 3 días de juego, semilla fija');
const r = runDays(42, 3);
const citizens = [...r.sim.citizens.values()];

check('hay población (≥ 5 ciudadanos)', citizens.length >= 5, `→ ${citizens.length}`);

const employed = citizens.filter((c) => c.work).length;
check('T3.8: hay empleo real asignado', employed > 0, `→ ${employed}/${citizens.length}`);

const sleepers = citizens.filter((c) => (r.sleepAtNight.get(c.id) ?? 0) > 0).length;
check('T3.4: casi todos duermen de noche', sleepers >= citizens.length * 0.8, `→ ${sleepers}/${citizens.length}`);

const nightTicks = [...r.sleepAtNight.values()].reduce((a, b) => a + b, 0);
const dayTicks = [...r.sleepAtDay.values()].reduce((a, b) => a + b, 0);
check('T3.4: se duerme MUCHO más de noche que de día', nightTicks > dayTicks * 2, `→ noche ${nightTicks} vs día ${dayTicks}`);

const workers = citizens.filter((c) => c.work);
const workedInDaylight = workers.filter((c) => (r.workDaylight.get(c.id) ?? 0) > 0).length;
check('T3.4: los empleados trabajan de día', workedInDaylight >= Math.max(1, workers.length * 0.7), `→ ${workedInDaylight}/${workers.length}`);

const eaters = citizens.filter((c) => (r.ateCount.get(c.id) ?? 0) > 0).length;
check('T3.5: casi todos comen', eaters >= citizens.length * 0.8, `→ ${eaters}/${citizens.length}`);

check('T3.2: los agentes se mueven por rutas', r.moves > 100, `→ ${r.moves} ticks-moving`);
check('T3.7: hay charlas emergentes', r.chats > 0, `→ ${r.chats}`);

// Determinismo: mismo snapshot final con la misma semilla.
const a = runDays(7, 1).sim.snapshot();
const b = runDays(7, 1).sim.snapshot();
check('determinismo: misma semilla → mismo estado', a.length === b.length && a.every((v, i) => v === b[i]));

// Rendimiento: presupuesto ≤ 50 ms/tick (contrato §1.5) con margen enorme aquí.
{
  const sim = new Simulation(seedWorld(), 99);
  const t0 = performance.now();
  for (let i = 0; i < TICKS_PER_DAY; i++) sim.step();
  const perTick = (performance.now() - t0) / TICKS_PER_DAY;
  check('§1.5: tick medio ≤ 50 ms', perTick <= 50, `→ ${perTick.toFixed(2)} ms`);
}

console.log(`\n${passed} ok, ${failed} fallos`);
if (failed > 0) throw new Error(`${failed} tests fallidos`);
