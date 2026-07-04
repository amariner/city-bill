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
import { GameClock, TICK_GAME_S, DAY_GAME_SECONDS } from './clock';
import { PathQueue, pathLength } from './pathfinding';
import { CellXZ, manhattan } from './geometry';
import { WorldIndex } from './worldIndex';
import { Economy } from './economy';
import { Citizen, citizenName, PlannedActivity, TravelMode } from './citizens/citizen';
import { decayNeeds, restore, NEED_KEYS } from './citizens/needs';
import { chooseActivity } from './citizens/brain';
import { ACTIVITY_BY_KIND, SimContext, activityLabel, EDU_PER_HOUR, CLINIC_FEE, isFestivalDay, CLUB_AFFINITY } from './citizens/activities';
import { SocialSystem } from './citizens/social';
import { AgentState, ActivityKind, activityId, AGENT_STRIDE, TravelModeCode } from './protocol';
import { computeDemand, itemForDemand, findParcel, townCenter, GrowthPlacement, extendRoad } from '../world/growth';
import { lifeYear } from './lifecycle';
import { STARTING_MONEY, SHOP_TREAT_PRICE, PENSION_PER_DAY } from './economy';
import { catalogData, Tier } from '../world/catalogData';
import { healthTick, CLINIC_RECOVERY_PER_HOUR, WORK_BLOCK_HEALTH } from './health';
import { weatherAt, Weather } from './weather';

/** Velocidad al caminar, en celdas por tick (0.25 s reales a vel. 1). */
const WALK_CELLS_PER_TICK = 0.9; // ≈ 7 km/h de juego a escala urbana

// --- Lógica de vehículos (ciclo 8) --------------------------------------------
/** A partir de esta distancia (celdas), el trayecto se plantea en coche —
 * igual que a pie, es una PREFERENCIA de la utility AI, no un guion: si no
 * hay dinero para el trayecto, se va a pie igualmente (más lento pero libre). */
const CAR_TRIP_THRESHOLD = 40;
/** Coste de combustible por trayecto en coche (acopla vehículos↔dinero). */
export const CAR_TRIP_COST = 4;
/** Velocidad en coche sobre asfalto: mucho más rápida que a pie. */
const CAR_CELLS_PER_TICK_ROAD = 3.6;
/** Fuera de vía (aparcando, accediendo a la puerta) el coche va despacio —
 * similar al peatón, no vuela por el campo. */
const CAR_CELLS_PER_TICK_OFFROAD = WALK_CELLS_PER_TICK;

/** Acoplamiento clima↔vehículos (ciclo 6/8 de RESEARCH.md): cuánto exprime el
 * mal tiempo la velocidad base según el modo. A pie se nota de verdad
 * (charcos, viento); en coche, protegido, casi nada. Exportada (pura) para
 * poder testearla sin levantar una Simulation entera. */
export function weatherSpeedFactor(mode: 'foot' | 'car', outdoor: number): number {
  return mode === 'foot' ? 0.6 + 0.4 * outdoor : 0.92 + 0.08 * outdoor;
}

// --- Lógica de duelo (nueva carencia observada: la muerte no afectaba a
// nadie más que al difunto) ----------------------------------------------
/** Duelo al morir la pareja: máximo, llena el depósito entero. */
const PARTNER_GRIEF = 1;
/** Duelo al morir un amigo CERCANO (misma barra que "tercer lugar" — no
 * cualquier conocido, un vínculo de verdad): más suave que perder pareja. */
export const FRIEND_GRIEF = 0.45;
/** El duelo no lo restaura ninguna actividad — solo se apaga con el tiempo,
 * a lo largo de unas dos semanas de juego (mismo orden que un luto real). */
const GRIEF_DECAY_PER_HOUR = 1 / (24 * 14);
/** Mientras dura el duelo, cuesta más disfrutar: nada sabe tan bien. */
const GRIEF_FUN_DECAY_PER_HOUR = 1 / 10;

/** Duelo tras `hours` horas: nada lo restaura, solo el tiempo lo apaga —
 * lineal hasta 0, nunca negativo. Exportada (pura) para testear la curva
 * sin levantar una Simulation entera. */
export function griefDecay(grief: number, hours: number): number {
  return Math.max(0, grief - GRIEF_DECAY_PER_HOUR * hours);
}

