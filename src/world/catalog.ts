/**
 * Catálogo data-driven: los DATOS viven en `catalogData.ts` (sin THREE, para
 * que la sim del worker pueda importarlos); aquí se funden con las fábricas
 * de mesh para el render. El grid guarda `id`; el render pide `build()`.
 *
 * Convención: `build()` devuelve un Object3D centrado en su origen X/Z y
 * apoyado en y=0, con el "frente" mirando a +Z (el render aplica la rotación).
 */
import * as THREE from 'three';
import { CATALOG_DATA, CatalogItemData, SimRole, Tier } from './catalogData';
import {
  farmhouse,
  barn,
  shed,
  cottage,
  shop,
  rowHouses,
  supermarket,
  parkingGarage,
  civic,
  factory,
  apartmentSlab,
  brickBlock,
  officeBlock,
  blobTree,
  cypress,
} from '../props';

export type { SimRole, Tier };

export interface CatalogItem extends CatalogItemData {
  build: () => THREE.Object3D;
}

const BUILDERS: Record<string, () => THREE.Object3D> = {
  farmhouse: () => farmhouse(),
  cottage: () => cottage(),
  'row-houses': () => rowHouses(4),
  'apartment-slab': () => apartmentSlab(6, 20, 8),
  'brick-block': () => brickBlock(5),
  barn: () => barn(),
  shed: () => shed(),
  shop: () => shop(),
  supermarket: () => supermarket(),
  parking: () => parkingGarage(3),
  civic: () => civic(),
  office: () => officeBlock(8),
  factory: () => factory(),
  'tree-blob': () => blobTree(1),
  'tree-cypress': () => cypress(1),
};

export const CATALOG_ITEMS: CatalogItem[] = CATALOG_DATA.map((data) => {
  const build = BUILDERS[data.id];
  if (!build) throw new Error(`Catálogo sin builder para '${data.id}' — añádelo en catalog.ts`);
  return { ...data, build };
});

export const CATALOG: Record<string, CatalogItem> = Object.fromEntries(
  CATALOG_ITEMS.map((it) => [it.id, it]),
);

export function catalogItem(id: string): CatalogItem | undefined {
  return CATALOG[id];
}

export function itemsByTier(tier: Tier): CatalogItem[] {
  return CATALOG_ITEMS.filter((it) => it.tier <= tier);
}
