/** Propiedades de la felicidad por hogar (H4.3). */
import { Grid } from '../world/grid';
import { COVERAGE_BITS } from './coverage';
import { householdHappiness, HouseholdHappinessInput } from './happiness';
import { Simulation } from './simulation';
import { DAY_GAME_SECONDS, TICK_GAME_S } from './clock';

let passed = 0;
let failed = 0;
function check(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

const needs = { energy: 0.8, food: 0.8, social: 0.8, fun: 0.8, purpose: 0.8 };
const base: HouseholdHappinessInput = {
  needs,
  coverage: Object.values(COVERAGE_BITS).reduce((mask, bit) => mask | bit, 0),
  children: 1,
  taxBurden: 0.2,
  unemployment: 0,
  illness: 0,
  grief: 0,
  industryPressure: 0,
};

// Cada eje tiene una dirección monotónica y la educación solo pesa cuando hay
// niños en el hogar.
{
  const full = householdHappiness(base);
  check(householdHappiness({ ...base, needs: { ...needs, food: 0.1 } }) < full, 'felicidad: el hambre reduce el resultado');
  check(householdHappiness({ ...base, coverage: 0 }) < full, 'felicidad: perder servicios reduce el resultado');
  check(householdHappiness({ ...base, taxBurden: 0.5 }) < full, 'felicidad: una carga fiscal mayor reduce el resultado');
  check(householdHappiness({ ...base, unemployment: 0.8 }) < full, 'felicidad: el desempleo reduce el resultado');
  check(householdHappiness({ ...base, illness: 0.8 }) < full, 'felicidad: la enfermedad reduce el resultado');
  check(householdHappiness({ ...base, grief: 0.8 }) < full, 'felicidad: el duelo reduce el resultado');
  check(householdHappiness({ ...base, industryPressure: 1 }) < full, 'felicidad: la industria cercana reduce el resultado');
  const noChildren = householdHappiness({ ...base, children: 0 });
  const noChildrenNoEducation = householdHappiness({ ...base, children: 0, coverage: base.coverage & ~COVERAGE_BITS.education });
  check(noChildren === noChildrenNoEducation, 'felicidad: educación no penaliza a un hogar sin niños');
  check(full >= 0 && full <= 1 && householdHappiness({ ...base, coverage: 0, taxBurden: 5, illness: 5 }) >= 0, 'felicidad: queda acotada en [0,1]');
}

// La muestra es diaria: durante el mismo día no cambia por consultar el HUD y
// un save conserva el valor de la última muestra.
{
  const grid = new Grid();
  grid.fillTerrain(-6, -6, 8, 8, 'field');
  for (let cx = -6; cx <= 8; cx++) grid.setRoad(cx, -2, 'rural');
  check(grid.placeBuilding('farmhouse', 5, 4, 0, 0), 'integración: coloca el hogar de prueba');
  const sim = new Simulation(grid, 1234);
  sim.autonomousGrowth = false;
  const citizen = [...sim.citizens.values()][0];
  const initial = sim.describe(citizen.id)?.happiness ?? -1;
  for (let tick = 0; tick < Math.round(DAY_GAME_SECONDS / TICK_GAME_S) - 1; tick++) sim.step();
  check(sim.describe(citizen.id)?.happiness === initial, 'integración: no recalcula felicidad a mitad del día');
  sim.step();
  const save = sim.serialize();
  const restored = new Simulation(Grid.deserialize(save.gridJson), 1234, save);
  check(Math.abs(restored.cityStats().happiness - sim.cityStats().happiness) < 1e-9, 'integración: el save conserva la felicidad diaria');
}

console.log(`\nhappiness.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