/** Cuántos adultos llegan a una vivienda nueva (inmigración): 1-3, con un
 * barrio de posibles (prestigio medio [0,1] de la ciudad) atrayendo
 * familias más completas — acoplamiento prestigio→inmigración (RESEARCH.md,
 * carencia anotada en los ciclos 9/10). En `avgPrestige=0` es exactamente
 * la curva original (1-3, sin sesgo). Exportada (pura) para testear sin
 * levantar una Simulation entera. */
export function familySize(rng: Rng, avgPrestige: number): number {
  return 1 + Math.floor(rng.next() * (2.4 + avgPrestige * 0.6));
}

// --- Lógica de estatus y propiedad (ciclo 9) ----------------------------------
/** Bonus de 'fun' por hora en casa, a prestigio máximo (se escala por él). */
const COMFORT_FUN_PER_HOUR = 0.15;

export interface SimEvent {
  name:
    | 'citizenBorn'
    | 'citizenLeft'
    | 'jobTaken'
    | 'chatStarted'
    | 'cityGrew'
    | 'tierUnlocked'
    | 'coupleFormed'
    | 'festivalDay'
    | 'homePrestige'
    | 'cultivationChanged'
    | 'roadBuilt';
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
  /** Trayectos en coche acumulados (ciclo 8 — métrica de tests/Crónica). */
  carTrips = 0;

  constructor(readonly grid: Grid, readonly seed: number) {
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
    const prestige = this.avgPrestige();
    for (let h = 0; h < count; h++) {
      const adults = familySize(this.rng, prestige);
      const family: Citizen[] = [];
      for (let a = 0; a < adults; a++) family.push(this.spawnCitizen(ax, az, buildingId));
      for (let i = 0; i < family.length; i++)
        for (let j = i + 1; j < family.length; j++) SocialSystem.acquaint(family[i], family[j], 0.6);
    }
  }

  private avgHealth(): number {
    if (this.citizens.size === 0) return 1;
    let sum = 0;
    for (const c of this.citizens.values()) sum += c.health;
    return sum / this.citizens.size;
  }

