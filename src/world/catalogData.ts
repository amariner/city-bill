/**
 * Datos puros del catálogo — SIN THREE. La simulación (worker) importa ESTE
 * archivo; `catalog.ts` lo funde con las fábricas de mesh para el render.
 * Espejo de CATALOG.md. Si añades un ítem: primero aquí, luego su `build()`
 * en catalog.ts.
 */

export type SimRole =
  | 'residential'
  | 'work'
  | 'commerce'
  | 'civic'
  | 'agriculture'
  | 'nature'
  | 'infra';

export type Tier = 0 | 1 | 2 | 3 | 4;

export interface CatalogItemData {
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
}

export const CATALOG_DATA: CatalogItemData[] = [
  // --- Residencial ----------------------------------------------------------
  { id: 'farmhouse', name: 'Casa de campo', w: 5, d: 4, tier: 0, role: 'residential', capacity: 1 },
  { id: 'cottage', name: 'Casita de pueblo', w: 3, d: 3, tier: 1, role: 'residential', capacity: 1 },
  { id: 'row-houses', name: 'Adosados', w: 8, d: 3, tier: 2, role: 'residential', capacity: 4 },
  { id: 'apartment-slab', name: 'Bloque panelák', w: 10, d: 4, tier: 3, role: 'residential', capacity: 18 },
  { id: 'brick-block', name: 'Bloque Zlín', w: 7, d: 5, tier: 4, role: 'residential', capacity: 24 },

  // --- Trabajo / comercio / servicios --------------------------------------
  { id: 'barn', name: 'Granero', w: 4, d: 5, tier: 0, role: 'agriculture', jobs: 2 },
  { id: 'shed', name: 'Cobertizo', w: 2, d: 2, tier: 0, role: 'agriculture', jobs: 0 },
  { id: 'shop', name: 'Tienda', w: 4, d: 3, tier: 1, role: 'commerce', jobs: 3 },
  { id: 'supermarket', name: 'Supermercado', w: 9, d: 6, tier: 3, role: 'commerce', jobs: 12 },
  { id: 'parking', name: 'Parking en altura', w: 8, d: 5, tier: 3, role: 'infra', jobs: 2 },
  { id: 'civic', name: 'Ayuntamiento', w: 8, d: 5, tier: 3, role: 'civic', jobs: 10 },
  { id: 'office', name: 'Oficinas', w: 5, d: 5, tier: 4, role: 'work', jobs: 30 },
  { id: 'factory', name: 'Fábrica', w: 8, d: 6, tier: 4, role: 'work', jobs: 40 },

  // --- Naturaleza -----------------------------------------------------------
  { id: 'tree-blob', name: 'Árbol', w: 1, d: 1, tier: 0, role: 'nature', happiness: { radius: 6, amount: 1 } },
  { id: 'tree-cypress', name: 'Ciprés', w: 1, d: 1, tier: 0, role: 'nature', happiness: { radius: 4, amount: 1 } },
];

export const CATALOG_BY_ID: Record<string, CatalogItemData> = Object.fromEntries(
  CATALOG_DATA.map((it) => [it.id, it]),
);

export function catalogData(id: string): CatalogItemData | undefined {
  return CATALOG_BY_ID[id];
}
