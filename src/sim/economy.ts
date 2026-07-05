/**
 * Economía viva (T3.8), sin dinero explícito todavía:
 * - Los empleos son puestos REALES: cada edificio con `jobs` del catálogo
 *   tiene N sillas; un puesto pertenece a UN ciudadano.
 * - Asignación por cercanía al hogar modulada por personalidad (trabajador
 *   acepta ir más lejos). Se re-evalúa a diario para nuevos parados/edificios.
 * - Las tiendas cuentan clientes por día: `prosperity` [0,1] alimentará el
 *   crecimiento (Fase 4) y el feedback visual (Sonnet: campos por franjas).
 */
import { Citizen, PlaceRef, jobFitsVocation } from './citizens/citizen';
import { WorldIndex, SimBuilding } from './worldIndex';
import { manhattan } from './geometry';
import { ADULT_AGE } from './lifecycle';

export interface Workplace {
  building: SimBuilding;
  /** ids de ciudadanos empleados (≤ jobs). */
  workers: number[];
}

/** Producción de comida por granjero y hora trabajada (lógica de alimento).
 * Subido de 4 a 7 (ciclo 40): con la cosecha estacional (ciclo 39) el verano
 * ahora produce SUPERÁVIT que llena el granero, y el invierno tira de él → el
 * colchón comunal por fin FUNCIONA (gestión de reservas emergente). Es neutral
 * para el dinero: el ingreso del granjero va con lo VENDIDO (acotado por el
 * consumo), no con lo producido, así que el excedente solo llena la despensa. */
export const FOOD_PER_FARMER_HOUR = 7;
/** Estacionalidad de la cosecha (ciclo 39): el campo no rinde igual todo el año.
 * La producción escala con la calidez estacional [-1,1] → el invierno rinde poco
 * (factor 1−swing) y el verano mucho (1+swing). Así el GRANERO (colchón comunal)
 * por fin IMPORTA: hay que acumular en verano para pasar el invierno, como en un
 * pueblo real. Acopla clima↔alimento. Moderado, para no matar de hambre. */
export const SEASON_YIELD_SWING = 0.5;

// --- Lógica de dinero (ciclo 2 de RESEARCH.md) --------------------------------
/** Salario base por hora trabajada; los tiers altos pagan más. */
export const WAGE_PER_HOUR = 10;
export const WAGE_TIER_BONUS = 4; // por nivel de tier del empleador
/** Retorno a la educación (ciclo 28): un trabajador plenamente cualificado
 * (education 1) cobra este % más que uno sin estudios — desigualdad realista y
 * la educación por fin PAGA (además de abrir empleos de tier alto). */
export const WAGE_SKILL_BONUS = 0.6;
/** Alquiler diario por familia (ciclo 29): el mayor gasto real de un hogar.
 * Escala con el tier de la vivienda (una casa mejor cuesta más). Soaks el
 * exceso de ahorro (el dinero pasa a importar) y circula vía el tesoro. */
export const RENT_PER_DAY = 35;
export const RENT_TIER_FACTOR = 0.5;
/** Precio de la unidad de comida. */
export const FOOD_PRICE = 2;
/** Gasto de capricho al ir de compras (si el hogar puede permitírselo). */
export const SHOP_TREAT_PRICE = 5;
/** Con qué llega una familia inmigrante. */
export const STARTING_MONEY = 60;

// --- Rotación vocacional (ciclo 41) -------------------------------------------
/** Al buscar empleo, un puesto que COLMA la vocación "pesa" la mitad de distancia:
 * la gente gravita a su llamada. El ciclo 37 probó este descuento SOLO y fue un
 * no-op (en un mercado escaso, con una sola vacante viable, preferir no cambia la
 * elección); la clave es aplicarlo a quien acaba de DEJAR su puesto para buscar el
 * suyo (churn) — entonces sí mueve. Por eso solo se aplica a los `vocationSeekers`. */
export const VOCATION_COMMUTE_DISCOUNT = 0.5;

