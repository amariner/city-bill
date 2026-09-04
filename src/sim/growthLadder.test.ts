// H7.2 — La escalera de demanda no se bloquea: una demanda pública que no
// puede atenderse (sin dinero, servicios desactivados, sin parcela útil) se
// salta y la ciudad sigue levantando vivienda/empleo. Y los servicios solo se
// levantan donde cubren hogares.
import { Simulation, MAX_BUILDS_PER_DAY } from './simulation';
import { DAY_GAME_SECONDS, TICK_GAME_S } from './clock';
import { seedWorld } from '../world/seed';
import { catalogData } from '../world/catalogData';
import { computeDemands, computeDemand } from '../world/growth';

const TICKS_PER_DAY = Math.round(DAY_GAME_SECONDS / TICK_GAME_S);
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' ' + detail : ''}`);
}

// (a) Puro: la lista está ordenada y la primera coincide con computeDemand.
{
  const base = {
    population: 40, employed: 40, jobs: 41, freeHousing: 0, shops: 2, avgProsperity: 0.5,
    tier: 2 as const, children: 6, studentSlots: 0, avgHealth: 0.95, hasClinic: false,
    totalPopulation: 70, carryingCapacity: 500, policeCoverage: 0, avgHappiness: 0.9,
  };
  const list = computeDemands(base);
  check('escalera: escuela, clínica, policía y vivienda, en ese orden', JSON.stringify(list) === JSON.stringify(['school', 'clinic', 'police', 'residential']), `→ ${list.join(',')}`);
  check('escalera: computeDemand es la primera de la lista', computeDemand(base) === list[0]);
  check('escalera: sin presión no pide nada', computeDemands({ ...base, children: 0, hasClinic: true, policeCoverage: 1, freeHousing: 3 }).length === 0);
}

// (b) Integrado: con los servicios desactivados (antes: la clínica pendiente
// bloqueaba TODO el crecimiento), la ciudad sigue construyendo vivienda/empleo.
{
  const sim = new Simulation(seedWorld(4242), 4242);
  sim.publicAutobuild = 'off';
  let privateBuilt = 0;
  let serviceBuilt = 0;
  let serviceNeeded = 0;
  for (let t = 0; t < TICKS_PER_DAY * 20; t++) {
    sim.step();
    for (const e of sim.takeEvents()) {
      if (e.name === 'serviceNeeded') serviceNeeded++;
      if (e.name === 'cityGrew') {
        const it = catalogData(String(e.data.id));
        if (it?.service || it?.students) serviceBuilt++; else privateBuilt++;
      }
    }
  }
  check('sin bloqueo: con servicios apagados se siguen levantando casas y empleo', privateBuilt >= 6, `→ ${privateBuilt} obras privadas`);
  check('sin bloqueo: no se levanta ningún servicio apagado', serviceBuilt === 0, `→ ${serviceBuilt}`);
  check('sin bloqueo: la necesidad se avisa (una vez por tipo)', serviceNeeded >= 1 && serviceNeeded <= 5, `→ ${serviceNeeded} avisos`);
}

// (c) Integrado: cada servicio autónomo cubre al menos un hogar al nacer, y no
// llueven parques (antes: 94 parques para 72 habitantes en la semilla 4242).
{
  const sim = new Simulation(seedWorld(4242), 4242);
  let services = 0;
  let uncovering = 0;
  for (let t = 0; t < TICKS_PER_DAY * 40; t++) {
    sim.step();
    for (const e of sim.takeEvents()) {
      if (e.name !== 'cityGrew') continue;
      const it = catalogData(String(e.data.id));
      if (!it?.service) continue;
      services++;
      const b = sim.index.buildings.find((x) => x.ax === e.data.cx && x.az === e.data.cz);
      const homesInRange = b
        ? sim.index.ofRole('residential').filter((h) => Math.abs(h.cx - b.cx) + Math.abs(h.cz - b.cz) <= it.service!.radius).length
        : 0;
      if (homesInRange === 0) uncovering++;
    }
  }
  const homes = sim.index.ofRole('residential').length;
  const parks = sim.index.buildings.filter((b) => b.data.role === 'park').length;
  check('servicios: todo servicio autónomo nace cubriendo algún hogar', uncovering === 0, `→ ${uncovering}/${services} sin cubrir`);
  check('servicios: no llueven parques', parks <= Math.max(2, Math.ceil(homes / 6)), `→ ${parks} parques para ${homes} viviendas`);
  check('servicios: el pueblo sigue creciendo en 40 días', homes >= 20 && sim.citizens.size >= 60, `→ ${homes} viviendas, ${sim.citizens.size} hab.`);
}

// (d) Tope de obras por día: ningún día supera MAX_BUILDS_PER_DAY obras autónomas.
{
  const sim = new Simulation(seedWorld(4242), 4242);
  let worst = 0;
  for (let day = 0; day < 30; day++) {
    let built = 0;
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      sim.step();
      for (const e of sim.takeEvents()) if (e.name === 'cityGrew') built++;
    }
    worst = Math.max(worst, built);
  }
  check(`ritmo: ningún día supera ${MAX_BUILDS_PER_DAY} obras`, worst <= MAX_BUILDS_PER_DAY, `→ máx ${worst}/día`);
}

// (e) Inmigración a viviendas vacías (T4.3): sin construir nada, un pueblo con
// huecos y empleo recibe familias forasteras (beat `familyArrived`).
{
  const sim = new Simulation(seedWorld(4242), 4242);
  sim.autonomousGrowth = false;
  let arrivals = 0;
  for (let t = 0; t < TICKS_PER_DAY * 30; t++) {
    sim.step();
    for (const e of sim.takeEvents()) if (e.name === 'familyArrived') arrivals++;
  }
  check('inmigración: llegan familias a viviendas vacías sin obra nueva', arrivals > 0, `→ ${arrivals} llegadas en 30 días`);
  check('inmigración: nunca por encima de la capacidad', [...sim.index.ofRole('residential')].every((b) => ((sim as unknown as { households: Map<string, number> }).households.get(`${b.ax},${b.az}`) ?? 0) <= b.capacity));
}

console.log(`\ngrowthLadder.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
