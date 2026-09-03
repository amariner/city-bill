/** Utilidades puras de tráfico (H5.1): carga, decaimiento y velocidad segura. */

/** La carga cae un 10 % por hora si ningún vehículo vuelve a ocupar la celda. */
export const TRAFFIC_DECAY_PER_HOUR = 0.9;
/** La congestión nunca detiene del todo un trayecto: queda un carril mínimo. */
export const MIN_CONGESTION_FACTOR = 0.35;

/** Factor multiplicador de la velocidad para una carga/capacidad dadas. */
export function congestionFactor(load: number, capacity: number): number {
  const safeLoad = Number.isFinite(load) ? Math.max(0, load) : 0;
  const safeCapacity = Number.isFinite(capacity) ? Math.max(1, capacity) : 1;
  return Math.max(MIN_CONGESTION_FACTOR, Math.min(1, 1 - safeLoad / safeCapacity));
}

/** Avanza la memoria de tráfico el tiempo transcurrido, sin borrar de golpe
 * los rastros: el factor se interpreta por hora, no por tick de simulación. */
export function decayTraffic(traffic: Map<number, number>, hours: number): void {
  if (!Number.isFinite(hours) || hours <= 0) return;
  const factor = Math.pow(TRAFFIC_DECAY_PER_HOUR, hours);
  for (const [key, load] of traffic) {
    const next = load * factor;
    if (!Number.isFinite(next) || next < 0.01) traffic.delete(key);
    else traffic.set(key, next);
  }
}
