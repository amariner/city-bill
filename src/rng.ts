/**
 * Generador pseudoaleatorio con semilla (mulberry32).
 * El mundo debe ser determinista: misma semilla, mismo barrio.
 */
export function createRng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + next() * (max - min),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    /** Estado interno actual (T2.6): pasarlo a `createRng` continúa la MISMA
     * secuencia, byte a byte, desde este punto — así el guardado persiste el
     * flujo de aleatoriedad sin romper el determinismo. */
    get state(): number {
      return s >>> 0;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;
