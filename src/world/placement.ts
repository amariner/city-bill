/** Validación espacial compartida por herramientas, fantasma y simulación.
 * No decide qué construir ni muta el grid: solo devuelve el primer motivo de
 * rechazo observable para que ambos hilos tengan exactamente la misma regla. */
import type { Grid, Rot } from './grid';
import { rotatedFootprint } from './grid';
import type { RejectReason } from '../sim/protocol';

export interface PlacementOptions {
  /** Celdas de respeto alrededor de la huella (crecimiento autónomo). */
  margin?: 0 | 1;
  /** Los senderos existentes sí pueden quedar bajo una construcción. */
  allowPath?: boolean;
  /** Huella de un edificio que se va a sustituir; sus celdas cuentan como
   * libres para validar un upgrade in situ. */
  ignoreFootprint?: { cx: number; cz: number; w: number; d: number; rot: Rot };
}

export function placementCheck(
  grid: Grid,
  w: number,
  d: number,
  cx: number,
  cz: number,
  rot: Rot,
  options: PlacementOptions = {},
): RejectReason | null {
  const margin = options.margin ?? 0;
  const allowPath = options.allowPath ?? false;
  const ignored = options.ignoreFootprint;
  const [ignoredW, ignoredD] = ignored ? rotatedFootprint(ignored.w, ignored.d, ignored.rot) : [0, 0];
  const [fw, fd] = rotatedFootprint(w, d, rot);
  for (let x = cx - margin; x < cx + fw + margin; x++) {
    for (let z = cz - margin; z < cz + fd + margin; z++) {
      const cell = grid.get(x, z);
      if (!cell) return 'outOfWorld';
      const isIgnoredBuilding = ignored
        && x >= ignored.cx && x < ignored.cx + ignoredW
        && z >= ignored.cz && z < ignored.cz + ignoredD
        && cell.building?.anchorX === ignored.cx
        && cell.building?.anchorZ === ignored.cz;
      const inFootprint = x >= cx && x < cx + fw && z >= cz && z < cz + fd;
      if (!inFootprint) {
        // El margen protege de solapes y agua, pero la huella que se sustituye
        // no es un vecino: también puede sobresalir cuando el nuevo edificio
        // es más estrecho y más profundo (panelák → bloque Zlín).
        if (cell.building && !isIgnoredBuilding) return 'blocked';
        if (cell.terrain === 'water') return 'water';
        continue;
      }
      if (cell.building && !isIgnoredBuilding) return 'blocked';
      if (cell.terrain === 'water') return 'water';
      if (cell.terrain === 'road' || cell.terrain === 'rail') return 'road';
      if (cell.terrain === 'path' && !allowPath) return 'road';
    }
  }
  return null;
}
