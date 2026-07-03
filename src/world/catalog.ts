/**
 * Catálogo data-driven: la definición ÚNICA de todo lo construible.
 * Espejo de CATALOG.md. El grid guarda `id`; el render pide `build()` para el
 * mesh y usa `w`/`d` (celdas) como footprint. La simulación (Fase 3) lee
 * `role`, `capacity`, `jobs` y `happiness`.
 *
 * Convención: `build()` devuelve un Object3D centrado en su origen X/Z y
 * apoyado en y=0, con el "frente" mirando a +Z (el render aplica la rotación).
 */
import * as THREE from 'three';
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

export type SimRole =
  | 'residential'
  | 'work'
  | 'commerce'
  | 'civic'
  | 'agriculture'
  | 'nature'
  | 'infra';

export type Tier = 0 | 1 | 2 | 3 | 4;

export interface CatalogItem {
  id: string;
  name: string;
  /** Footprint en celdas (1 celda = 2 m). */
  w: number;
  d: number;
  tier: Tier;
  role: SimRole;
  /** Familias que alberga (residencial). */
  capacity?: number;
  /** Puestos de trabajo que ofrece. */
  jobs?: number;
  /** Bonus de felicidad para naturaleza/ocio. */
  happiness?: { radius: number; amount: number };
  build: () => THREE.Object3D;
}

function item(it: CatalogItem): CatalogItem {
  return it;
}

export const CATALOG_ITEMS: CatalogItem[] = [
  // --- Residencial ----------------------------------------------------------
  item({ id: 'farmhouse', name: 'Casa de campo', w: 5, d: 4, tier: 0, role: 'residential', capacity: 1, build: () => farmhouse() }),
  item({ id: 'cottage', name: 'Casita de pueblo', w: 3, d: 3, tier: 1, role: 'residential', capacity: 1, build: () => cottage() }),
  item({ id: 'row-houses', name: 'Adosados', w: 8, d: 3, tier: 2, role: 'residential', capacity: 4, build: () => rowHouses(4) }),
  item({ id: 'apartment-slab', name: 'Bloque panelák', w: 10, d: 4, tier: 3, role: 'residential', capacity: 18, build: () => apartmentSlab(6, 20, 8) }),
  item({ id: 'brick-block', name: 'Bloque Zlín', w: 7, d: 5, tier: 4, role: 'residential', capacity: 24, build: () => brickBlock(5) }),

  // --- Trabajo / comercio / servicios --------------------------------------
  item({ id: 'barn', name: 'Granero', w: 4, d: 5, tier: 0, role: 'agriculture', jobs: 2, build: () => barn() }),
  item({ id: 'shed', name: 'Cobertizo', w: 2, d: 2, tier: 0, role: 'agriculture', jobs: 0, build: () => shed() }),
  item({ id: 'shop', name: 'Tienda', w: 4, d: 3, tier: 1, role: 'commerce', jobs: 3, build: () => shop() }),
  item({ id: 'supermarket', name: 'Supermercado', w: 9, d: 6, tier: 3, role: 'commerce', jobs: 12, build: () => supermarket() }),
  item({ id: 'parking', name: 'Parking en altura', w: 8, d: 5, tier: 3, role: 'infra', jobs: 2, build: () => parkingGarage(3) }),
  item({ id: 'civic', name: 'Ayuntamiento', w: 8, d: 5, tier: 3, role: 'civic', jobs: 10, build: () => civic() }),
  item({ id: 'office', name: 'Oficinas', w: 5, d: 5, tier: 4, role: 'work', jobs: 30, build: () => officeBlock(8) }),
  item({ id: 'factory', name: 'Fábrica', w: 8, d: 6, tier: 4, role: 'work', jobs: 40, build: () => factory() }),

  // --- Naturaleza -----------------------------------------------------------
  item({ id: 'tree-blob', name: 'Árbol', w: 1, d: 1, tier: 0, role: 'nature', happiness: { radius: 6, amount: 1 }, build: () => blobTree(1) }),
  item({ id: 'tree-cypress', name: 'Ciprés', w: 1, d: 1, tier: 0, role: 'nature', happiness: { radius: 4, amount: 1 }, build: () => cypress(1) }),
];

export const CATALOG: Record<string, CatalogItem> = Object.fromEntries(
  CATALOG_ITEMS.map((it) => [it.id, it]),
);

export function catalogItem(id: string): CatalogItem | undefined {
  return CATALOG[id];
}

export function itemsByTier(tier: Tier): CatalogItem[] {
  return CATALOG_ITEMS.filter((it) => it.tier <= tier);
}
