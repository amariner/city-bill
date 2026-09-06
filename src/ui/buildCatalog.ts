/** Proyección del catálogo para el alcalde; las reglas de colocación siguen en el worker. */
import { CATALOG_DATA, type CatalogItemData } from '../world/catalogData';

export const BUILD_CATEGORIES = [
  ['services', 'Servicios'], ['housing', 'Viviendas'],
  ['economy', 'Economía'], ['transport', 'Transporte'],
] as const;
export type BuildCategory = (typeof BUILD_CATEGORIES)[number][0];

export function buildCategory(item: CatalogItemData): BuildCategory {
  if (item.role === 'residential') return 'housing';
  if (item.role === 'infra') return 'transport';
  if (item.role === 'park' || item.role === 'civic') return 'services';
  return 'economy';
}

export function playerCatalog(category?: BuildCategory): CatalogItemData[] {
  return CATALOG_DATA.filter((item) => item.playerPlaceable === true
    && (category === undefined || buildCategory(item) === category)).sort((a, b) => a.tier - b.tier);
}

export function buildAvailability(item: CatalogItemData, tier: number, treasury: number, bankrupt: boolean): string | null {
  if (item.tier > tier) return `Se desbloquea en nivel ${item.tier}`;
  if (bankrupt) return 'Construcción suspendida por quiebra';
  const missing = Math.ceil((item.cost ?? 0) - treasury);
  if (missing > 0) return `Faltan ${money(missing)}`;
  return null;
}

export function money(value: number): string {
  return `${Math.round(value).toLocaleString('es-ES')} €`;
}

export function buildingBenefit(item: CatalogItemData): string {
  const parts: string[] = [];
  if (item.capacity) parts.push(`${item.capacity} ${item.capacity === 1 ? 'familia' : 'familias'}`);
  if (item.students) parts.push(`${item.students} plazas escolares`);
  if (item.jobs) parts.push(`${item.jobs} empleos`);
  if (item.service) parts.push(`radio ${item.service.radius * 2} m`);
  if (item.id === 'station') parts.push('requiere circuito ferroviario');
  return parts.join(' · ') || 'Edificio auxiliar';
}
