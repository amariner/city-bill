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

/** Producción de comida por granjero y hora trabajada (lógica de alimento). */
export const FOOD_PER_FARMER_HOUR = 4;

// --- Lógica de dinero (ciclo 2 de RESEARCH.md) --------------------------------
/** Salario base por hora trabajada; los tiers altos pagan más. */
export const WAGE_PER_HOUR = 10;
export const WAGE_TIER_BONUS = 4; // por nivel de tier del empleador
/** Retorno a la educación (ciclo 28): un trabajador plenamente cualificado
 * (education 1) cobra este % más que uno sin estudios — desigualdad realista y
 * la educación por fin PAGA (además de abrir empleos de tier alto). */
export const WAGE_SKILL_BONUS = 0.6;
/** Precio de la unidad de comida. */
export const FOOD_PRICE = 2;
/** Gasto de capricho al ir de compras (si el hogar puede permitírselo). */
export const SHOP_TREAT_PRICE = 5;
/** Con qué llega una familia inmigrante. */
export const STARTING_MONEY = 60;

// --- Lógica de gobierno (ciclo 3): impuestos y pensiones ----------------------
/** Parte del salario que va al tesoro municipal. */
export const TAX_RATE = 0.2;
/** Pensión diaria por hogar sin ingresos (si el tesoro alcanza). */
export const PENSION_PER_DAY = 18;

// --- Lógica de estatus y propiedad (ciclo 9, N4 estima) ------------------------
/** Ahorro sostenido por encima de esto: el hogar se plantea invertir. */
export const PRESTIGE_SAVE_THRESHOLD = 80;
/** Coste de cada mejora del hogar (jardín, fachada…). */
export const PRESTIGE_INVEST_COST = 40;
/** Cuánto sube el prestigio por mejora — hacen falta varias para llenarlo. */
export const PRESTIGE_STEP = 0.15;

// --- Lógica de economía circular (ciclo 4) -------------------------------------
/** Lo que la tienda paga por unidad al comprar al por mayor (el resto de
 * FOOD_PRICE es su margen). Cierra el círculo: el cliente paga a la tienda,
 * la tienda paga a quien produjo. */
export const WHOLESALE_FOOD_PRICE = FOOD_PRICE * 0.4;
/** Del margen de la tienda, la parte que tributa como impuesto de sociedades. */
export const CORP_TAX_RATE = 0.15;

export class Economy {
  workplaces: Workplace[] = [];
  /** Granero comunal: lo llenan los granjeros, lo venden las tiendas.
   * (Ciclo 1 de RESEARCH.md — stock POR tienda cuando haya dinero/logística.) */
  granary = 60;
  /** Unidades de comida vendidas (métrica de la cadena para tests/crónica). */
  foodSold = 0;
  /** Ahorro por hogar ('ax,az') — lógica de dinero. */
  wallets = new Map<string, number>();
  /** Prestigio del hogar [0,1] (ciclo 9) — jardín, fachada, reformas. */
  prestige = new Map<string, number>();
  /** Cuánto se ha invertido en total (métrica de tests/Crónica). */
  prestigeInvested = 0;
  /** Métricas de circulación (tests/crónica). */
  wagesPaid = 0;
  moneySpent = 0;
  /** Tesoro municipal (impuestos) y lo pagado en pensiones (gobierno). */
  treasury = 0;
  taxesCollected = 0;
  pensionsPaid = 0;
  /** Caja de cada tienda ('ax,az') — economía circular (ciclo 4). */
  tills = new Map<string, number>();
  /** Comida vendida HOY por tienda, para liquidar el mayorista al cierre. */
  private foodSoldTodayByShop = new Map<string, number>();
  /** Horas de faena HOY por granjero (clave = hogar 'ax,az'), para repartir
   * lo que pagan las tiendas al mayorista proporcionalmente a quien produjo. */
  private farmerHoursToday = new Map<string, number>();
  /** Métricas de la economía circular (tests/crónica). */
  wholesalePaid = 0;
  corpTaxCollected = 0;

  /** Nómina: el trabajo mete dinero en el hogar del trabajador, menos la
   * parte que va al tesoro municipal (impuesto sobre la renta, lógica de
   * gobierno). El tesoro es lo que luego paga pensiones. */
  payWage(homeKey: string, hours: number, employerTier: number, skill = 0): void {
    const skillMult = 1 + WAGE_SKILL_BONUS * Math.min(1, Math.max(0, skill));
    const gross = (WAGE_PER_HOUR + WAGE_TIER_BONUS * employerTier) * skillMult * hours;
    const tax = gross * TAX_RATE;
    const net = gross - tax;
    this.wallets.set(homeKey, (this.wallets.get(homeKey) ?? 0) + net);
    this.wagesPaid += net;
    this.treasury += tax;
    this.taxesCollected += tax;
  }

  /** Pensión diaria a hogares sin ningún ingreso propio (ni salario del día,
   * ni ahorro para comer): el tesoro los sostiene mientras alcance. Sin red,
   * un hogar de solo jubilados o parados de larga duración se moriría de
   * hambre sin más remedio que emigrar — con pensión, aguanta. */
  payPensions(needyHomes: string[]): void {
    if (needyHomes.length === 0) return;
    const perHome = Math.min(PENSION_PER_DAY, this.treasury / needyHomes.length);
    if (perHome <= 0) return;
    for (const k of needyHomes) {
      this.wallets.set(k, (this.wallets.get(k) ?? 0) + perHome);
      this.treasury -= perHome;
      this.pensionsPaid += perHome;
    }
  }

