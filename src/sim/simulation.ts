/**
 * Orquestador de la simulación: mundo + ciudadanos + economía + social + reloj.
 * SIN worker ni THREE: es una clase pura que avanza por ticks — así los tests
 * pueden correr días de juego en milisegundos (sim.test.ts). El worker
 * (worker.ts) solo la envuelve con mensajería.
 *
 * Autómata del ciudadano por tick:
 *   deciding → (brain elige) → waitingPath → moving → doing → deciding
 * Con una excepción emergente: si al caminar se cruza con un conocido y ambos
 * van faltos de social, la charla INTERRUMPE el plan (social.ts).
 */
import { Grid } from '../world/grid';
import { createRng, Rng } from '../rng';
import { GameClock, TICK_GAME_S } from './clock';
import { PathQueue, pathLength } from './pathfinding';
import { CellXZ, manhattan } from './geometry';
import { WorldIndex } from './worldIndex';
import { Economy } from './economy';
import { Citizen, citizenName, PlannedActivity } from './citizens/citizen';
import { decayNeeds, restore, NEED_KEYS } from './citizens/needs';
import { chooseActivity } from './citizens/brain';
import { ACTIVITY_BY_KIND, SimContext, activityLabel, EDU_PER_HOUR } from './citizens/activities';
import { SocialSystem } from './citizens/social';
import { AgentState, ActivityKind, activityId, AGENT_STRIDE } from './protocol';
import { computeDemand, itemForDemand, findParcel, townCenter, GrowthPlacement } from '../world/growth';
import { lifeYear } from './lifecycle';
import { STARTING_MONEY, SHOP_TREAT_PRICE } from './economy';
import { catalogData, Tier } from '../world/catalogData';

/** Velocidad al caminar, en celdas por tick (0.25 s reales a vel. 1). */
const WALK_CELLS_PER_TICK = 0.9; // ≈ 7 km/h de juego a escala urbana

export interface SimEvent {
  name: 'citizenBorn' | 'citizenLeft' | 'jobTaken' | 'chatStarted' | 'cityGrew' | 'tierUnlocked' | 'coupleFormed';
  data: Record<string, unknown>;
}

export class Simulation {
  readonly clock = new GameClock();
  readonly index: WorldIndex;
  readonly economy = new Economy();
  readonly citizens = new Map<number, Citizen>();
  readonly social: SocialSystem;
  readonly paths: PathQueue;
  private rng: Rng;
  private nextId = 1;
  private lastDay = 0;
  events: SimEvent[] = [];
  /** T4.4: la ciudad crece sola. Activado por defecto (es el alma del juego). */
  autonomousGrowth = true;
  /** Tier desbloqueado (T4.5 lo ligará a población; fijo de momento). */
  tier: Tier = 1;
  /** Familias alojadas por vivienda ('ax,az') — para la demanda de techo. */
  private households = new Map<string, number>();
  /** Despensa por hogar ('ax,az') — lógica de alimento (ciclo 1). */
  readonly pantry = new Map<string, number>();

  constructor(readonly grid: Grid, seed: number) {
    this.rng = createRng(seed ^ 0x5f3759df);
    this.index = new WorldIndex(grid);
    this.social = new SocialSystem(createRng(seed ^ 0x9e3779b9));
    this.paths = new PathQueue(grid);
    this.spawnPopulation();
    this.economy.rebuild(this.index, this.citizens);
    this.hireAndAcquaint();
  }

  // --- Población -------------------------------------------------------------

  /** 1-3 adultos por hueco de vivienda. Vecinos de la misma casa se conocen. */
  private spawnPopulation(): void {
    for (const b of this.index.ofRole('residential')) {
      this.fillHome(b.ax, b.az, b.id, b.data.capacity ?? 1);
    }
  }