// --- Lógica de bienes (ciclo 31): consumo discrecional que CIRCULA -------------
// El segundo bien tras el alimento. Antes el "capricho" gastaba 5 fijos que se
// ESFUMABAN (leak: spend() sin destino). Ahora es un gasto en bienes duraderos
// PROPORCIONAL al excedente del hogar (el rico consume más — desigualdad y
// sumidero del ahorro ocioso que el alquiler no llega a drenar) y CONSERVADO: va
// a la caja del comercio (su margen) y al tesoro (IVA) — circula, no desaparece.
/** Ahorro por debajo del cual no hay caprichos (primero se cubre lo básico). */
export const GOODS_COMFORT_FLOOR = 40;
/** Fracción del excedente (ahorro − suelo) que se gasta en bienes por visita. */
export const GOODS_PROPENSITY = 0.12;
/** Tope de gasto en bienes por visita (un capricho no vacía la cuenta). */
export const GOODS_MAX_SPEND = 30;
/** IVA de los bienes: la parte del gasto que va al tesoro (el resto financia la
 * importación del bien y sale del pueblo — sumidero que equilibra la nómina). */
export const GOODS_SALES_TAX = 0.15;

// --- Lógica de coste de la vida (ciclo 32): el cierre monetario, del lado del gasto
// La nómina ACUÑA dinero (payWage), así que sin un sumidero que escale con el
// ingreso el ahorro trepa sin fin (los hogares se hacen infinitamente ricos —
// irreal). El coste de la vida escala con la RIQUEZA (lifestyle inflation, muy
// real: quien más tiene, más gasta en servicios, ocio y mantenimiento). Drena una
// fracción del ahorro EXCEDENTE cada día → el ahorro se ESTABILIZA en una meseta
// (equilibrio: ingreso = gasto). Parte va al tesoro (servicios locales) y el resto
// SALE del pueblo (ocio/servicios de fuera) — el sumidero que equilibra la acuñación.
/** Colchón de ahorro por debajo del cual no hay coste de vida (se protege al pobre). */
export const LIFESTYLE_COMFORT = 90;
/** Fracción del ahorro EXCEDENTE (sobre el colchón) que se gasta en vivir, al día. */
export const LIFESTYLE_DRAIN = 0.14;
/** Parte del coste de vida que queda en el pueblo (tesoro); el resto sale fuera. */
export const LIFESTYLE_LOCAL_SHARE = 0.3;
/** El tesoro no ATESORA sin fin (ciclo 32): guarda una reserva prudente por
 * habitante y GASTA el superávit en la ciudadanía (obra pública / dividendo) →
 * el dinero público circula de vuelta en vez de piramidarse. Reserva por cabeza: */
