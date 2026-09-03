/** Tráfico H5.1: carga por celda, decaimiento y velocidad bajo congestión. */
import { Grid, cellKey } from '../world/grid';
import { ROAD_SPECS } from '../world/roads';
import { Simulation } from './simulation';
import { congestionFactor, decayTraffic, MIN_CONGESTION_FACTOR } from './traffic';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const ruralCapacity = ROAD_SPECS.rural.capacity;
check('tráfico: una vía vacía conserva la velocidad', congestionFactor(0, ruralCapacity) === 1);
check('tráfico: la mitad de la capacidad reduce a la mitad', congestionFactor(ruralCapacity / 2, ruralCapacity) === 0.5);
check('tráfico: doscientos coches respetan el suelo mínimo', congestionFactor(200, ruralCapacity) === MIN_CONGESTION_FACTOR);
check('tráfico: entradas inválidas no generan factores extraños', congestionFactor(Number.NaN, 0) === 1);

{
  const traffic = new Map<number, number>([[7, 10], [8, 0.001]]);
  decayTraffic(traffic, 1);
  check('decaimiento: una hora multiplica la carga por 0.9', Math.abs((traffic.get(7) ?? 0) - 9) < 1e-9);
  check('decaimiento: los rastros residuales terminan desapareciendo', !traffic.has(8));
  decayTraffic(traffic, 1000);
  check('decaimiento: nunca deja cargas negativas', [...traffic.values()].every((load) => load >= 0));
}

function trafficGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-12, -12, 12, 12, 'field');
  for (let cx = -10; cx <= 10; cx++) grid.setRoad(cx, 0, 'rural');
  grid.placeBuilding('cottage', 3, 3, 4, 3, 0);
  return grid;
}

{
  const sim = new Simulation(trafficGrid(), 5101);
  sim.autonomousGrowth = false;
  const readSpeed = sim as unknown as { speedAt: (cx: number, cz: number, mode: 'foot' | 'car') => number; stepWalk: (c: unknown) => void };
  const empty = readSpeed.speedAt(0, 0, 'car');
  sim.traffic.set(cellKey(0, 0), ruralCapacity);
  const crowded = readSpeed.speedAt(0, 0, 'car');
  check('velocidad: la carga reduce el coche', crowded < empty && crowded > 0);
  check('velocidad: el suelo conserva un trayecto viable', Math.abs(crowded - empty * MIN_CONGESTION_FACTOR) < 1e-9);

  const citizen = [...sim.citizens.values()][0];
  if (citizen) {
    citizen.phase = {
      kind: 'moving',
      path: [[0, 0], [1, 0]],
      segment: 0,
      t: 0,
      next: { activity: 'none', target: null, cell: [1, 0], duration: 0 },
      mode: 'car',
    };
    citizen.x = 0.5;
    citizen.z = 0.5;
    sim.traffic.delete(cellKey(0, 0));
    readSpeed.stepWalk(citizen);
    check('carga: un coche suma una ocupación en su celda', sim.traffic.get(cellKey(0, 0)) === 1);
  } else {
    check('carga: la fixture aporta un ciudadano para el trayecto', false);
  }

  sim.traffic.set(cellKey(0, 0), ruralCapacity);
  check('HUD: publica saturación media de la red', sim.cityStats().congestion > 0 && sim.cityStats().congestion <= 1);
  const saved = JSON.parse(JSON.stringify(sim.serialize()));
  const restored = new Simulation(Grid.deserialize(saved.gridJson), 5101, saved);
  check('save: conserva la carga residual de tráfico', restored.traffic.get(cellKey(0, 0)) === ruralCapacity);
}

console.log(`\ntraffic.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
