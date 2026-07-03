/**
 * Economía viva (T3.8), sin dinero explícito todavía:
 * - Los empleos son puestos REALES: cada edificio con `jobs` del catálogo
 *   tiene N sillas; un puesto pertenece a UN ciudadano.
 * - Asignación por cercanía al hogar modulada por personalidad (trabajador
 *   acepta ir más lejos). Se re-evalúa a diario para nuevos parados/edificios.
 * - Las tiendas cuentan clientes por día: `prosperity` [0,1] alimentará el
 *   crecimiento (Fase 4) y el feedback visual (Sonnet: campos por franjas).
 */
import { Citizen, PlaceRef } from './citizens/citizen';
import { WorldIndex, SimBuilding } from './worldIndex';
import { manhattan } from './geometry';
import { ADULT_AGE } from './lifecycle';

export interface Workplace {
  building: SimBuilding;
  /** ids de ciudadanos empleados (≤ jobs). */
  workers: number[];
}

export class Economy {
  workplaces: Workplace[] = [];
  /** Clientes acumulados HOY por tienda ('ax,az'). */
  visitsToday = new Map<string, number>();
  /** Prosperidad [0,1] por tienda, media móvil de días. */
  prosperity = new Map<string, number>();

  rebuild(index: WorldIndex, citizens: Map<number, Citizen>): void {
    const employed = new Map<string, number[]>();
    for (const c of citizens.values()) {
      if (!c.work) continue;
      const k = `${c.work.ax},${c.work.az}`;
      (employed.get(k) ?? employed.set(k, []).get(k)!).push(c.id);
    }
    this.workplaces = index.buildings
      .filter((b) => (b.data.jobs ?? 0) > 0)
      .map((b) => ({ building: b, workers: employed.get(`${b.ax},${b.az}`) ?? [] }));
    // Despide de edificios demolidos.
    const valid = new Set(this.workplaces.map((w) => `${w.building.ax},${w.building.az}`));
    for (const c of citizens.values()) {
      if (c.work && !valid.has(`${c.work.ax},${c.work.az}`)) c.work = null;
    }
  }

  /** Ofrece empleo a los parados. Determinista: orden por id. */
  assignJobs(citizens: Map<number, Citizen>): Array<{ citizen: number; work: PlaceRef }> {
    const hires: Array<{ citizen: number; work: PlaceRef }> = [];
    const unemployed = [...citizens.values()]
      .filter((c) => !c.work && c.age >= ADULT_AGE)
      .sort((a, b) => a.id - b.id);
    for (const c of unemployed) {
      let best: Workplace | null = null;
      let bestD = Infinity;
      for (const w of this.workplaces) {
        const jobs = w.building.data.jobs ?? 0;
        if (w.workers.length >= jobs || !w.building.entrance) continue;
        const d = manhattan([c.home.ax, c.home.az], w.building.entrance);
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
      if (!best) continue;
      // Umbral de desplazamiento: un hogareño no cruza el mapa por trabajo.
      const maxCommute = 40 + 120 * c.personality.trabajador;
      if (bestD > maxCommute) continue;
      best.workers.push(c.id);
      const work: PlaceRef = { ax: best.building.ax, az: best.building.az, buildingId: best.building.id };
      c.work = work;
      hires.push({ citizen: c.id, work });
    }
    return hires;
  }

  /** Un ciudadano entra a comprar: cuenta para la prosperidad de la tienda. */
  registerVisit(place: PlaceRef): void {
    const k = `${place.ax},${place.az}`;
    this.visitsToday.set(k, (this.visitsToday.get(k) ?? 0) + 1);
  }

  /** Cierre del día: convierte visitas en prosperidad (media móvil 3 días).
   * Una tienda "va bien" con ~1 cliente/empleado/día. */
  endOfDay(): void {
    for (const w of this.workplaces) {
      if (w.building.data.role !== 'commerce') continue;
      const k = `${w.building.ax},${w.building.az}`;
      const visits = this.visitsToday.get(k) ?? 0;
      const staffed = w.workers.length / Math.max(1, w.building.data.jobs ?? 1);
      const demandMet = Math.min(1, visits / Math.max(1, w.workers.length));
      const today = staffed * 0.4 + demandMet * 0.6;
      const prev = this.prosperity.get(k) ?? 0.5;
      this.prosperity.set(k, prev + (today - prev) / 3);
    }
    this.visitsToday.clear();
  }

  /** Datos agregados para growth (Fase 4) y HUD. */
  stats(citizens: Map<number, Citizen>): { population: number; adults: number; employed: number; jobs: number } {
    let employed = 0;
    let adults = 0;
    for (const c of citizens.values()) {
      if (c.work) employed++;
      if (c.age >= ADULT_AGE) adults++;
    }
    const jobs = this.workplaces.reduce((n, w) => n + (w.building.data.jobs ?? 0), 0);
    return { population: citizens.size, adults, employed, jobs };
  }
}