  /** Aloja `count` familias en una vivienda (inmigración T4.3 y arranque). */
  private fillHome(ax: number, az: number, buildingId: string, count: number): void {
    const k = `${ax},${az}`;
    this.households.set(k, (this.households.get(k) ?? 0) + count);
    // Los recién llegados traen algo de comida y unos ahorros en la mudanza.
    this.pantry.set(k, (this.pantry.get(k) ?? 0) + 3 * count);
    this.economy.wallets.set(k, (this.economy.wallets.get(k) ?? 0) + STARTING_MONEY * count);
    for (let h = 0; h < count; h++) {
      const adults = 1 + Math.floor(this.rng.next() * 2.4); // 1-3
      const family: Citizen[] = [];
      for (let a = 0; a < adults; a++) family.push(this.spawnCitizen(ax, az, buildingId));
      for (let i = 0; i < family.length; i++)
        for (let j = i + 1; j < family.length; j++) SocialSystem.acquaint(family[i], family[j], 0.6);
    }
  }

  /** Huecos de familia libres en todas las viviendas. */
  private freeHousing(): number {
    let free = 0;
    for (const b of this.index.ofRole('residential')) {
      free += (b.data.capacity ?? 1) - (this.households.get(`${b.ax},${b.az}`) ?? 0);
    }
    return free;
  }

  private spawnCitizen(ax: number, az: number, buildingId: string, age?: number): Citizen {
    const b = this.index.at(ax, az);
    const door: CellXZ = b?.entrance ?? [ax, az];
    const c: Citizen = {
      id: this.nextId++,
      name: citizenName(this.rng),
      age: age ?? Math.floor(this.rng.range(18, 72)),
      personality: {
        sociable: this.rng.next(),
        trabajador: this.rng.next(),
        hogareño: this.rng.next(),
      },
      needs: {
        // Arrancan variados para desincronizar el primer día.
        energy: this.rng.range(0.55, 0.95),
        food: this.rng.range(0.5, 0.9),
        social: this.rng.range(0.4, 0.9),
        fun: this.rng.range(0.4, 0.9),
        purpose: this.rng.range(0.3, 0.8),
      },
      home: { ax, az, buildingId },
      work: null,
      partnerId: null,
      // Los adultos fundadores llegan con estudios variados; los niños, de cero.
      education: age === undefined ? this.rng.range(0.2, 0.9) : 0,
      x: door[0] + 0.5,
      z: door[1] + 0.5,
      heading: this.rng.range(0, Math.PI * 2),
      phase: { kind: 'deciding' },
      activity: 'none',
      friends: new Map(),
      lastChatTick: -9999,
      inside: true, // empiezan en casa
    };
    this.citizens.set(c.id, c);
    this.events.push({ name: 'citizenBorn', data: { id: c.id, name: c.name } });
    return c;
  }

