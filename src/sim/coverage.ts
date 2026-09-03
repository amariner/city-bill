/** Cobertura de servicios públicos (H4.2).
 *
 * La cobertura es una máscara por edificio: cada proveedor activo con acceso
 * vial cubre edificios también accesibles dentro de su radio Manhattan. La
 * geometría sigue siendo barata y determinista; la distancia usa los centros
 * ya calculados por WorldIndex, no recorre celdas ni rutas.
 */
import type { ServiceKind } from '../world/catalogData';
import type { WorldIndex } from './worldIndex';

export type CoverageMask = number;

export const COVERAGE_BITS: Record<ServiceKind, number> = {
  education: 1 << 0,
  health: 1 << 1,
  police: 1 << 2,
  fire: 1 << 3,
  park: 1 << 4,
};

export interface CoverageRates {
  education: number;
  health: number;
  police: number;
  fire: number;
  park: number;
}

export function coverageKey(ax: number, az: number): string {
  return `${ax},${az}`;
}

/** Calcula la máscara cubierta por cada edificio del índice.
 * Los edificios abandonados o sin acceso conservan entrada en el Map con
 * máscara cero: así el resultado es total, estable y fácil de consultar. */
export function computeCoverage(index: Pick<WorldIndex, 'buildings'>): Map<string, CoverageMask> {
  const result = new Map<string, CoverageMask>();
  const providerX: number[] = [];
  const providerZ: number[] = [];
  const providerRadius: number[] = [];
  const providerBit: number[] = [];
  for (const building of index.buildings) {
    const service = building.data.service;
    if (building.abandoned || !building.roadAccess || !service) continue;
    providerX.push(building.cx);
    providerZ.push(building.cz);
    providerRadius.push(service.radius);
    providerBit.push(COVERAGE_BITS[service.kind]);
  }

  for (const target of index.buildings) {
    const key = coverageKey(target.ax, target.az);
    if (target.abandoned || !target.roadAccess) {
      result.set(key, 0);
      continue;
    }

    let mask = 0;
    for (let i = 0; i < providerX.length; i++) {
      const dx = target.cx - providerX[i];
      const dz = target.cz - providerZ[i];
      const distance = (dx < 0 ? -dx : dx) + (dz < 0 ? -dz : dz);
      if (distance <= providerRadius[i]) mask |= providerBit[i];
    }
    result.set(key, mask);
  }
  return result;
}

/** Porcentaje de viviendas activas cubiertas por cada servicio, para el HUD y
 * la futura felicidad por hogar. Sin viviendas, la tasa es cero (no hay una
 * cobertura ficticia que mostrar). */
export function coverageRates(index: Pick<WorldIndex, 'buildings'>): CoverageRates {
  const homes = index.buildings.filter((building) => !building.abandoned && building.data.role === 'residential');
  const rates: CoverageRates = { education: 0, health: 0, police: 0, fire: 0, park: 0 };
  if (homes.length === 0) return rates;

  for (const home of homes) {
    const mask = home.coverage;
    for (const [kind, bit] of Object.entries(COVERAGE_BITS) as Array<[ServiceKind, number]>) {
      if ((mask & bit) !== 0) rates[kind]++;
    }
  }
  for (const kind of Object.keys(rates) as ServiceKind[]) rates[kind] /= homes.length;
  return rates;
}
