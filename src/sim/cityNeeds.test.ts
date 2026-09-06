import { cityNeeds, type CityNeedsContext } from './cityNeeds';
import { computeDemands, type DemandInput } from '../world/growth';
import { catalogData } from '../world/catalogData';
import { seedFarm } from '../world/seed';
import { Grid } from '../world/grid';
import { Simulation } from './simulation';

const assert = {
  equal(actual: unknown, expected: unknown, message = 'igualdad'): void {
    if (actual !== expected) throw new Error(`${message}: ${actual} !== ${expected}`);
  },
  deepEqual(actual: unknown, expected: unknown, message = 'equivalencia estructural'): void {
    this.equal(JSON.stringify(actual), JSON.stringify(expected), message);
  },
  match(actual: string, expected: RegExp): void {
    this.equal(expected.test(actual), true, `texto: ${actual}`);
  },
};

const demand: DemandInput = {
  population: 24, employed: 24, jobs: 28, freeHousing: 0, shops: 0, avgProsperity: 0,
  tier: 2, children: 6, studentSlots: 0, avgHealth: 0.9, hasClinic: false,
  totalPopulation: 30, carryingCapacity: 160,
};
const context: CityNeedsContext = {
  treasury: 10000, bankrupt: false, publicAutobuild: 'paid', growthPolicy: 'free',
  autonomousGrowth: true, abandoned: [],
};
const baseline = cityNeeds(demand, context);
assert.deepEqual(baseline.map((need) => need.id), computeDemands(demand).slice(0, 3), 'respeta la prioridad real de crecimiento');
for (const need of baseline) {
  assert.equal(need.action.kind, 'build');
  if (need.action.kind === 'build') assert.equal(catalogData(need.action.itemId)?.playerPlaceable, true, 'la acción llega a una ficha del catálogo');
}
assert.equal(cityNeeds({ ...demand, studentSlots: 6 }, context).some((need) => need.id === 'school'), false, 'desaparece la necesidad al cubrir plazas');
assert.equal(cityNeeds({ ...demand, hasClinic: true }, context).some((need) => need.id === 'clinic'), false, 'un consultorio activo satisface la regla sanitaria');
const poor = cityNeeds(demand, { ...context, treasury: 0 });
assert.equal(poor[0].action.kind, 'budget', 'la falta de dinero dirige al presupuesto');
assert.match(poor[0].status, /Faltan/);
assert.match(cityNeeds(demand, { ...context, publicAutobuild: 'off' })[0].status, /desactivados/);
assert.match(cityNeeds({ ...demand, children: 0, hasClinic: true }, { ...context, growthPolicy: 'zonesOnly' })[0].status, /zona compatible/);
const crisis = cityNeeds(demand, { ...context, bankrupt: true, abandoned: [[4, 7], [8, 9]] });
assert.equal(crisis.length, 3, 'máximo de tres prioridades');
assert.deepEqual(crisis.map((need) => need.id), ['budget', 'access', 'school']);
assert.deepEqual(crisis[1].action, { kind: 'road', cell: [4, 7] }, 'localiza un edificio realmente cerrado');
assert.deepEqual(cityNeeds({ ...demand, population: 0, employed: 0, jobs: 0, freeHousing: 2, children: 0 }, context), [], 'sin demanda no inventa obras');

// Consultar los diagnósticos no cambia el futuro ni el estado guardado.
{
  const grid = seedFarm(71);
  grid.fillTerrain(30, 0, 50, 20, 'field');
  assert.equal(grid.placeBuilding('school', 5, 4, 32, 2, 0), true);
  const schoolTown = new Simulation(grid, 71);
  for (const citizen of schoolTown.citizens.values()) citizen.age = 10;
  assert.equal(schoolTown.cityStats().needs.some((need) => need.id === 'school'), false);
  schoolTown.index.buildings.find((b) => b.id === 'school')!.abandoned = true;
  assert.equal(schoolTown.cityStats().needs.some((need) => need.id === 'school'), true,
    'una escuela cerrada no ofrece plazas en la demanda compartida');
}

const sim = new Simulation(seedFarm(42), 42);
sim.cityStats(); // actualiza la bandera preexistente de quiebra antes de comparar
const saved = JSON.stringify(sim.serialize());
const stats = sim.cityStats();
assert.deepEqual(sim.cityStats().needs, stats.needs);
assert.equal(JSON.stringify(sim.serialize()), saved, 'la lectura no consume RNG ni escribe estado');
const state = JSON.parse(saved);
const restored = new Simulation(Grid.deserialize(state.gridJson), 42, state);
assert.deepEqual(restored.cityStats().needs, stats.needs, 'los avisos se reconstruyen desde el save');
for (let tick = 0; tick < 40; tick++) {
  sim.cityStats();
  sim.step();
  restored.step();
}
assert.deepEqual(sim.snapshot(), restored.snapshot(), 'la frecuencia de lectura no cambia la simulación');
assert.equal(sim.grid.serialize(), restored.grid.serialize());
console.log('cityNeeds.test: prioridades, acciones, resolución, dinero, determinismo y guardado passed');