  /** Contrata parados y presenta a vecinos cercanos y compañeros de trabajo. */
  private hireAndAcquaint(): void {
    const hires = this.economy.assignJobs(this.citizens);
    for (const h of hires) this.events.push({ name: 'jobTaken', data: h as unknown as Record<string, unknown> });
    // Compañeros de trabajo se conocen.
    for (const w of this.economy.workplaces) {
      for (let i = 0; i < w.workers.length; i++)
        for (let j = i + 1; j < w.workers.length; j++) {
          const a = this.citizens.get(w.workers[i]);
          const b = this.citizens.get(w.workers[j]);
          if (a && b) SocialSystem.acquaint(a, b, 0.3);
        }
    }
    // Vecinos a < 12 celdas se conocen de vista.
    const all = [...this.citizens.values()];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (manhattan([a.home.ax, a.home.az], [b.home.ax, b.home.az]) < 40) SocialSystem.acquaint(a, b);
      }
  }

  // --- Tick -------------------------------------------------------------------

  private context(): SimContext {
    return {
      index: this.index,
      rng: this.rng,
      darkness: this.clock.darkness,
      hour: this.clock.hour,
      citizens: this.citizens,
      visitCounters: this.economy.visitsToday,
      pantry: this.pantry,
      wallets: this.economy.wallets,
    };
  }

  /** Un sub-tick de TICK_GAME_S segundos de juego. */
  step(): void {
    this.clock.advance();
    const hours = TICK_GAME_S / 3600;
    const ctx = this.context();

    this.paths.process();

    // Charlas en curso (antes que el autómata: ocupan a sus participantes).
    this.social.advance(this.citizens, this.clock.tick);

    const walkers: Citizen[] = [];

    for (const c of this.citizens.values()) {
      decayNeeds(c.needs, c.personality, hours);
      if (this.social.isChatting(c.id)) {
        c.activity = 'chat';
        continue; // parado charlando; social.ts le restaura
      }
      this.stepCitizen(c, ctx);
      // Candidatos a saludo: cualquiera al aire libre (andando o parado).
      if (!c.inside && (c.phase.kind === 'moving' || c.phase.kind === 'doing')) walkers.push(c);
    }

    // Encuentros emergentes entre caminantes.
    const started = this.social.detectEncounters(walkers, this.clock.tick);
    for (const chat of started) {
      const a = this.citizens.get(chat.a)!;
      const b = this.citizens.get(chat.b)!;
      // Se paran, cara a cara; el plan que llevaban se descarta (re-decidirán).
      for (const [self, other] of [[a, b], [b, a]] as const) {
        self.phase = { kind: 'deciding' };
        self.activity = 'chat';
        self.heading = Math.atan2(other.x - self.x, other.z - self.z);
      }
      this.events.push({ name: 'chatStarted', data: { a: a.id, b: b.id } });
    }

    // Crecimiento autónomo: un intento por hora de juego, solo de día
    // (los edificios "brotan" con luz — cosmética barata y determinista).
    if (this.autonomousGrowth && this.clock.tick % 100 === 0 && this.clock.darkness < 0.5) {
      this.maybeGrow();
    }

    // Cierre del día: vida (1 día = 1 año), economía, contratos, tiers.
    if (this.clock.day !== this.lastDay) {
      this.lastDay = this.clock.day;
      this.stepLife();
      this.economy.endOfDay();
      this.hireAndAcquaint();
      const pop = this.citizens.size;
      const unlocked: Tier = pop >= 200 ? 4 : pop >= 80 ? 3 : pop >= 25 ? 2 : 1;
      if (unlocked > this.tier) {
        this.tier = unlocked;
        this.events.push({ name: 'tierUnlocked', data: { tier: unlocked, population: pop } });
      }
    }
  }

  // --- Lógica de vida (lifecycle.ts) -------------------------------------------

  /** Un año por día de juego: envejecer, emparejar, nacer, morir. */
  private stepLife(): void {
    const life = lifeYear(this.citizens, this.rng);
    for (const d of life.deaths) {
      const partner = d.partnerId !== null ? this.citizens.get(d.partnerId) : undefined;
      if (partner) partner.partnerId = null;
      this.citizens.delete(d.id);
      const k = `${d.home.ax},${d.home.az}`;
      // Ojo: la familia sigue en la casa; solo liberamos el hueco si era el último.
      if (![...this.citizens.values()].some((c) => c.home.ax === d.home.ax && c.home.az === d.home.az)) {
        this.households.set(k, Math.max(0, (this.households.get(k) ?? 1) - 1));
      }
      this.events.push({ name: 'citizenLeft', data: { id: d.id, name: d.name, age: d.age } });
    }
    for (const [a, b] of life.couples) {
      this.events.push({ name: 'coupleFormed', data: { a: a.name, b: b.name } });
    }
    for (const b of life.births) {
      const child = this.spawnCitizen(b.home.ax, b.home.az, b.home.buildingId, 0);
      SocialSystem.acquaint(child, b.parents[0], 0.8);
      SocialSystem.acquaint(child, b.parents[1], 0.8);
    }
    if (life.deaths.length > 0) this.economy.rebuild(this.index, this.citizens);
  }

  // --- Crecimiento autónomo (T4.1-T4.3) ---------------------------------------

  private maybeGrow(): void {
    const stats = this.economy.stats(this.citizens);
    const shops = this.economy.workplaces.filter((w) => w.building.data.role === 'commerce');
    let avgProsperity = 0;
    for (const s of shops) avgProsperity += this.economy.prosperity.get(`${s.building.ax},${s.building.az}`) ?? 0.5;
    avgProsperity = shops.length > 0 ? avgProsperity / shops.length : 0;

    const demand = computeDemand({
      // Para el mercado laboral cuentan los adultos (los niños no son "paro").
      population: stats.adults,
      employed: stats.employed,
      jobs: stats.jobs,
      freeHousing: this.freeHousing(),
      shops: shops.length,
      avgProsperity,
      tier: this.tier,
      children: [...this.citizens.values()].filter((c) => c.age >= 6 && c.age < 18).length,
      studentSlots: this.index.buildings.reduce((n, b) => n + (b.data.students ?? 0), 0),
    });
    if (!demand) return;

    const id = itemForDemand(demand, this.tier);
    const it = catalogData(id);
    if (!it) return;
    const center = townCenter(
      this.index.buildings.filter((b) => b.data.role !== 'nature').map((b) => [b.ax, b.az]),
    );
    const p = findParcel(this.grid, id, center, this.rng);
    if (!p) return;
    this.applyGrowth(p);
  }

  /** Coloca el edificio, reindexa y aloja/contrata. Emite `cityGrew` para que
   * el main replique la colocación en el grid de render. */
  private applyGrowth(p: GrowthPlacement): void {
    const it = catalogData(p.id);
    if (!it || !this.grid.placeBuilding(p.id, it.w, it.d, p.cx, p.cz, p.rot)) return;
    this.index.rebuild();
    this.economy.rebuild(this.index, this.citizens);
    if (it.role === 'residential') {
      this.fillHome(p.cx, p.cz, p.id, it.capacity ?? 1); // inmigración
    }
    this.hireAndAcquaint();
    this.events.push({ name: 'cityGrew', data: { ...p } });
  }

  private stepCitizen(c: Citizen, ctx: SimContext): void {
    switch (c.phase.kind) {
      case 'deciding': {
        const next = chooseActivity(c, ctx);
        if (!next) return; // apatía: idle donde está
        const from: CellXZ = [Math.round(c.x - 0.5), Math.round(c.z - 0.5)];
        if (manhattan(from, next.cell) <= 1) {
          this.beginDoing(c, next);
          return;
        }
        const ticket = this.paths.request(from, next.cell);
        c.phase = { kind: 'waitingPath', ticket, next };
        c.activity = next.activity;
        return;
      }
      case 'waitingPath': {
        const res = this.paths.take(c.phase.ticket);
        if (!res) return; // aún calculando (presupuesto incremental)
        if (res.status === 'fail') {
          c.phase = { kind: 'deciding' };
          c.activity = 'none';
          return;
        }
        c.inside = false;
        c.phase = { kind: 'moving', path: res.path, segment: 0, t: 0, next: c.phase.next };
        return;
      }
      case 'moving': {
        this.stepWalk(c);
        return;
      }
      case 'doing': {
        const def = ACTIVITY_BY_KIND.get(c.activity);
        if (def) {
          const hours = TICK_GAME_S / 3600;
          for (const k of NEED_KEYS) {
            const r = def.restorePerHour[k];
            if (r) restore(c.needs, k, r * hours);
          }
          if (c.activity === 'school') c.education = Math.min(1, c.education + EDU_PER_HOUR * hours);
          if (c.activity === 'work' && c.work) {
            const employer = catalogData(c.work.buildingId);
            // Cadena de alimento: los granjeros en faena llenan el granero.
            if (employer?.role === 'agriculture') this.economy.produceFood(hours);
            // Dinero: cada hora trabajada es salario para el hogar.
            this.economy.payWage(`${c.home.ax},${c.home.az}`, hours, employer?.tier ?? 0);
          }
        }
        if (this.clock.time >= c.phase.until) {
          c.phase = { kind: 'deciding' };
          c.activity = 'none';
          c.inside = false;
        }
        return;
      }
    }
  }

  private beginDoing(c: Citizen, planned: PlannedActivity): void {
    const def = ACTIVITY_BY_KIND.get(planned.activity);
    c.activity = planned.activity;
    c.phase = { kind: 'doing', until: this.clock.time + planned.duration };
    c.inside = def?.indoors ?? false;
    if (planned.activity === 'shop' && planned.target) {
      this.economy.registerVisit(planned.target);
      const k = `${c.home.ax},${c.home.az}`;
      // Compra de comida: limitada por granero Y bolsillo (lógica de dinero).
      const got = this.economy.buyFood(k, 3);
      this.pantry.set(k, (this.pantry.get(k) ?? 0) + got);
      // Un capricho si el hogar va holgado (sumidero de dinero).
      if (this.economy.walletOf(k) > 30) this.economy.spend(k, SHOP_TREAT_PRICE);
    }
    if (planned.activity === 'eat') {
      const k = `${c.home.ax},${c.home.az}`;
      const atShop = planned.target && catalogData(planned.target.buildingId)?.role === 'commerce';
      if (atShop) {
        // Comer fuera: compra, come una unidad y lleva el resto a la despensa.
        const got = this.economy.buyFood(k, 4);
        this.pantry.set(k, (this.pantry.get(k) ?? 0) + Math.max(0, got - 1));
        if (planned.target) this.economy.registerVisit(planned.target);
      } else {
        this.pantry.set(k, Math.max(0, (this.pantry.get(k) ?? 0) - 1));
      }
    }
    // Ancla la posición a la celda destino (la puerta) mientras "hace".
    c.x = planned.cell[0] + 0.5;
    c.z = planned.cell[1] + 0.5;
  }

  private stepWalk(c: Citizen): void {
    if (c.phase.kind !== 'moving') return;
    let remaining = WALK_CELLS_PER_TICK;
    const ph = c.phase;
    while (remaining > 0) {
      const a = ph.path[ph.segment];
      const b = ph.path[ph.segment + 1];
      if (!b) {
        this.beginDoing(c, ph.next);
        return;
      }
      const segLen = manhattan(a, b);
      const left = (1 - ph.t) * segLen;
      const advance = Math.min(remaining, left);
      ph.t += advance / segLen;
      remaining -= advance;
      const x = a[0] + (b[0] - a[0]) * ph.t + 0.5;
      const z = a[1] + (b[1] - a[1]) * ph.t + 0.5;
      c.heading = Math.atan2(x - c.x, z - c.z) || c.heading;
      c.x = x;
      c.z = z;
      if (ph.t >= 1) {
        ph.segment++;
        ph.t = 0;
      }
    }
  }

  // --- Snapshot ----------------------------------------------------------------

  /** Serializa agentes al layout plano del protocolo. */
  snapshot(): Float32Array {
    const arr = new Float32Array(this.citizens.size * AGENT_STRIDE);
    let i = 0;
    for (const c of this.citizens.values()) {
      const state = c.inside
        ? AgentState.Inside
        : c.phase.kind === 'moving'
          ? AgentState.Walking
          : AgentState.Idle;
      arr[i++] = c.id;
      arr[i++] = c.x;
      arr[i++] = c.z;
      arr[i++] = c.heading;
      arr[i++] = state;
      arr[i++] = activityId(c.activity);
    }
    return arr;
  }

  /** Estado legible de un ciudadano (inspector T3.10). */
  describe(id: number): { name: string; activity: ActivityKind; activityLabel: string; needs: Record<string, number>; home: [number, number]; work?: [number, number] } | null {
    const c = this.citizens.get(id);
    if (!c) return null;
    return {
      name: c.name,
      activity: c.activity,
      activityLabel: activityLabel(c.activity, c.phase.kind === 'moving' || c.phase.kind === 'waitingPath'),
      needs: { ...c.needs },
      home: [c.home.ax, c.home.az],
      work: c.work ? [c.work.ax, c.work.az] : undefined,
    };
  }

  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