export const TREASURY_RESERVE_PER_CAPITA = 300;
/** Fracción del superávit del tesoro que se reparte cada día (flujo suave). */
export const DIVIDEND_RATE = 0.25;

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
  /** Gasto total en bienes discrecionales (ciclo 31 — métrica tests/crónica). */
  goodsSold = 0;
  /** Parte de ese gasto que salió del pueblo (importaciones — sumidero). */
  goodsImported = 0;
  /** Coste de vida total drenado (ciclo 32 — métrica tests/crónica). */
  lifestyleSpent = 0;
  /** Parte del coste de vida que salió del pueblo (sumidero que equilibra la nómina). */
  lifestyleLeft = 0;
  /** Superavit del tesoro repartido a la ciudadania (ciclo 32 - metrica). */
  dividendPaid = 0;
  /** Nómina pública pagada del tesoro, no acuñada (ciclo 37bis — cierre parcial). */
  wagesFromTreasury = 0;

  /** Nómina: el trabajo mete dinero en el hogar del trabajador, menos la
   * parte que va al tesoro municipal (impuesto sobre la renta, lógica de
   * gobierno). El tesoro es lo que luego paga pensiones.
   *
   * Cierre parcial (ciclo 37bis): el sector PÚBLICO (empleos 'civic': escuela,
   * clínica) se paga del TESORO, no se acuña — nómina FINITA como en la realidad,
   * y da uso al tesoro que atesoraba (ciclo 32). Cuando el tesoro cubre el bruto,
   * ese salario crea CERO dinero nuevo (transferencia pública). Si el tesoro no
   * llega, se acuña el resto (fallback: nadie se queda sin cobrar → sin colapso).
   * Los demás sectores (agro, comercio, oficio) se siguen acuñando: cerrarlos del
   * todo (tiendas de su caja, etc.) es el gran pendiente. */
  payWage(homeKey: string, hours: number, employerTier: number, skill = 0, employerRole?: string): void {
    const skillMult = 1 + WAGE_SKILL_BONUS * Math.min(1, Math.max(0, skill));
    const gross = (WAGE_PER_HOUR + WAGE_TIER_BONUS * employerTier) * skillMult * hours;
    const tax = gross * TAX_RATE;
    const net = gross - tax;
    if (employerRole === 'civic') {
      const fromTreasury = Math.min(Math.max(0, this.treasury), gross);
      this.treasury -= fromTreasury; // el erario paga a sus empleados (no se acuña)
      this.wagesFromTreasury += fromTreasury;
    }
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

  /** Ofrece empleo a los parados. Determinista: orden por id. Los
   * `vocationSeekers` (quienes dejaron su puesto para buscar el suyo, ciclo 41)
   * ven descontada la distancia a los empleos que colman su vocación → gravitan
   * a su llamada; el resto se coloca como siempre (asignación intacta). */
  assignJobs(
    citizens: Map<number, Citizen>,
    vocationSeekers?: ReadonlySet<number>,
  ): Array<{ citizen: number; work: PlaceRef }> {
    const hires: Array<{ citizen: number; work: PlaceRef }> = [];
    const unemployed = [...citizens.values()]
      .filter((c) => !c.work && c.age >= ADULT_AGE)
      .sort((a, b) => a.id - b.id);
    for (const c of unemployed) {
      const prefersVocation = vocationSeekers?.has(c.id) ?? false;
      let best: Workplace | null = null;
      let bestEff = Infinity; // distancia EFECTIVA (con descuento vocacional)
      let bestD = Infinity; // distancia REAL (para el umbral de desplazamiento)
      for (const w of this.workplaces) {
        const jobs = w.building.data.jobs ?? 0;
        if (w.workers.length >= jobs || !w.building.entrance) continue;
        // Empleos de tier alto piden estudios (lógica de educación).
        if (w.building.data.tier >= 3 && c.education < 0.5) continue;
        const d = manhattan([c.home.ax, c.home.az], w.building.entrance);
        const eff =
          prefersVocation && jobFitsVocation(c.personality, w.building.data.role)
            ? d * VOCATION_COMMUTE_DISCOUNT
            : d;
        if (eff < bestEff) {
          bestEff = eff;
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

  /** ¿Existe una vacante que COLMA la vocación de `c`, a su alcance y ESTRICTAMENTE
   * mejor (con descuento) que su puesto actual? Solo entonces dejar el empleo es
   * productivo (churn con destino, no paro). Puro; no muta nada. (Ciclo 41.) */
  hasVocationVacancy(c: Citizen): boolean {
    if (!c.work) return false;
    const curD = manhattan([c.home.ax, c.home.az], [c.work.ax, c.work.az]);
    const maxCommute = 40 + 120 * c.personality.trabajador;
    for (const w of this.workplaces) {
      const jobs = w.building.data.jobs ?? 0;
      if (w.workers.length >= jobs || !w.building.entrance) continue;
      if (w.building.data.tier >= 3 && c.education < 0.5) continue;
      if (!jobFitsVocation(c.personality, w.building.data.role)) continue;
      const d = manhattan([c.home.ax, c.home.az], w.building.entrance);
      if (d > maxCommute) continue;
      if (d * VOCATION_COMMUTE_DISCOUNT < curD) return true;
    }
    return false;
  }

  /** Un ciudadano DEJA su puesto: libera su silla y queda parado (ciclo 41). */
  vacate(c: Citizen): void {
    if (!c.work) return;
    const k = `${c.work.ax},${c.work.az}`;
    const w = this.workplaces.find((wp) => `${wp.building.ax},${wp.building.az}` === k);
    if (w) {
      const i = w.workers.indexOf(c.id);
      if (i >= 0) w.workers.splice(i, 1);
    }
    c.work = null;
  }

  /** Un ciudadano entra a comprar: cuenta para la prosperidad de la tienda. */
  registerVisit(place: PlaceRef): void {
    const k = `${place.ax},${place.az}`;
    this.visitsToday.set(k, (this.visitsToday.get(k) ?? 0) + 1);
  }

  /** Los granjeros en faena llenan el granero; se recuerda quién produjo
   * (por hogar) para que la liquidación de fin de día le pague su parte. */
  produceFood(farmerHomeKey: string, hours: number, yieldFactor = 1): void {
    this.granary += FOOD_PER_FARMER_HOUR * hours * yieldFactor;
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

  /** Compra de BIENES discrecionales (ciclo 31): un hogar con excedente se da un
   * capricho en durables, PROPORCIONAL a lo que le sobra (el rico consume más →
   * desigualdad y sumidero del ahorro ocioso que el alquiler no drena). Sustituye
   * al viejo capricho de 5 fijos que se esfumaba. El IVA va al tesoro (→ circula
   * a pensiones); el resto paga bienes IMPORTADOS de fuera del pueblo, así que
   * SALE de la economía local — un sumidero REALISTA (las importaciones) que
   * equilibra la nómina, que "acuña" dinero de la nada. Un ciclo futuro los
   * producirá dentro (artesanos) y ese dinero se quedará. Devuelve lo gastado. */
  buyGoods(homeKey: string): number {
    const surplus = this.walletOf(homeKey) - GOODS_COMFORT_FLOOR;
    if (surplus <= 0) return 0;
    const want = Math.min(GOODS_MAX_SPEND, surplus * GOODS_PROPENSITY);
    const spent = this.spend(homeKey, want);
    if (spent <= 0) return 0;
    const tax = spent * GOODS_SALES_TAX;
    this.treasury += tax;
    this.taxesCollected += tax;
    this.goodsImported += spent - tax; // sale del pueblo (importación) — sumidero
    this.goodsSold += spent;
    return spent;
  }

  /** Coste de la vida (ciclo 32): un hogar gasta en vivir (servicios, ocio,
   * mantenimiento) una fracción de su ahorro EXCEDENTE — cuanto más tiene, más
   * gasta (lifestyle inflation). Es el SUMIDERO que faltaba para cerrar la
   * economía: sin él el ahorro trepa sin fin porque la nómina acuña dinero. Parte
   * queda en el pueblo (tesoro, servicios locales) y el resto SALE (ocio de
   * fuera), equilibrando la acuñación. Protege un colchón. Devuelve lo gastado. */
  spendLifestyle(homeKey: string): number {
    const excess = this.walletOf(homeKey) - LIFESTYLE_COMFORT;
    if (excess <= 0) return 0;
    const spent = this.spend(homeKey, excess * LIFESTYLE_DRAIN);
    if (spent <= 0) return 0;
    const local = spent * LIFESTYLE_LOCAL_SHARE;
    this.treasury += local;
    this.taxesCollected += local;
    this.lifestyleLeft += spent - local; // sale del pueblo — sumidero
    this.lifestyleSpent += spent;
    return spent;
  }

  /** Dividendo público (ciclo 32): el tesoro guarda una reserva prudente (por
   * habitante) y REPARTE parte del superávit entre los hogares (obra pública que
   * revierte, dividendo ciudadano) — así el dinero público CIRCULA de vuelta en
   * vez de piramidarse en las arcas. Flujo suave (una fracción al día). Devuelve
   * lo repartido. Determinista (reparto por igual, orden no importa). */
  payPublicDividend(homeKeys: string[], population: number): number {
    const reserve = TREASURY_RESERVE_PER_CAPITA * population;
    const surplus = this.treasury - reserve;
    if (surplus <= 0 || homeKeys.length === 0) return 0;
    const shared = surplus * DIVIDEND_RATE;
    const per = shared / homeKeys.length;
    for (const k of homeKeys) this.wallets.set(k, (this.wallets.get(k) ?? 0) + per);
    this.treasury -= shared;
    this.dividendPaid += shared;
    return shared;
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
