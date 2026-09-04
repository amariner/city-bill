/**
 * Sonda de trazado (H7). No forma parte del bundle:
 *   npx tsx scripts/layoutProbe.ts [farm|world] [seed] [días] [cada]
 * Imprime cada `cada` días: población, edificios, tramos autotrazados,
 * métricas de forma (`layoutMetrics`) y obras por día (máximo y media móvil
 * de 7 días), para comparar políticas de crecimiento con números y no a ojo.
 */
import { Simulation } from '../src/sim/simulation';
import { DAY_GAME_SECONDS, TICK_GAME_S } from '../src/sim/clock';
import { seedFarm, seedWorld } from '../src/world/seed';
import { layoutMetrics } from '../src/world/growth';

const TICKS_PER_DAY = Math.round(DAY_GAME_SECONDS / TICK_GAME_S);
const scene = process.argv[2] ?? 'world';
const seed = Number(process.argv[3] ?? 4242);
const days = Number(process.argv[4] ?? 80);
const every = Number(process.argv[5] ?? 10);

const sim = new Simulation(scene === 'farm' ? seedFarm(seed) : seedWorld(seed), seed);
const perDay: number[] = [];
const byId = new Map<string, number>();
const byEvent = new Map<string, number>();
let maxPerDay = 0;
console.log(`escena=${scene} seed=${seed} días=${days}`);
console.log('día  hab  edif  vías  obras/d(max, mm7)  aspect  tramos  manzanas  tesoro');
for (let day = 1; day <= days; day++) {
  let built = 0;
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    sim.step();
    for (const e of sim.takeEvents()) { byEvent.set(e.name, (byEvent.get(e.name) ?? 0) + 1); if (e.name === 'cityGrew') { built++; const id = String(e.data.id); byId.set(id, (byId.get(id) ?? 0) + 1); } }
  }
  perDay.push(built);
  maxPerDay = Math.max(maxPerDay, built);
  if (day % every === 0 || day === days) {
    const last7 = perDay.slice(-7);
    const mm7 = last7.reduce((a, b) => a + b, 0) / last7.length;
    const m = layoutMetrics(sim.grid);
    console.log(
      `${String(day).padStart(3)}  ${String(sim.citizens.size).padStart(3)}  ${String(m.buildings).padStart(4)}  ${String(sim.roadsExtended).padStart(4)}  ` +
      `${String(maxPerDay).padStart(4)} ${mm7.toFixed(2).padStart(6)}   ${m.aspect.toFixed(2).padStart(5)}  ${String(m.streets).padStart(6)}  ${String(m.blocks).padStart(8)}  ${Math.round(sim.economy.treasury)}`,
    );
    const st = sim.cityStats() as unknown as { demand?: { R: number; C: number; I: number }; jobs?: number; employed?: number; freeHousing?: number };
    const d = st.demand;
    console.log(`     demanda R/C/I=${d ? `${d.R.toFixed(2)}/${d.C.toFixed(2)}/${d.I.toFixed(2)}` : '?'}  viviendas libres=${sim.freeHousing()}  obras: ${[...byId].map(([k, v]) => `${k}×${v}`).join(' ')}`);
    const cs = sim.cityStats() as unknown as { happiness?: number; coverage?: Record<string, number>; unemployment?: number };
    const ev = ['citizenBorn', 'familyArrived', 'citizenLeft', 'citizenDied', 'epidemic', 'buildingAbandoned'].map((k) => `${k}=${byEvent.get(k) ?? 0}`).join(' ');
    console.log(`     felicidad=${cs.happiness?.toFixed(2) ?? '?'} cobertura=${cs.coverage ? Object.entries(cs.coverage).map(([k, v]) => `${k[0]}${Math.round(v * 100)}`).join(' ') : '?'}  ${ev}`);
    byId.clear();
    byEvent.clear();
  }
}
