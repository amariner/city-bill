const assert = Object.assign((ok: unknown, message: string) => { if (!ok) throw new Error(message); }, {
  equal(a: unknown, b: unknown, message: string) { if (a !== b) throw new Error(message); },
});
import { catalogData } from '../world/catalogData';
import { playerCatalog, buildAvailability, buildingBenefit } from './buildCatalog';

const station = catalogData('station')!;
assert(playerCatalog('transport').some((item) => item.id === 'station'), 'la estación construible llega al catálogo de transporte');
assert(!playerCatalog().some((item) => item.id === 'parking' || item.role === 'nature'), 'se respeta playerPlaceable');
assert(buildAvailability(station, 3, 100000, false)?.includes('nivel 4'), 'el dinero no salta el desbloqueo');
assert.equal(buildAvailability(station, 4, station.cost!, false), null, 'el precio exacto permite construir');
assert(buildAvailability(station, 4, station.cost! - 0.1, false)?.startsWith('Faltan'), 'una fracción de déficit sigue bloqueando');
assert(buildAvailability(station, 4, 100000, true)?.includes('quiebra'), 'la quiebra impide gastar');
assert(buildingBenefit(catalogData('school')!).includes('24 plazas escolares'), 'la capacidad escolar no se confunde con hogares');
assert(buildingBenefit(catalogData('cottage')!).includes('1 familia'), 'la capacidad residencial se expresa en familias');
console.log('buildCatalog.test: 8 passed, 0 failed');
