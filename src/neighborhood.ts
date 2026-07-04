/**
 * Primer barrio: siembra el grid (world/seed.ts) y construye la vista por
 * chunks (world/render/worldView.ts). El grid es la fuente de verdad
 * consultable; la vista se genera desde él.
 */
import { seedWorld } from './world/seed';
import { WorldView } from './world/render/worldView';
import { Grid } from './world/grid';

export const worldGrid: Grid = seedWorld();

export function createWorldView(grid: Grid = worldGrid): WorldView {
  return new WorldView(grid);
}
