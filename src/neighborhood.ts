/**
 * Primer barrio. Ahora es solo el ensamblaje: siembra el grid (world/seed.ts) y
 * construye la vista desde él (world/render/worldView.ts). La composición y la
 * geometría viven en esos módulos; el grid es la fuente de verdad consultable.
 */
import * as THREE from 'three';
import { seedWorld } from './world/seed';
import { buildWorldView } from './world/render/worldView';
import { Grid } from './world/grid';

/** Grid del barrio semilla (expuesto para cámara/inspección/futuras fases). */
export const worldGrid: Grid = seedWorld();

export function buildNeighborhood(): THREE.Group {
  return buildWorldView(worldGrid);
}
