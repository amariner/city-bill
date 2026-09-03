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
  /** Plazas de alumno (lógica de educación). */
  students?: number;
  /** Bonus de felicidad para naturaleza/ocio. */
  happiness?: { radius: number; amount: number };
  /** Precio que paga el jugador al colocar el edificio. El crecimiento autónomo
   * no usa este campo: las obras de la ciudad nacen sin débito hasta H4.8. */
  cost?: number;
  /** Mantenimiento diario que exige el edificio al tesoro. */
  upkeepPerDay?: number;
  /** Si el alcalde puede colocarlo manualmente. */
  playerPlaceable?: boolean;
}

export const CATALOG_DATA: CatalogItemData[] = [
  // --- Residencial ----------------------------------------------------------
  { id: 'farmhouse', name: 'Casa de campo', w: 5, d: 4, tier: 0, role: 'residential', capacity: 1, cost: 4500, playerPlaceable: true },
  { id: 'cottage', name: 'Casita de pueblo', w: 3, d: 3, tier: 1, role: 'residential', capacity: 1, cost: 2025, playerPlaceable: true },
  { id: 'row-houses', name: 'Adosados', w: 8, d: 3, tier: 2, role: 'residential', capacity: 4, cost: 5400, playerPlaceable: true },
  { id: 'apartment-slab', name: 'Bloque panelák', w: 10, d: 4, tier: 3, role: 'residential', capacity: 18, cost: 9000, playerPlaceable: true },
  { id: 'brick-block', name: 'Bloque Zlín', w: 7, d: 5, tier: 4, role: 'residential', capacity: 24, cost: 7875, playerPlaceable: true },

  // --- Trabajo / comercio / servicios --------------------------------------
  { id: 'barn', name: 'Granero', w: 4, d: 5, tier: 0, role: 'agriculture', jobs: 2, cost: 2250, playerPlaceable: true },
  { id: 'shed', name: 'Cobertizo', w: 2, d: 2, tier: 0, role: 'agriculture', jobs: 0, cost: 900, playerPlaceable: true },
  { id: 'shop', name: 'Tienda', w: 4, d: 3, tier: 1, role: 'commerce', jobs: 3, cost: 2700, playerPlaceable: true },
  { id: 'supermarket', name: 'Supermercado', w: 9, d: 6, tier: 3, role: 'commerce', jobs: 12, cost: 12150, playerPlaceable: true },
  { id: 'parking', name: 'Parking en altura', w: 8, d: 5, tier: 3, role: 'infra', jobs: 2, playerPlaceable: false },
  { id: 'civic', name: 'Ayuntamiento', w: 8, d: 5, tier: 3, role: 'civic', jobs: 10, cost: 3000, upkeepPerDay: 80, playerPlaceable: true },
  { id: 'school', name: 'Escuela', w: 6, d: 4, tier: 1, role: 'civic', jobs: 2, students: 24, cost: 1500, upkeepPerDay: 60, playerPlaceable: true },
  { id: 'clinic', name: 'Consultorio', w: 4, d: 3, tier: 1, role: 'civic', jobs: 2, cost: 800, upkeepPerDay: 40, playerPlaceable: true },
  { id: 'office', name: 'Oficinas', w: 5, d: 5, tier: 4, role: 'work', jobs: 30, cost: 5625, playerPlaceable: true },
  { id: 'factory', name: 'Fábrica', w: 8, d: 6, tier: 4, role: 'work', jobs: 40, cost: 10800, playerPlaceable: true },

  // --- Naturaleza -----------------------------------------------------------
  { id: 'tree-blob', name: 'Árbol', w: 1, d: 1, tier: 0, role: 'nature', happiness: { radius: 6, amount: 1 }, playerPlaceable: false },
  { id: 'tree-cypress', name: 'Ciprés', w: 1, d: 1, tier: 0, role: 'nature', happiness: { radius: 4, amount: 1 }, playerPlaceable: false },
];

export const CATALOG_BY_ID: Record<string, CatalogItemData> = Object.fromEntries(
  CATALOG_DATA.map((it) => [it.id, it]),
);

export function catalogData(id: string): CatalogItemData | undefined {
  return CATALOG_BY_ID[id];
}