  /** Gasta hasta `amount` del hogar; devuelve lo realmente gastado. */
  spend(homeKey: string, amount: number): number {
    const w = this.wallets.get(homeKey) ?? 0;
    const spent = Math.min(w, amount);
    this.wallets.set(homeKey, w - spent);
    this.moneySpent += spent;
    return spent;
  }

  walletOf(homeKey: string): number {
    return this.wallets.get(homeKey) ?? 0;
  }

  prestigeOf(homeKey: string): number {
    return this.prestige.get(homeKey) ?? 0;
  }

  /**
   * Cierre del día (estatus, ciclo 9): los hogares con ahorro de sobra
   * invierten en su vivienda — sumidero de dinero que sube su prestigio
   * hasta llenarlo. Ordenado por clave para que el resultado sea
   * determinista si dos hogares compiten (no compiten por nada compartido,
   * pero el orden de iteración de un Map tras deserializar puede variar).
   */
  investInHomes(homeKeys: Iterable<string>): void {
    for (const k of [...homeKeys].sort()) {
      if (this.prestigeOf(k) >= 1) continue;
      if (this.walletOf(k) < PRESTIGE_SAVE_THRESHOLD) continue;
      this.spend(k, PRESTIGE_INVEST_COST);
      this.prestige.set(k, Math.min(1, this.prestigeOf(k) + PRESTIGE_STEP));
      this.prestigeInvested += PRESTIGE_INVEST_COST;
    }
  }
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
        // Empleos de tier alto piden estudios (lógica de educación).
        if (w.building.data.tier >= 3 && c.education < 0.5) continue;
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

  /** Los granjeros en faena llenan el granero; se recuerda quién produjo
   * (por hogar) para que la liquidación de fin de día le pague su parte. */
  produceFood(farmerHomeKey: string, hours: number): void {
    this.granary += FOOD_PER_FARMER_HOUR * hours;
    this.farmerHoursToday.set(farmerHomeKey, (this.farmerHoursToday.get(farmerHomeKey) ?? 0) + hours);
  }

  /** Compra hasta `want` unidades EN UNA TIENDA, pagándolas del hogar. Limitan
   * DOS cosas reales: el stock del granero y el dinero del hogar. El importe
   * entra en la caja de la tienda (no se esfuma): de ahí sale el pago al
   * mayorista y el impuesto de sociedades en `settleShops()`. */
  buyFood(shopKey: string, homeKey: string, want: number): number {
    const affordable = Math.floor(this.walletOf(homeKey) / FOOD_PRICE);
    const got = Math.min(this.granary, want, affordable);
    if (got <= 0) return 0;
    this.granary -= got;
    this.foodSold += got;
    this.spend(homeKey, got * FOOD_PRICE);
    this.tills.set(shopKey, (this.tills.get(shopKey) ?? 0) + got * FOOD_PRICE);
    this.foodSoldTodayByShop.set(shopKey, (this.foodSoldTodayByShop.get(shopKey) ?? 0) + got);
    return got;
  }

  tillOf(shopKey: string): number {
    return this.tills.get(shopKey) ?? 0;
  }

  /**
   * Liquidación diaria de la economía circular: cada tienda paga al mayorista
   * (repartido entre los hogares granjeros según horas trabajadas HOY — así
   * el dinero vuelve a quien produjo, no al aire) y tributa parte de su
   * margen. Sin esto el dinero de la compra de comida se esfumaba en
   * `spend()`; con esto circula: ciudadano → tienda → granjero → tesoro.
   */
  settleShops(): void {
    const farmPool = new Map<string, number>(); // homeKey -> bonus a repartir
    for (const [shopKey, unitsSold] of this.foodSoldTodayByShop) {
      const wholesaleCost = unitsSold * WHOLESALE_FOOD_PRICE;
      const till = this.tillOf(shopKey);
      const paid = Math.min(till, wholesaleCost);
      this.tills.set(shopKey, till - paid);
      this.wholesalePaid += paid;
      // El mayorista paga a los hogares granjeros de HOY, a prorrata de horas.
      const totalHours = [...this.farmerHoursToday.values()].reduce((a, b) => a + b, 0);
      if (totalHours > 0 && paid > 0) {
        for (const [homeKey, hours] of this.farmerHoursToday) {
          farmPool.set(homeKey, (farmPool.get(homeKey) ?? 0) + (paid * hours) / totalHours);
        }
      }
      // Impuesto de sociedades sobre el margen del día (ventas - mayorista).
      const revenue = unitsSold * FOOD_PRICE;
      const margin = Math.max(0, revenue - wholesaleCost);
      const corpTax = Math.min(this.tillOf(shopKey), margin * CORP_TAX_RATE);
      this.tills.set(shopKey, this.tillOf(shopKey) - corpTax);
      this.treasury += corpTax;
      this.corpTaxCollected += corpTax;
    }
    for (const [homeKey, bonus] of farmPool) {
      this.wallets.set(homeKey, (this.wallets.get(homeKey) ?? 0) + bonus);
    }
    this.foodSoldTodayByShop.clear();
    this.farmerHoursToday.clear();
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
    this.settleShops();
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
