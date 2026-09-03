/** Valor del suelo (H4.4). Cálculo puro sobre el índice espacial: la sim lo
 * muestrea una vez por día y el alquiler consume el valor ya observado.
 *
 * Componentes de diseño: cobertura .40, parque/agua cercana .20, centro .20,
 * penalización industrial .15 y premio de calle/avenida .10. El resultado se
 * acota a [0,1] para que sea un modificador comprensible del alquiler.
 */
import { townCenter } from '../world/growth';
import { isUrban } from './worldIndex';
import type { WorldIndex } from './worldIndex';

const SERVICE_COUNT = 5;
const PARK_WATER_RADIUS = 6;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function key(ax: number, az: number): string {
  return `${ax},${az}`;
}

function manhattan(a: [number, number], b: [number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function hasNearbyWater(index: WorldIndex, cx: number, cz: number): boolean {
  for (let dx = -PARK_WATER_RADIUS; dx <= PARK_WATER_RADIUS; dx++) {
    for (let dz = -PARK_WATER_RADIUS; dz <= PARK_WATER_RADIUS; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > PARK_WATER_RADIUS) continue;
      if (index.grid.get(cx + dx, cz + dz)?.terrain === 'water') return true;
    }
  }
  return false;
}

function hasNearbyPark(index: WorldIndex, cx: number, cz: number): boolean {
  return index.ofRole('park').some((park) => manhattan([cx, cz], [park.cx, park.cz]) <= PARK_WATER_RADIUS);
}

function hasUrbanRoad(index: WorldIndex, cx: number, cz: number): boolean {
  for (let dx = -PARK_WATER_RADIUS; dx <= PARK_WATER_RADIUS; dx++) {
    for (let dz = -PARK_WATER_RADIUS; dz <= PARK_WATER_RADIUS; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > PARK_WATER_RADIUS) continue;
      const cell = index.grid.get(cx + dx, cz + dz);
      if (cell?.terrain === 'road' && (cell.roadKind === 'street' || cell.roadKind === 'avenue')) return true;
    }
  }
  return false;
}

function serviceCoverage(mask: number): number {
  let covered = 0;
  for (let bit = 1; bit <= (1 << 4); bit <<= 1) if ((mask & bit) !== 0) covered++;
  return covered / SERVICE_COUNT;
}

/** Calcula el valor para cada edificio del índice. Las entradas abandonadas
 * quedan a cero, aunque su huella siga ocupada, porque no prestan ni reciben
 * servicios económicos activos. */
export function computeLandValue(index: WorldIndex): Map<string, number> {
  const centers = index.buildings
    .filter((building) => !building.abandoned && isUrban(building.data.role))
    .map((building) => [building.ax, building.az] as [number, number]);
  const center = townCenter(centers);
  const industrial = index.ofRole('work');
  const values = new Map<string, number>();

  for (const building of index.buildings) {
    const buildingKey = key(building.ax, building.az);
    if (building.abandoned) {
      values.set(buildingKey, 0);
      continue;
    }
    const cx = Math.round(building.cx - 0.5);
    const cz = Math.round(building.cz - 0.5);
    const coverage = serviceCoverage(building.coverage) * 0.4;
    const amenity = hasNearbyPark(index, cx, cz) || hasNearbyWater(index, cx, cz) ? 0.2 : 0;
    const centrality = Math.max(0, 1 - manhattan([building.cx, building.cz], center) / 60) * 0.2;
    const pollution = industrial.some((factory) => manhattan([building.cx, building.cz], [factory.cx, factory.cz]) <= 6) ? 0.15 : 0;
    const road = hasUrbanRoad(index, cx, cz) ? 0.1 : 0;
    values.set(buildingKey, clamp01(coverage + amenity + centrality + road - pollution));
  }
  return values;
}
