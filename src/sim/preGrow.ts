/** Límite de maduración por URL: suficiente para una ciudad, acotado para que
 * una consulta accidental no deje al worker calculando una partida enorme. */
export const MAX_PRE_GROW_DAYS = 400;

/** Convierte `?days=` en días enteros seguros. Cero significa arrancar en día 0. */
export function preGrowDaysFrom(value: string | null): number {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? Math.min(MAX_PRE_GROW_DAYS, Math.floor(days)) : 0;
}