  /** Prestigio medio de la ciudad YA construida (0 si nadie ha invertido
   * aún). Base del acoplamiento prestigio→inmigración: un pueblo "de
   * posibles" es más goloso para quien llega. */
  private avgPrestige(): number {
    if (this.economy.prestige.size === 0) return 0;
    let sum = 0;
    for (const p of this.economy.prestige.values()) sum += p;
    return sum / this.economy.prestige.size;
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
      health: this.rng.range(0.75, 1),
      grief: 0,
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

  /** Tiempo de HOY — puro por (seed, día), no consume el RNG general. */
  get weather(): Weather {
    return weatherAt(this.seed, this.clock.day);
  }

  private context(): SimContext {
    return {
      index: this.index,
      rng: this.rng,
      darkness: this.clock.darkness,
      hour: this.clock.hour,
      day: this.clock.day,
      citizens: this.citizens,
      visitCounters: this.economy.visitsToday,
      pantry: this.pantry,
      wallets: this.economy.wallets,
      weather: this.weather,
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
      if (c.grief > 0) {
        // Duelo: nada lo restaura, solo se apaga con el tiempo; mientras
        // dura, cuesta más disfrutar (fun decae más rápido de lo normal).
        c.grief = griefDecay(c.grief, hours);
        c.needs.fun = Math.max(0, c.needs.fun - c.grief * GRIEF_FUN_DECAY_PER_HOUR * hours);
      }
      healthTick(c, hours); // lógica de salud: fondo, no una actividad
      // Estatus (ciclo 9): una vivienda mejorada es más agradable — quien
      // está EN CASA (durmiendo, comiendo) recupera algo más de ánimo.
      if (c.inside && (c.activity === 'sleep' || c.activity === 'eat' || c.activity === 'none')) {
        const prestige = this.economy.prestigeOf(`${c.home.ax},${c.home.az}`);
        if (prestige > 0) restore(c.needs, 'fun', prestige * COMFORT_FUN_PER_HOUR * hours);
      }
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
      this.events.push({ name: 'cultivationChanged', data: { level: this.economy.cultivation } });
      this.payPensions();
      // estatus, ciclo 9: cada hogar mejorado emite su evento para que el
      // render decore ESA vivienda (jardín/fachada) sin re-sincronizar todo.
      for (const u of this.economy.investInHomes(this.households.keys())) {
        const [ax, az] = u.key.split(',').map(Number);
        this.events.push({ name: 'homePrestige', data: { ax, az, prestige: u.prestige } });
      }
      this.hireAndAcquaint();
      if (isFestivalDay(this.clock.day)) {
        this.events.push({ name: 'festivalDay', data: { day: this.clock.day } });
      }
      const pop = this.citizens.size;
      const unlocked: Tier = pop >= 200 ? 4 : pop >= 80 ? 3 : pop >= 25 ? 2 : 1;
      if (unlocked > this.tier) {
        this.tier = unlocked;
        this.events.push({ name: 'tierUnlocked', data: { tier: unlocked, population: pop } });
      }
    }
  }

  // --- Lógica de gobierno (impuestos ya en economy.payWage; pensiones aquí) ---

  /** Hogares sin ningún adulto empleado y con bolsillo bajo: red de
   * protección mínima (ciclo 3 de RESEARCH.md). Sostiene a jubilados y
   * parados de larga duración para que no emigren por pura miseria. */
  private payPensions(): void {
    const employedHomes = new Set<string>();
    for (const c of this.citizens.values()) if (c.work) employedHomes.add(`${c.home.ax},${c.home.az}`);
    const needy: string[] = [];
    for (const k of this.households.keys()) {
      if (employedHomes.has(k)) continue;
      if (this.economy.walletOf(k) < PENSION_PER_DAY * 2) needy.push(k);
    }
    needy.sort(); // determinista
    this.economy.payPensions(needy);
  }

  // --- Lógica de vida (lifecycle.ts) -------------------------------------------

  /** Un año por día de juego: envejecer, emparejar, nacer, morir. */
  private stepLife(): void {
    const life = lifeYear(this.citizens, this.rng);
    for (const d of life.deaths) {
      const partner = d.partnerId !== null ? this.citizens.get(d.partnerId) : undefined;
      if (partner) {
        partner.partnerId = null;
        partner.grief = Math.max(partner.grief, PARTNER_GRIEF);
      }
      // Duelo (lógica nueva): quien tuviera al difunto como amigo CERCANO
      // (no cualquier conocido — el mismo umbral que el "tercer lugar" de
      // vecindario) también lo siente, más suave que perder pareja.
      for (const c of this.citizens.values()) {
        const aff = c.friends.get(d.id);
        if (aff !== undefined && aff >= CLUB_AFFINITY) c.grief = Math.max(c.grief, FRIEND_GRIEF);
      }
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
      avgHealth: this.avgHealth(),
      hasClinic: this.index.buildings.some((b) => b.id === 'clinic'),
    });
    if (!demand) return;

    const id = itemForDemand(demand, this.tier);
    const it = catalogData(id);
    if (!it) return;
    const center = townCenter(
      this.index.buildings.filter((b) => b.data.role !== 'nature').map((b) => [b.ax, b.az]),
    );
    let p = findParcel(this.grid, id, center, this.rng);
    if (!p) {
      // T4.4 — modo autónomo: sin parcela servible junto a una vía existente,
      // la ciudad se abre un ramal nuevo antes de rendirse este intento.
      const ext = extendRoad(this.grid, center);
      if (!ext) return;
      this.events.push({ name: 'roadBuilt', data: { rx: ext.rx, rz: ext.rz, axis: ext.axis, dir: ext.dir, length: ext.length } });
      p = findParcel(this.grid, id, center, this.rng);
      if (!p) return;
    }
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
        // Trayecto largo Y el hogar puede pagar el combustible → coche;
        // si no, a pie (más lento pero siempre disponible). Sin coordinación
        // con nadie más: cada cual decide con lo suyo, como el resto del motor.
        const homeKey = `${c.home.ax},${c.home.az}`;
        let mode: TravelMode = 'foot';
        if (pathLength(res.path) > CAR_TRIP_THRESHOLD && this.economy.walletOf(homeKey) >= CAR_TRIP_COST) {
          this.economy.spend(homeKey, CAR_TRIP_COST);
          mode = 'car';
          this.carTrips++;
        }
        c.phase = { kind: 'moving', path: res.path, segment: 0, t: 0, next: c.phase.next, mode };
        return;
      }
      case 'moving': {
        this.stepWalk(c, ctx.weather.outdoorFactor);
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
          if (c.activity === 'clinic') c.health = Math.min(1, c.health + CLINIC_RECOVERY_PER_HOUR * hours);
          if (c.activity === 'work' && c.work) {
            const employer = catalogData(c.work.buildingId);
            // Cadena de alimento: los granjeros en faena llenan el granero.
            if (employer?.role === 'agriculture') this.economy.produceFood(`${c.home.ax},${c.home.az}`, hours);
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
    // Revalida salud AL LLEGAR (no solo al decidir): si empeoró de camino,
    // se da media vuelta y vuelve a decidir (probablemente irá a curarse).
    // Cierra un caso límite real observado en el ciclo 6: caminar a un
    // trabajo lejano puede tardar más de lo que la salud aguanta.
    if (planned.activity === 'work' && c.health < WORK_BLOCK_HEALTH) {
      c.phase = { kind: 'deciding' };
      c.activity = 'none';
      return;
    }
    // Revalida la FECHA al llegar, no solo al decidir: decidir ir a la
    // fiesta a última hora y tardar en llegar (camino largo, cola de paths)
    // puede dejar a alguien "empezando" la fiesta ya en el día siguiente —
    // mismo patrón que la revalidación de salud de arriba, esta vez para el
    // caso límite que el recorte de duración de más abajo NO cubre (ese
    // evita que se ALARGUE pasada medianoche; este evita que EMPIECE ya
    // pasada medianoche).
    if (planned.activity === 'festival' && !isFestivalDay(this.clock.day)) {
      c.phase = { kind: 'deciding' };
      c.activity = 'none';
      return;
    }
    const def = ACTIVITY_BY_KIND.get(planned.activity);
    c.activity = planned.activity;
    let until = this.clock.time + planned.duration;
    // La fiesta es una FECHA, no un turno: si se decide tarde y la duración
    // sorteada la haría cruzar medianoche, se acorta para que NUNCA quede
    // "asistiendo" en el día siguiente (invariante del ciclo 10 de
    // RESEARCH.md — sin esto, empezar a las 23h con 3h de duración deja al
    // ciudadano en la fiesta fuera de fecha, aunque decidiera ir dentro de
    // ella). El resto de actividades SÍ cruzan medianoche a propósito
    // (dormir, por ejemplo) — esto es exclusivo de eventos de calendario.
    if (planned.activity === 'festival') {
      const endOfDay = (this.clock.day + 1) * DAY_GAME_SECONDS;
      until = Math.min(until, endOfDay);
    }
    c.phase = { kind: 'doing', until };
    c.inside = def?.indoors ?? false;
    if (planned.activity === 'shop' && planned.target) {
      this.economy.registerVisit(planned.target);
      const k = `${c.home.ax},${c.home.az}`;
      const shopKey = `${planned.target.ax},${planned.target.az}`;
      // Compra de comida: limitada por granero Y bolsillo (lógica de dinero);
      // el importe entra en la caja de ESA tienda (economía circular).
      const got = this.economy.buyFood(shopKey, k, 3);
      this.pantry.set(k, (this.pantry.get(k) ?? 0) + got);
      // Un capricho si el hogar va holgado (sumidero de dinero).
      if (this.economy.walletOf(k) > 30) this.economy.spend(k, SHOP_TREAT_PRICE);
    }
    if (planned.activity === 'clinic') {
      // Consultorio público: la consulta paga una tasa que va al tesoro
      // (acopla salud↔dinero↔gobierno). Si no llega a cubrirla, se atiende
      // igual (nadie se queda sin curar por 6 monedas) pero el gasto es 0.
      const k = `${c.home.ax},${c.home.az}`;
      this.economy.treasury += this.economy.spend(k, CLINIC_FEE);
      if (planned.target) this.economy.registerVisit(planned.target);
    }
    if (planned.activity === 'eat') {
      const k = `${c.home.ax},${c.home.az}`;
      const atShop = planned.target && catalogData(planned.target.buildingId)?.role === 'commerce';
      if (atShop && planned.target) {
        // Comer fuera: compra, come una unidad y lleva el resto a la despensa.
        const shopKey = `${planned.target.ax},${planned.target.az}`;
        const got = this.economy.buyFood(shopKey, k, 4);
        this.pantry.set(k, (this.pantry.get(k) ?? 0) + Math.max(0, got - 1));
        this.economy.registerVisit(planned.target);
      } else {
        this.pantry.set(k, Math.max(0, (this.pantry.get(k) ?? 0) - 1));
      }
    }
    // Ancla la posición a la celda destino (la puerta) mientras "hace".
    c.x = planned.cell[0] + 0.5;
    c.z = planned.cell[1] + 0.5;
  }

  /** Celdas/tick en (cx,cz): a pie depende del terreno Y del tiempo (la
   * lluvia/el frío calan de verdad al ir andando); en coche depende del
   * terreno (rápido en 'road', al ritmo de un peatón fuera de vía) y el
   * tiempo apenas se nota — acoplamiento clima↔vehículos (ciclo 6/8 de
   * RESEARCH.md): quien va protegido dentro de un coche no camina bajo la
   * lluvia. `outdoor` viene YA calculado del contexto del tick (ctx.weather):
   * calcularlo aquí otra vez recrearía weatherAt() por cada peatón cada
   * tick, rompiendo el presupuesto de 50 ms a escala. */
  private speedAt(cx: number, cz: number, mode: 'foot' | 'car', outdoor: number): number {
    if (mode === 'foot') return WALK_CELLS_PER_TICK * weatherSpeedFactor('foot', outdoor);
    const onRoad = this.grid.get(Math.round(cx), Math.round(cz))?.terrain === 'road';
    const base = onRoad ? CAR_CELLS_PER_TICK_ROAD : CAR_CELLS_PER_TICK_OFFROAD;
    return base * weatherSpeedFactor('car', outdoor);
  }

  private stepWalk(c: Citizen, outdoor: number): void {
    if (c.phase.kind !== 'moving') return;
    const ph = c.phase;
    // Presupuesto en FRACCIONES DE TICK (no celdas): así, si el trayecto
    // cruza de asfalto a fuera de vía a media tick, la velocidad se
    // recalcula en el momento justo del cambio, no de golpe al principio.
    let tickBudget = 1;
    while (tickBudget > 0) {
      const a = ph.path[ph.segment];
      const b = ph.path[ph.segment + 1];
      if (!b) {
        this.beginDoing(c, ph.next);
        return;
      }
      const speed = this.speedAt(a[0], a[1], ph.mode, outdoor);
      const segLen = manhattan(a, b);
      const cellsLeft = (1 - ph.t) * segLen;
      const ticksToFinish = speed > 0 ? cellsLeft / speed : Infinity;
      const ticksUsed = Math.min(tickBudget, ticksToFinish);
      const advance = ticksUsed * speed;
      ph.t += segLen > 0 ? advance / segLen : 1;
      tickBudget -= ticksUsed;
      const x = a[0] + (b[0] - a[0]) * ph.t + 0.5;
      const z = a[1] + (b[1] - a[1]) * ph.t + 0.5;
      c.heading = Math.atan2(x - c.x, z - c.z) || c.heading;
      c.x = x;
      c.z = z;
      if (ph.t >= 1) {
        ph.segment++;
        ph.t = 0;
      }
      // Si no llegó a t=1, fue porque se agotó tickBudget (queda ~0): el
      // `while` de arriba corta solo, sin condición extra que duplicar.
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
      arr[i++] = c.phase.kind === 'moving' && c.phase.mode === 'car' ? TravelModeCode.Car : TravelModeCode.Foot;
    }
    return arr;
  }

  /** Estado legible de un ciudadano (inspector T3.10). */
  describe(id: number): { name: string; activity: ActivityKind; activityLabel: string; needs: Record<string, number>; home: [number, number]; work?: [number, number]; health: number; wallet: number; pantry: number; prestige: number; grief: number } | null {
    const c = this.citizens.get(id);
    if (!c) return null;
    const homeKey = `${c.home.ax},${c.home.az}`;
    return {
      name: c.name,
      activity: c.activity,
      activityLabel: activityLabel(c.activity, c.phase.kind === 'moving' || c.phase.kind === 'waitingPath'),
      needs: { ...c.needs },
      home: [c.home.ax, c.home.az],
      work: c.work ? [c.work.ax, c.work.az] : undefined,
      health: c.health,
      wallet: this.economy.walletOf(homeKey),
      pantry: this.pantry.get(homeKey) ?? 0,
      prestige: this.economy.prestigeOf(homeKey),
      grief: c.grief,
    };
  }

  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
