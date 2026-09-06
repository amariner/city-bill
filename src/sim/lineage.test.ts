/** Los hitos se prueban con genealogías conocidas, sin exigir que una semilla las produzca en 60 días. */
import { Simulation } from './simulation';
import { seedFarm } from '../world/seed';
import { Grid } from '../world/grid';
import type { Citizen } from './citizens/citizen';

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}
function scan(sim: Simulation): Array<{ name: string; data: Record<string, unknown> }> {
  (sim as unknown as { checkDynasties(): void }).checkDynasties();
  return sim.takeEvents().filter((event) => event.name === 'dynastyRose' || event.name === 'dynastyFell');
}
const sim = new Simulation(seedFarm(19), 19);
const exemplar = [...sim.citizens.values()][0];
sim.citizens.clear();
sim.takeEvents();
function person(id: number, lineId?: number): Citizen {
  return { ...exemplar, id, name: `Vecino${id} Novák`, age: 25, lineId, friends: new Map() };
}
// Apellidos iguales NO agrupan familias sin parentesco.
for (let id = 1; id <= 16; id++) sim.citizens.set(id, person(id, id));
check(scan(sim).length === 0, 'un apellido compartido no inventa una dinastía');
for (let id = 2; id <= 8; id++) sim.citizens.get(id)!.lineId = 1;
sim.citizens.get(1)!.lineId = undefined; // el fundador no cuenta como descendiente
check(scan(sim).length === 0, 'siete descendientes todavía no cruzan el umbral de ocho');
sim.citizens.get(9)!.lineId = 1;
const rose = scan(sim);
check(rose.length === 1 && rose[0].name === 'dynastyRose', 'el octavo descendiente reconoce la estirpe');
check(rose[0].data.line === 1 && rose[0].data.members === 8 && rose[0].data.surname === 'Novák', 'el evento identifica el tronco y sus descendientes reales');
check(scan(sim).length === 0, 'no repite el reconocimiento');
const saved = JSON.parse(JSON.stringify(sim.serialize()));
const restored = new Simulation(Grid.deserialize(saved.gridJson), 19, saved);
check(scan(restored).length === 0, 'restaurar no repite el reconocimiento');
// Al morir los descendientes, un fundador vivo mantiene la estirpe.
for (let id = 2; id <= 9; id++) restored.citizens.delete(id);
check(scan(restored).length === 0, 'un fundador vivo evita una extinción falsa');
restored.citizens.delete(1);
const fell = scan(restored);
check(fell.length === 1 && fell[0].name === 'dynastyFell' && fell[0].data.line === 1, 'la última muerte cierra la historia del tronco correcto');
check(scan(restored).length === 0, 'la extinción se narra una sola vez');
const fallenSave = JSON.parse(JSON.stringify(restored.serialize()));
check(scan(new Simulation(Grid.deserialize(fallenSave.gridJson), 19, fallenSave)).length === 0, 'el guardado conserva la extinción narrada');
console.log('lineage.test: identidad, umbral, reconocimiento, extinción y persistencia passed');
