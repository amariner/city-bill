/** Transporte público H5.3: rutas circulares, frecuencia, acciones y saves. */
import { Grid } from '../world/grid';
import { Simulation } from './simulation';
import { replayActions } from './actions';
import type { CitizenPhase } from './citizens/citizen';
import { buildBusLine, createBuses, stepBuses } from './transit';

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

const line = buildBusLine(7, [[0, 0], [3, 0], [3, 3]])!;
check('ruta: acepta al menos dos paradas', line !== null && line.stops.length === 3);
check('ruta: empieza y termina en la primera parada', line.route[0].join() === '0,0'
  && line.route[line.route.length - 1].join() === '0,0');
check('ruta: conserva las paradas en el orden pedido', line.stopRouteIndices.map((i) => line.route[i].join()).join('|') === '0,0|3,0|3,3');

{
  const buses = createBuses(line, 100);
  const visited = new Set<number>(buses.filter((bus) => bus.stopIndex >= 0).map((bus) => bus.stopIndex));
  for (let tick = 0; tick < 40; tick++) {
    stepBuses(new Map([[line.id, line]]), buses, () => 1);
    for (const bus of buses) if (bus.dwellTicks > 0) visited.add(bus.stopIndex);
  }
  check('frecuencia: crea un mínimo de dos buses', buses.length >= 2);
  check('frecuencia: visita todas las paradas', visited.size === 3);
  check('frecuencia: los buses conservan posiciones finitas', buses.every((bus) => Number.isFinite(bus.x) && Number.isFinite(bus.z)));
}

function roadLoopGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-3, -3, 23, 23, 'field');
  for (let x = 0; x <= 20; x++) {
    grid.setRoad(x, 0, 'rural');
    grid.setRoad(x, 20, 'rural');
  }
  for (let z = 0; z <= 20; z++) {
    grid.setRoad(0, z, 'rural');
    grid.setRoad(20, z, 'rural');
  }
  return grid;
}

{
  const sim = new Simulation(roadLoopGrid(), 5303);
  sim.autonomousGrowth = false;
  const create = sim.applyAction({
    kind: 'busLine',
    op: 'create',
    stops: [[0, 0], [20, 0], [20, 20], [0, 20]],
  }, 1);
  check('acción: crea una línea solo sobre calzada', create.ok && sim.busLines.size === 1 && sim.buses.length >= 2);
  check('acción: expone líneas en las estadísticas', sim.cityStats().busLines === 1 && sim.cityStats().trainActive === false);
  check('snapshot: exporta los buses en layout plano', sim.vehiclesSnapshot().length === sim.buses.length * 6);

  const planReader = sim as unknown as { busPlanFor: (from: [number, number], to: [number, number]) => { lineId: number } | undefined };
  check('ciudadanos: una línea cercana ofrece plan para un viaje largo', planReader.busPlanFor([1, 0], [19, 0])?.lineId === 1);

  const rideGrid = roadLoopGrid();
  rideGrid.placeBuilding('cottage', 3, 3, 5, 5, 0);
  const rideSim = new Simulation(rideGrid, 5304);
  rideSim.autonomousGrowth = false;
  rideSim.applyAction({
    kind: 'busLine',
    op: 'create',
    stops: [[0, 0], [20, 0], [20, 20], [0, 20]],
  }, 1);
  const rider = [...rideSim.citizens.values()][0];
  if (rider) {
    rider.x = 0.5;
    rider.z = 0.5;
    rider.inside = false;
    rider.activity = 'none';
    rider.phase = {
      kind: 'doing',
      until: rideSim.clock.time + 99999,
      busWait: {
        lineId: 1,
        boardStopIndex: 0,
        alightStopIndex: 1,
        next: { activity: 'none', target: null, cell: [19, 0], duration: 0 },
      },
    };
    rideSim.step();
    const afterBoarding = rider.phase as CitizenPhase;
    check('embarque: el ciudadano pasa a moving en bus', afterBoarding.kind === 'moving' && afterBoarding.mode === 'bus');
    for (let tick = 0; tick < 20 && (rider.phase as CitizenPhase).kind === 'moving'; tick++) rideSim.step();
    check('embarque: el viaje incrementa busTrips', rideSim.busTrips === 1);
    const afterRide = rider.phase as CitizenPhase;
    check('desembarque: continúa la actividad tras la parada', afterRide.kind === 'doing' && !afterRide.busWait);
  } else {
    check('embarque: la fixture aporta un ciudadano', false);
    check('embarque: el viaje incrementa busTrips', false);
    check('desembarque: continúa la actividad tras la parada', false);
  }

  const saved = JSON.parse(JSON.stringify(sim.serialize()));
  const restored = new Simulation(Grid.deserialize(saved.gridJson), 5303, saved);
  check('save: conserva líneas y flota', restored.busLines.size === 1 && restored.buses.length === sim.buses.length);
  check('save: conserva snapshot de vehículos', restored.vehiclesSnapshot().join(',') === sim.vehiclesSnapshot().join(','));

  const deleted = sim.applyAction({ kind: 'busLine', op: 'delete', lineId: 1 }, 2);
  check('acción: elimina la línea y sus buses', deleted.ok && sim.busLines.size === 0 && sim.buses.length === 0);
  const replay = new Simulation(roadLoopGrid(), 5303);
  replayActions(replay, sim.actions, sim.clock.tick);
  check('replay: reproduce crear y borrar líneas', replay.actions.length === sim.actions.length && replay.busLines.size === sim.busLines.size);
  const denied = sim.applyAction({ kind: 'busLine', op: 'create', stops: [[0, 0], [10, 0], [10, 10]] }, 3);
  check('acción: rechaza una ruta que abandona la calzada', !denied.ok && denied.reason === 'blocked');
}

console.log(`\ntransit.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
