/** Pruebas puras y de integración del valor del suelo (H4.4). */
import { Grid } from '../world/grid';
import { Simulation } from './simulation';
import { computeLandValue } from './landValue';
import { COVERAGE_BITS } from './coverage';
import { WorldIndex } from './worldIndex';
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

function homeIndex(): WorldIndex {
  const grid = new Grid();
  grid.fillTerrain(-12, -12, 24, 24, 'field');
  check(grid.placeBuilding('farmhouse', 5, 4, 0, 0), 'fixture: coloca la vivienda');
  return new WorldIndex(grid);
}

function homeValue(index: WorldIndex): number {
  return computeLandValue(index).get('0,0') ?? -1;
}

// Cada componente empuja el valor en la dirección declarada y el resultado se
// mantiene en [0,1]. Manipular la máscara de la vivienda permite aislar la
// fórmula sin depender de la colocación accidental de cinco proveedores.
{
  const index = homeIndex();
  const plain = homeValue(index);
  const home = index.at(0, 0)!;
  home.coverage = Object.values(COVERAGE_BITS).reduce((mask, bit) => mask | bit, 0);
  const covered = homeValue(index);
  check(covered > plain, 'valor: más cobertura aumenta el suelo');
  check(plain >= 0 && plain <= 1 && covered >= 0 && covered <= 1, 'valor: queda acotado en [0,1]');
}

// Parque y agua son amenidades equivalentes para el cálculo, ambas dentro de
// seis celdas del centro de la vivienda.
{
  const plain = homeValue(homeIndex());

  const parkIndex = homeIndex();
  check(parkIndex.grid.placeBuilding('park', 4, 4, 6, 0), 'fixture: coloca el parque');
  parkIndex.rebuild();
  check(homeValue(parkIndex) > plain, 'valor: un parque cercano aumenta el suelo');

  const waterIndex = homeIndex();
  waterIndex.grid.setTerrain(5, 3, 'water');
  waterIndex.rebuild();
  check(homeValue(waterIndex) > plain, 'valor: agua cercana aumenta el suelo');
}

// Una vía urbana mejora el frente; una oficina cercana representa presión de
// actividad y reduce el valor residencial aunque también acerque el centro.
{
  const plain = homeValue(homeIndex());

  const roadIndex = homeIndex();
  roadIndex.grid.setRoad(2, -1, 'street');
  roadIndex.rebuild();
  check(homeValue(roadIndex) > plain, 'valor: una calle urbana aumenta el suelo');

  const industrialIndex = homeIndex();
  check(industrialIndex.grid.placeBuilding('office', 5, 5, 5, 0), 'fixture: coloca la actividad cercana');
  industrialIndex.rebuild();
  check(homeValue(industrialIndex) < plain, 'valor: actividad cercana penaliza el suelo residencial');
}

// Un edificio abandonado deja de tener valor económico aunque su huella siga
// ocupando el terreno.
{
  const index = homeIndex();
  check(index.grid.setBuildingAbandoned(0, 0, true), 'fixture: abandona la vivienda');
  index.rebuild();
  check(homeValue(index) === 0, 'valor: un edificio abandonado vale cero');
}

// La sim conserva un snapshot durante el día: cambiar una vía y reconstruir el
// índice no reprecifica la renta ni el HUD hasta el siguiente cierre.
{
  const grid = new Grid();
  grid.fillTerrain(-8, -8, 12, 12, 'field');
  check(grid.placeBuilding('farmhouse', 5, 4, 0, 0), 'integración: coloca hogar para snapshot');
  const sim = new Simulation(grid, 7331);
  sim.autonomousGrowth = false;
  const before = sim.cityStats().avgLandValue;
  sim.grid.setRoad(2, -1, 'street');
  sim.index.rebuild();
  check(sim.cityStats().avgLandValue === before, 'integración: el HUD no cambia a mitad del día');
  sim.advanceDays(1);
  check(sim.cityStats().avgLandValue > before, 'integración: el cierre diario actualiza el suelo');

  const save = sim.serialize();
  const restored = new Simulation(Grid.deserialize(save.gridJson), 7331, save);
  check(Math.abs(restored.cityStats().avgLandValue - sim.cityStats().avgLandValue) < 1e-9, 'integración: el save conserva el suelo');
}

// Con el mismo hogar, el modificador de ubicación hace que la renta cobrada
// sea mayor de forma estrictamente monotónica.
{
  const grid = new Grid();
  grid.fillTerrain(-8, -8, 12, 12, 'field');
  check(grid.placeBuilding('farmhouse', 5, 4, 0, 0), 'renta: coloca hogar');
  const low = new Simulation(Grid.deserialize(grid.serialize()), 8128);
  const high = new Simulation(Grid.deserialize(grid.serialize()), 8128);
  low.autonomousGrowth = false;
  high.autonomousGrowth = false;
  const lowState = low as unknown as { landValue: Map<string, number>; chargeRent: () => void };
  const highState = high as unknown as { landValue: Map<string, number>; chargeRent: () => void };
  lowState.landValue.set('0,0', 0);
  highState.landValue.set('0,0', 1);
  const lowBefore = low.economy.walletOf('0,0');
  const highBefore = high.economy.walletOf('0,0');
  lowState.chargeRent();
  highState.chargeRent();
  const lowPaid = lowBefore - low.economy.walletOf('0,0');
  const highPaid = highBefore - high.economy.walletOf('0,0');
  check(highPaid > lowPaid, 'renta: un suelo más valioso cobra más');
  check(Math.abs(highPaid / lowPaid - 1.5) < 1e-9, 'renta: aplica el factor 1 + 0.5·valor');
}

console.log(`\nlandValue.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
