/** Contrato del catálogo físico: cada dato tiene una malla y los servicios
 * nuevos conservan sus footprints/tiers explícitos. */
import { CATALOG_ITEMS, catalogItem } from './catalog';
import { CATALOG_DATA, catalogData } from './catalogData';

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

const serviceBuildings = [
  ['police', 'police', 4, 4, 2],
  ['fire-station', 'fire', 4, 4, 2],
  ['park', 'park', 4, 4, 1],
  ['plaza', 'park', 4, 4, 2],
  ['playground', 'park', 2, 2, 1],
] as const;

assert(CATALOG_DATA.length === 24, 'el catálogo data-driven contiene 24 ítems');
assert(CATALOG_ITEMS.length === CATALOG_DATA.length, 'cada dato se funde en un ítem renderizable');
assert(CATALOG_ITEMS.every((item) => item.build().type === 'Group'), 'cada ítem tiene un builder de malla con Group');

for (const [id, kind, w, d, tier] of serviceBuildings) {
  const data = catalogData(id);
  const item = catalogItem(id);
  assert(data?.service?.kind === kind, `${id} declara el servicio ${kind}`);
  assert(data?.w === w && data?.d === d && data?.tier === tier, `${id} conserva footprint y tier del diseño`);
  assert(data?.role === 'park' || data?.role === 'civic', `${id} tiene rol público`);
  assert(item?.build !== undefined, `${id} está conectado al catálogo de builders`);
}

assert(catalogData('school')?.service?.kind === 'education', 'la escuela expone cobertura educativa');
assert(catalogData('clinic')?.service?.kind === 'health', 'el consultorio expone cobertura sanitaria');
assert(catalogData('town-house')?.capacity === 3 && catalogData('town-house')?.tier === 2, 'la casa con jardín es el escalón T2 de densificación');
assert(catalogData('low-block')?.capacity === 8 && catalogData('low-block')?.tier === 3, 'el bloque bajo es el escalón T3 de densificación');
assert(catalogData('tree-blob')?.amenity === 1 && catalogData('tree-cypress')?.amenity === 1, 'los árboles declaran amenity 1');
assert(catalogData('tree-blob')?.service === undefined, 'los árboles ya no usan happiness muerto');

console.log(`\ncatalog.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
