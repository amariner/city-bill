/**
 * Crecimiento autónomo de la ciudad (T4.1-T4.2, LÓGICA pura — sin THREE).
 * Corre dentro de la sim (worker): la demanda sale del estado REAL
 * (empleo, vivienda, prosperidad de tiendas), nunca de un guion.
 *
 * Reglas estéticas (§5 del ROADMAP): los edificios nacen JUNTO a una vía,
 * mirando hacia ella, con 1 celda de retranqueo, y cerca del centro del
 * pueblo (compacidad). El resultado debe parecer un pueblo, no un vertido.
 *
 * El worker aplica la colocación a SU grid y emite un `gridPatch`; el main
 * aplica ese diff al grid de render sin repetir ninguna decisión.
 */
import { Grid, Rot, rotatedFootprint, cellKey, cellFromKey } from './grid';
import { catalogData, CATALOG_DATA, SimRole, Tier } from './catalogData';
import { hashCoord01, createRng } from '../rng';
import { placementCheck } from './placement';
import { extendRoad as paintRoadExtension } from './roads';
import type { SimBuilding } from '../sim/worldIndex';
import type { GrowthPolicy, ZoneKind } from '../sim/protocol';

export interface GrowthPlacement {
  id: string;
  cx: number;
  cz: number;
  rot: Rot;
}

export interface FindParcelOptions {
  searchRadius?: number;
  /** Filtro administrativo opcional (p.ej. una política de distrito). */
  allow?: (cx: number, cz: number) => boolean;
  /** Ajuste determinista de prioridad: negativo = parcela preferida. */
  scoreAdjustment?: (cx: number, cz: number) => number;
}

export interface DemandInput {
  population: number;
  employed: number;
  /** Puestos totales existentes. */
  jobs: number;
  /** Huecos de familia libres en viviendas. */
  freeHousing: number;
  /** Nº de comercios y su prosperidad media [0,1]. */
  shops: number;
  avgProsperity: number;
  /** Tier desbloqueado (T4.5; por ahora fijo 1). */
  tier: Tier;
  /** Niños en edad escolar y plazas de alumno existentes (educación). */
  children: number;
  studentSlots: number;
  /** Salud media de la población y si ya existe consultorio (ciclo 5). */
  avgHealth: number;
  hasClinic: boolean;
  /** Población TOTAL (no solo adultos) y su techo (ciclo 30): por encima del
   * techo el pueblo ya no atrae forasteros (la inmigración se corta; el
   * crecimiento vegetativo sigue hasta que la natalidad se satura). */
  totalPopulation: number;
  carryingCapacity: number;
  /** Cobertura pública para activar demandas de policía/bomberos/parques. */
  policeCoverage?: number;
  fireCoverage?: number;
  parkCoverage?: number;
  /** Felicidad media diaria, para descubrir la falta de parques. */
  avgHappiness?: number;
}

/** Demanda continua que alimenta la lectura RCI de la interfaz. Los tres
 * índices son deliberadamente independientes de `computeDemand`: este último
 * decide UNA obra concreta, mientras estos valores muestran la presión latente
 * de cada sector en [0,1]. */
export interface DemandLevelsInput {
  /** Adultos: son quienes buscan casa, tienda y empleo. */
  population: number;
  employed: number;
  jobs: number;
  freeHousing: number;
  shops: number;
  avgProsperity: number;
  /** Atractividad migratoria [0,1]; si falta, se usa una ciudad neutral. */
  attractiveness?: number;
  /** Población total y techo logístico; opcionales para conservar una API pura. */
  totalPopulation?: number;
  carryingCapacity?: number;
}

export interface DemandLevels {
  R: number;
  C: number;
  I: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** H2.5 — Barras continuas de demanda residencial, comercial e industrial.
 *
 * R sube cuando faltan huecos de vivienda y cuando el pueblo resulta atractivo;
 * C sube cuando hay demasiada población por comercio y la prosperidad confirma
 * que existe consumo; I sube con el desempleo y recibe un pequeño empujón cuando
 * ya no queda ningún puesto libre. Todo queda acotado para que la UI pueda
 * pintar el valor directamente como porcentaje. */
export function demandLevels(d: DemandLevelsInput): DemandLevels {
  const population = Math.max(0, d.population);
  const totalPopulation = Math.max(0, d.totalPopulation ?? population);
  const carryingCapacity = Math.max(1, d.carryingCapacity ?? CARRYING_CAPACITY);
  const attractiveness = clamp01(d.attractiveness ?? 0.5);
  const prosperity = clamp01(d.avgProsperity);
  const housingNeed = 1 - d.freeHousing / Math.max(1, population / 4);
  const capacityPenalty = totalPopulation >= carryingCapacity ? 0.35 : 0;
  const R = clamp01(0.5 * housingNeed + 0.5 * attractiveness - capacityPenalty);

  const commercePressure = d.shops > 0
    ? (population / d.shops - 10) / 10
    : population >= 8 ? 1 : 0;
  // La prosperidad funciona como confirmación, no como interruptor: incluso
  // una tienda modesta puede estar saturada en un pueblo con mucha población.
  const C = clamp01(commercePressure * (0.55 + 0.45 * prosperity));

  const unemployment = population > 0
    ? Math.max(0, 1 - d.employed / population)
    : 0;
  const openJobs = d.jobs - d.employed;
  const I = clamp01(unemployment / 0.35 + (openJobs <= 0 ? 0.3 : 0));
  return { R, C, I };
}

export type DemandKind = 'residential' | 'commerce' | 'work' | 'school' | 'clinic' | 'police' | 'fire' | 'park' | null;

/** H4.5 — Progreso urbano visible. Los umbrales viven junto al catálogo y la
 * demanda, no escondidos en el cierre diario de la simulación: así el render,
 * la Crónica y las pruebas comparten una única escalera aldea→Zlín. */
export function tierForPopulation(population: number): Tier {
  if (population >= 200) return 4;
  if (population >= 80) return 3;
  if (population >= 25) return 2;
  return 1;
}

/** Zona natural de cada rol de catálogo. Las zonas solo orientan el crecimiento;
 * el jugador sigue pudiendo colocar manualmente cualquier edificio válido. */
export function zoneForRole(role: SimRole): ZoneKind | null {
  switch (role) {
    case 'residential': return 'R';
    case 'commerce': return 'C';
    case 'work': return 'I';
    case 'agriculture': return 'A';
    case 'civic':
    case 'park':
    case 'nature': return 'P';
    case 'infra': return 'I';
  }
}

/**
 * T4.1/H7.2 — ¿Qué pide la ciudad AHORA? Devuelve TODAS las demandas vivas en
 * orden de prioridad (escuela > sanidad > seguridad > parque > empleo >
 * vivienda > comercio). La simulación atiende la primera que PUEDE (dinero,
 * parcela, cobertura) en vez de bloquearse en una que no puede: antes, una
 * clínica impagable dejaba 70 días sin levantar una sola casa.
 */
export function computeDemands(d: DemandInput): Array<Exclude<DemandKind, null>> {
  const out: Array<Exclude<DemandKind, null>> = [];
  const openJobs = d.jobs - d.employed;
  const unemployment = d.population > 0 ? (d.population - d.employed) / d.population : 0;
  // Niños sin plaza escolar → escuela (antes que nada: la escuela es sagrada).
  if (d.children > d.studentSlots && d.children >= 3) out.push('school');
  // Salud media baja → clínica reactiva; pero con la mortalidad (ciclo 11) los
  // frágiles MUEREN y la media de los vivos ya no baja, así que un pueblo que
  // crece también se dota de sanidad de forma PROACTIVA (infraestructura
  // pública) — la clínica existe justamente para PREVENIR esas muertes.
  if (!d.hasClinic && d.population >= 10 && (d.avgHealth < 0.88 || d.population >= 20)) out.push('clinic');
  // La infraestructura pública escala con la ciudad. Se mira la cobertura,
  // no solo la existencia nominal: una comisaría aislada no resuelve el mapa.
  if (d.tier >= 2 && d.totalPopulation >= 60 && (d.policeCoverage ?? 1) < 0.5) out.push('police');
  if (d.tier >= 2 && d.totalPopulation >= 80 && (d.fireCoverage ?? 1) < 0.5) out.push('fire');
  // El parque aparece cuando ya hay un barrio que mantener: así una aldea no
  // gasta su primera caja en dos amenidades antes de poder sostener vivienda,
  // empleo y sanidad. La felicidad sigue siendo el disparador, no un guion.
  if (d.tier >= 1 && d.totalPopulation >= 40 && d.avgHappiness !== undefined && d.avgHappiness < 0.5 && (d.parkCoverage ?? 1) < 0.5) out.push('park');
  // Paro alto, o parados sin ninguna vacante → un lugar de trabajo. Se cuenta
  // en PERSONAS, no en tasa: en una aldea de 9 adultos, un solo parado sin
  // vacante (11 %) dejaba a la vez sin demanda de empleo (< 15 %) y sin demanda
  // de vivienda (paro ≥ 10 %) — un punto muerto que congelaba el arranque (H7.2).
  const jobless = d.population - d.employed;
  if (unemployment > 0.35 || (openJobs <= 0 && jobless >= 1)) out.push('work');
  // Gente queriendo venir (hay trabajo, o la ciudad va bien) y sin casas → vivienda.
  // Freno denso-dependiente (ciclo 30): por encima del techo el pueblo ya no
  // tira de forasteros — deja de construir vivienda de inmigración y se aplana.
  if (d.freeHousing <= 0 && d.totalPopulation < d.carryingCapacity && (openJobs >= 1 || unemployment < 0.1)) out.push('residential');
  // Tiendas saturadas (prosperidad alta sostenida) o pueblo sin tienda.
  if (d.shops === 0 && d.population >= 8) out.push('commerce');
  else if (d.shops > 0 && d.avgProsperity > 0.75 && d.population / d.shops > 14) out.push('commerce');
  return out;
}

/** La demanda más urgente (compatibilidad): primera de `computeDemands`. */
export function computeDemand(d: DemandInput): DemandKind {
  return computeDemands(d)[0] ?? null;
}

/** Ítem del catálogo que materializa cada demanda, por tier. Determinista. */
export function itemForDemand(kind: Exclude<DemandKind, null>, tier: Tier, jobless = 0): string {
  const pool = CATALOG_DATA.filter((it) => it.tier <= tier && it.tier > 0);
  const byRole = (roles: string[]) => pool.filter((it) => roles.includes(it.role));
  switch (kind) {
    case 'residential':
      // El de mayor tier disponible ata la densidad al progreso (T4.2 etapas).
      return residentialChoices(tier).at(-1) ?? 'cottage';
    case 'commerce':
      return byRole(['commerce']).sort((a, b) => b.tier - a.tier)[0]?.id ?? 'shop';
    case 'work':
      // Los cívicos con `service` se reservan para sus demandas públicas:
      // cuando faltan puestos no debe aparecer una comisaría como fábrica
      // accidental solo porque comparte el rol `civic`.
      {
        // H7.2: el puesto de trabajo se dimensiona al PARO real. Un parado no
        // justifica una fábrica de 40 puestos: eso multiplicaba la base económica
        // (y con ella el techo poblacional) en cada cierre. Se elige el lugar de
        // trabajo más pequeño que absorbe a los parados; solo con mucho paro
        // aparecen oficinas y fábricas.
        const pool = byRole(['commerce', 'work', 'civic']).filter((it) => !it.students && !it.service)
          .sort((a, b) => (a.jobs ?? 0) - (b.jobs ?? 0) || a.id.localeCompare(b.id));
        return pool.find((it) => (it.jobs ?? 0) >= Math.max(1, jobless))?.id ?? pool.at(-1)?.id ?? 'shop';
      }
    case 'school':
      return 'school';
    case 'clinic':
      return 'clinic';
    case 'police':
      return 'police';
    case 'fire':
      return 'fire-station';
    case 'park':
      return 'park';
  }
}

/** Opciones residenciales disponibles para crecimiento autónomo. Mantener esta
 * lista separada hace explícito el guardarraíl: nunca ofrece una huella de tier
 * futuro aunque la demanda ya esté activa. */
export function residentialChoices(tier: Tier): string[] {
  const order = ['farmhouse', 'cottage', 'town-house', 'row-houses', 'low-block', 'apartment-slab', 'brick-block'];
  const rank = new Map(order.map((id, index) => [id, index]));
  return CATALOG_DATA
    .filter((item) => item.role === 'residential' && item.tier > 0 && item.tier <= tier)
    .sort((a, b) => a.tier - b.tier || (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || a.id.localeCompare(b.id))
    .map((item) => item.id);
}

/**
 * Elige una tipología VISIBLE que cabe dentro de la parcela estructural. La
 * vivienda lógica (capacidad, acceso y pathfinding) conserva su `id`; la
 * fachada aporta la mezcla de alturas/volúmenes del pueblo sin alterar la
 * simulación. La semilla deriva solo de mundo y coordenada: no consume RNG de
 * ciudadanos ni cambia al guardar/cargar.
 */
export function residentialVisualId(id: string, cx: number, cz: number, rot: Rot, seed: number): string {
  const structural = catalogData(id);
  if (!structural || structural.role !== 'residential') return id;
  const [fw, fd] = rotatedFootprint(structural.w, structural.d, rot);
  const choices = CATALOG_DATA
    .filter((item) => {
      if (item.role !== 'residential' || item.tier > structural.tier) return false;
      const [vw, vd] = rotatedFootprint(item.w, item.d, rot);
      return vw <= fw && vd <= fd;
    })
    .sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));
  if (choices.length < 2) return id;
  const rng = createRng((seed ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(rot + 1, 83492791)) | 0);
  const weights = choices.map((item) => item.id === id ? 0.5 : Math.pow(0.7, structural.tier - item.tier));
  let roll = rng.next() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < choices.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return choices[i].id;
  }
  return choices.at(-1)?.id ?? id;
}

/** Escalera de densificación. Los escalones que ensanchan la parcela usan la
 * validación de reparcelación de `upgradeCandidate`: solo prosperan si queda
 * suelo libre alrededor, sin desplazar ni pisar vecinos. */
export const DENSITY_LADDER = [
  'cottage',
  'town-house',
  'row-houses',
  'low-block',
  'apartment-slab',
  'brick-block',
] as const;
export const UPGRADE_LAND_VALUE = 0.6;

/** H4.5 — Busca el siguiente peldaño residencial, manteniendo ancla y giro.
 * La validación ignora únicamente la huella del edificio actual: el resto del
 * margen sigue protegiendo vecinos, agua y vías. */
export function upgradeCandidate(
  grid: Grid,
  building: SimBuilding,
  tier: Tier,
  landValue: number,
): GrowthPlacement | null {
  if (!Number.isFinite(landValue) || landValue < UPGRADE_LAND_VALUE) return null;
  const currentIndex = DENSITY_LADDER.indexOf(building.id as (typeof DENSITY_LADDER)[number]);
  if (currentIndex < 0 || currentIndex >= DENSITY_LADDER.length - 1) return null;
  const nextId = DENSITY_LADDER[currentIndex + 1];
  const next = catalogData(nextId);
  if (!next || next.tier > tier) return null;
  const current = grid.get(building.ax, building.az)?.building;
  if (!current || current.anchorX !== building.ax || current.anchorZ !== building.az) return null;
  const [currentW, currentD] = rotatedFootprint(building.data.w, building.data.d, building.rot);
  const reason = placementCheck(grid, next.w, next.d, building.ax, building.az, building.rot, {
    margin: 1,
    allowPath: true,
    ignoreFootprint: { cx: building.ax, cz: building.az, w: building.data.w, d: building.data.d, rot: building.rot },
  });
  if (reason || current.fw !== undefined && current.fd !== undefined && (current.fw !== currentW || current.fd !== currentD)) return null;
  return { id: nextId, cx: building.ax, cz: building.az, rot: building.rot };
}

/**
 * Ciclo 12 — ATRACTIVIDAD migratoria [0.5,1] (acoplamiento prestigio→inmigración,
 * avanza T4.3). Cuánta gente ATRAE la ciudad cuando abre una vivienda nueva:
 * una ciudad próspera, sana, con empleo y buena FAMA (prestigio de sus hogares,
 * ciclo 9) llena las casas; una que se las arregla mal las deja a medias, y la
 * población deja de ser un caudal fijo para volverse consecuencia de la calidad
 * de vida. Base alta a propósito: el prestigio se GANA con el tiempo (empieza en
 * 0), así que no debe asfixiar el arranque — solo lo empuja hacia arriba cuando
 * el pueblo ya prospera, y lo frena cuando va mal (paro, hambre, enfermedad).
 */
export function townAttractiveness(a: {
  employment: number;
  avgHealth: number;
  avgFood: number;
  avgPrestige: number;
  /** Felicidad media; opcional para no alterar sondas antiguas. */
  avgHappiness?: number;
  /** Carga fiscal ponderada; solo la parte sobre el 20 % reduce la llegada. */
  taxBurden?: number;
  /** Una quiebra municipal resta atractivo, pero no detiene la vida. */
  bankrupt?: boolean;
  /** Una estación conectada acerca la ciudad al exterior (H5.6). */
  railService?: boolean;
}): number {
  // El prestigio sigue impulsando la llegada, pero con peso moderado: la
  // política fiscal puede mover el ahorro y, por tanto, el prestigio. Un peso
  // más alto convierte ese canal en una realimentación migratoria explosiva.
  const happiness = clamp01(a.avgHappiness ?? 0.5);
  const raw = 0.45 + 0.2 * a.employment + 0.15 * a.avgHealth + 0.1 * a.avgFood + 0.2 * a.avgPrestige + 0.15 * (happiness - 0.5);
  const burden = Math.max(0, a.taxBurden ?? 0);
  const taxFactor = 1 - 0.6 * Math.max(0, burden - 0.2);
  const bankruptcyPenalty = a.bankrupt ? 0.15 : 0;
  const railBonus = a.railService ? 0.1 : 0;
  return Math.min(1, Math.max(0.5, raw * taxFactor - bankruptcyPenalty + railBonus));
}

// --- Capacidad de carga (ciclo 30 — crecimiento logístico, no exponencial) ----
// Sin esto el pueblo crecía en RETROALIMENTACIÓN POSITIVA sin freno (casa nueva →
// familia → empleo → prosperidad → más casas…): explotaba, y de forma CAÓTICA
// (misma sim, día 40: de 22 a 353 hab. según la semilla — 16×). En la realidad
// el crecimiento tiene freno DENSO-DEPENDIENTE: al llenarse el pueblo la
// oportunidad por cabeza se satura, el suelo escasea y tanto la INMIGRACIÓN como
// la NATALIDAD (coste de la vida, vivienda cara — transición demográfica) caen.
// Modelado como negativa fuerte hacia una capacidad de carga K: el resultado es
// una S logística estable y CONSISTENTE entre semillas, no una exponencial que
// revienta. K es fijo de momento (un pueblo); un ciclo futuro lo atará a la BASE
// ECONÓMICA (empleos/servicios) para que la ciudad pueda tender a §5 (10.000) a
// medida que su infraestructura crece — no de golpe.
/** Techo poblacional hacia el que se estabiliza el pueblo (media saturación de
 * la natalidad e inmigración cortada por encima). */
export const CARRYING_CAPACITY = 120;
/** Techo poblacional por tier alcanzado (T0/T1 aldea … T4 ciudad Zlín). */
export const CARRYING_CAPACITY_BY_TIER: Record<Tier, number> = { 0: 120, 1: 120, 2: 160, 3: 260, 4: 400 };

/** H7.2 — K por ESCALONES: el techo clásico de 120 para la aldea y, con cada tier
 * desbloqueado (25/80/200 hab.), una meseta más alta que queda por encima del
 * umbral siguiente, de modo que aldea → pueblo → villa → ciudad se encadena como
 * una logística escalonada y acotada (meseta final: 400). Se descartaron K atados
 * a la vivienda (243 hab. en 20 días) y al empleo (728 en 60): ambos realimentan
 * sin freno porque vivienda y empleo crecen con la propia población. Pura. */
export function carryingCapacityFor(tier: Tier): number {
  return CARRYING_CAPACITY_BY_TIER[tier] ?? CARRYING_CAPACITY;
}

/** Factor de natalidad por saturación [0,1]: 1 con el pueblo vacío, baja lineal
 * y llega a 0 en K (la vida se encarece, se tienen menos hijos). Pura. */
export function fertilityFactor(population: number, capacity = CARRYING_CAPACITY): number {
  return Math.max(0, Math.min(1, 1 - population / capacity));
}

// --- Emigración digna (ciclo 14 — cierra T4.3, honra RESEARCH.md §6.2) --------
// La otra mitad de la migración: quien no encuentra sustento en el pueblo,
// tras AGUANTAR unos años, se marcha andando por la carretera (no se despawnea
// en silencio: se le ve salir y se narra en la Crónica). Con histéresis fuerte:
// hace falta penuria SOSTENIDA, y el pueblo se recupera antes de que nadie huya
// si las cosas mejoran. Un pueblo diminuto NO se disuelve (suelo de población).
/** Por debajo de esta población nadie emigra (un caserío no se despuebla solo). */
export const EMIGRATE_POP_FLOOR = 12;
/** Años de penuria sostenida antes de hacer las maletas. Bajo a propósito: la
 * gente se va ANTES de morir de hambre (el ciclo 11 mataría en ~5 años), no
 * después — emigrar es huir de la miseria, no su desenlace. */
export const EMIGRATE_PRESSURE_LIMIT = 3;
/** Ahorro del hogar por debajo del cual no hay colchón (penuria económica). */
export const EMIGRATE_SUBSISTENCE = 6;

/** ¿Vive este hogar una penuria real ESTE año? Desesperanza ECONÓMICA: tiene
 * adultos en edad de trabajar, NINGUNO tiene empleo y no hay colchón de ahorro
 * — no pueden ganarse la vida aquí. Los jubilados NO cuentan (su hogar se
 * sostiene con la pensión, ciclo 3, no emigra a buscar trabajo); la clave es la
 * FALTA DE SUSTENTO, no el hambre ya consumada: se emigra para no llegar a ella.
 * Pura y determinista. */
export function householdHardship(a: {
  workingAdults: number;
  employed: number;
  wallet: number;
}): boolean {
  return a.workingAdults > 0 && a.employed === 0 && a.wallet < EMIGRATE_SUBSISTENCE;
}

/** Actualiza la presión migratoria de un hogar: sube 1 por año de penuria, baja
 * 2 por año bueno (la esperanza se recupera antes que se pierde). Acotada. */
export function updateEmigrationPressure(prev: number, hardship: boolean): number {
  const next = hardship ? prev + 1 : prev - 2;
  return Math.max(0, Math.min(EMIGRATE_PRESSURE_LIMIT + 1, next));
}

/**
 * T4.2 — Busca parcela: celda con footprint libre, RETRANQUEADA 1 celda de una
 * vía (road/path), fachada hacia ella, y lo más cerca posible del centro de
 * masa de lo ya construido. Devuelve null si no hay sitio servible.
 */
export function findParcel(
  grid: Grid,
  itemId: string,
  center: [number, number],
  seed: number,
  policy: GrowthPolicy = 'free',
  options: number | FindParcelOptions = 60,
): GrowthPlacement | null {
  const it = catalogData(itemId);
  if (!it) return null;
  const searchRadius = typeof options === 'number' ? options : options.searchRadius ?? 60;
  const allow = typeof options === 'number' ? undefined : options.allow;
  const scoreAdjustment = typeof options === 'number' ? undefined : options.scoreAdjustment;
  const [ccx, ccz] = center;

  let best: GrowthPlacement | null = null;
  let bestScore = Infinity;
  let bestDist = Infinity;
  let bestIsZoned = false;
  const requiredZone = zoneForRole(it.role);

  // Muestreo determinista de celdas de vía alrededor del centro.
  for (let r = 2; r <= searchRadius; r += 1) {
    // Anillo cuadrado de radio r (barato y determinista).
    for (let i = -r; i <= r; i++) {
      for (const [cx, cz] of [
        [ccx + i, ccz - r],
        [ccx + i, ccz + r],
        [ccx - r, ccz + i],
        [ccx + r, ccz + i],
      ] as Array<[number, number]>) {
        const cell = grid.get(cx, cz);
        if (!cell || (cell.terrain !== 'road' && cell.terrain !== 'path')) continue;
        // Prueba las 4 orientaciones: edificio al lado de la vía, mirándola.
        // rot: 0=+Z (frente a sur)… la fachada debe quedar hacia la vía.
        const tries: Array<{ dx: number; dz: number; rot: Rot }> = [
          { dx: 0, dz: 2, rot: 2 }, // vía al norte del edificio → mira -Z
          { dx: 0, dz: -1 - it.d, rot: 0 }, // vía al sur → mira +Z
          { dx: 2, dz: 0, rot: 1 }, // vía al oeste → mira -X
          { dx: -1 - it.w, dz: 0, rot: 3 }, // vía al este → mira +X
        ];
        for (const t of tries) {
          // H7.2: nunca se construye TAPANDO el extremo de una vía — la celda de
          // frente debe tener vía a ambos lados en el eje perpendicular a la
          // fachada (es decir, la calle CONTINÚA por delante del edificio). Así
          // los cabos quedan libres para prolongarse y el pueblo no se encierra.
          const alongX = t.dz !== 0; // fachada mira ±Z → la calle corre en X
          let continues = true;
          for (const k of [-2, -1, 1, 2]) {
            if (!isWay(grid.get(alongX ? cx + k : cx, alongX ? cz : cz + k)?.terrain)) { continues = false; break; }
          }
          if (!continues) continue;
          const ax = cx + t.dx;
          const az = cz + t.dz;
          if (!clearForGrowth(grid, it.w, it.d, ax, az, t.rot)) continue;
          if (allow && !allow(ax, az)) continue;
          const zoned = requiredZone !== null && footprintHasZone(grid, it.w, it.d, ax, az, t.rot, requiredZone);
          if (policy === 'zonesOnly' && !zoned) continue;
          const d = Math.abs(ax - ccx) + Math.abs(az - ccz);
          // Un frente zonificado gana con claridad en preferZones, aunque esté
          // algo más lejos; la pizca de ruido solo rompe empates locales.
          const zoneBonus = policy === 'preferZones' && zoned ? -20 : 0;
          // Desempate ESTRUCTURAL (H7.1): hash de la parcela + semilla, no el RNG
          // vital de la sim — evaluar más o menos candidatos (una calle nueva)
          // ya no altera nacimientos, contagios ni economía.
          const score = d + zoneBonus + (scoreAdjustment?.(ax, az) ?? 0) + hashCoord01(ax, az, seed ^ Math.imul(t.rot + 1, 0x9e3779b1)) * 4;
          if (score < bestScore) {
            bestScore = score;
            bestDist = d;
            bestIsZoned = zoned;
            best = { id: itemId, cx: ax, cz: az, rot: t.rot };
          }
        }
      }
    }
    // Con candidato en un anillo cercano, no hace falta mirar más lejos.
    if (best !== null && (policy === 'free' || bestIsZoned) && r > bestDist + 6) break;
  }
  return best;
}

function isWay(terrain: string | undefined): boolean {
  return terrain === 'road' || terrain === 'path';
}

function footprintHasZone(grid: Grid, w: number, d: number, ax: number, az: number, rot: Rot, zone: ZoneKind): boolean {
  const [fw, fd] = [rot % 2 === 0 ? w : d, rot % 2 === 0 ? d : w];
  for (let x = ax; x < ax + fw; x++) {
    for (let z = az; z < az + fd; z++) {
      if (grid.get(x, z)?.zone !== zone) return false;
    }
  }
  return true;
}

/** Centro para buscar parcelas: masa construida si existe; en un terreno vacío,
 * el centroide de las zonas pintadas para que el primer crecimiento tenga un
 * lugar natural donde empezar. */
export function growthCenter(grid: Grid, anchors: Array<[number, number]>): [number, number] {
  if (anchors.length > 0) return townCenter(anchors);
  const zoned: Array<[number, number]> = [];
  grid.forEachChunk((chunk) => chunk.cells.forEach((cell, key) => {
    if (!cell.zone) return;
    const cx = Math.floor(key / 65536) - 32768;
    const cz = (key % 65536) - 32768;
    zoned.push([cx, cz]);
  }));
  return townCenter(zoned);
}

// --- T4.4 (núcleo): extensión autónoma de vías --------------------------------
// Envoltura pura y testeable de "la ciudad traza carretera nueva". La simulación
// decide CUÁNDO ramificar y replica el parche al render; aquí se conserva el
// contrato espacial compartido con la herramienta de carretera del jugador.

/** Extiende una vía de 3 celdas de ancho desde `from` en la dirección ortogonal
 * `dir` (unitaria: (±1,0) o (0,±1)), hasta `length` celdas, con márgenes de
 * hierba a los lados y arbolado con huecos (el rasgo de identidad del juego).
 * Solo pisa terreno SIN edificios; se detiene si choca con uno (no arrasa el
 * pueblo). Devuelve las celdas de VÍA nuevas (para que el llamador refresque
 * render y grafo de navegación). El arbolado usa una semilla derivada de cada
 * celda, por lo que el resultado no depende del orden de llamadas ni de un RNG
 * mantenido por el hilo de render. */
export function extendRoad(
  grid: Grid,
  from: [number, number],
  dir: { dx: number; dz: number },
  length: number,
  seed: number,
): Array<[number, number]> {
  // La red autónoma y la herramienta del jugador deben obedecer la MISMA
  // geometría: franja de tres celdas, márgenes, obstáculos y agua. Antes esta
  // ruta duplicaba el pintor y podía convertir una celda de agua en asfalto.
  // `roads.ts` también protege los límites del mundo y mantiene idénticos los
  // detalles (aceras/márgenes/arbolado) que ve el render.
  return paintRoadExtension(grid, from, dir, length, seed).laid;
}

/**
 * Pinta un jardín de hierba bajo un edificio y en su retranqueo de una celda.
 * Es una operación visual: el llamador debe usarla sobre el `Grid` del main,
 * después de recibir/aplicar un patch, nunca sobre el grid vivo del worker.
 * Respeta vías, agua y huellas vecinas, y devuelve las celdas que cambiaron
 * para que el render pueda refrescar solo los chunks afectados.
 * `fw`/`fd` son las dimensiones de la huella ya rotada.
 */
export function paintYard(
  grid: Grid,
  anchorX: number,
  anchorZ: number,
  fw: number,
  fd: number,
): Array<[number, number]> {
  const painted: Array<[number, number]> = [];
  for (let x = anchorX - 1; x <= anchorX + fw; x++) {
    for (let z = anchorZ - 1; z <= anchorZ + fd; z++) {
      const cell = grid.get(x, z);
      if (!cell) continue;
      if (cell.terrain === 'road' || cell.terrain === 'path' || cell.terrain === 'water') continue;
      const inFootprint = x >= anchorX && x < anchorX + fw && z >= anchorZ && z < anchorZ + fd;
      // El anillo pertenece al edificio vecino si ya hay una huella allí.
      if (cell.building && !inFootprint) continue;
      if (cell.terrain !== 'grass') {
        grid.setTerrain(x, z, 'grass');
        painted.push([x, z]);
      }
    }
  }
  return painted;
}

/** canPlace + margen de respeto: 1 celda libre alrededor (retranqueo/paso). */
function clearForGrowth(grid: Grid, w: number, d: number, ax: number, az: number, rot: Rot): boolean {
  return placementCheck(grid, w, d, ax, az, rot, { margin: 1, allowPath: true }) === null;
}

/** Centro de masa de los edificios (para crecer compacto). */
export function townCenter(anchors: Array<[number, number]>): [number, number] {
  if (anchors.length === 0) return [0, 0];
  let sx = 0;
  let sz = 0;
  for (const [x, z] of anchors) {
    sx += x;
    sz += z;
  }
  return [Math.round(sx / anchors.length), Math.round(sz / anchors.length)];
}

// --- H7: métricas de trazado (puras) ------------------------------------------

export interface LayoutMetrics {
  /** Edificios urbanos (no naturaleza) contados. */
  buildings: number;
  /** Lado largo / lado corto de la caja de anclas urbanas (1 = cuadrado). */
  aspect: number;
  /** Tramos rectos de vía (≥ 8 celdas), una vez por banda de calzada. */
  streets: number;
  /** Manzanas: regiones de suelo (≥ `MIN_BLOCK_AREA` celdas) totalmente
   * rodeadas de vía dentro de la caja del pueblo. */
  blocks: number;
}

export const MIN_BLOCK_AREA = 25;
const MIN_STREET_RUN = 8;

/**
 * Mide la forma del pueblo — lo que el ojo llama "trama" o "tira". Puro y sin
 * RNG; sirve de criterio de paso para H7 (`aspect ≤ 1,35`, `blocks ≥ 2`,
 * `streets ≥ 3` en seed 4242 d80) y de test de regresión estética barato.
 */
export function layoutMetrics(grid: Grid): LayoutMetrics {
  const roads = new Set<number>();
  const anchors: Array<[number, number]> = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  grid.forEachChunk((chunk) => chunk.cells.forEach((cell, key) => {
    const [cx, cz] = cellFromKey(key);
    if (cell.terrain === 'road') {
      roads.add(key);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minZ = Math.min(minZ, cz); maxZ = Math.max(maxZ, cz);
    }
    const b = cell.building;
    if (b && b.anchorX === cx && b.anchorZ === cz) {
      const it = catalogData(b.id);
      if (it && it.role !== 'nature') anchors.push([cx, cz]);
    }
  }));

  let aspect = 1;
  if (anchors.length >= 2) {
    let ax0 = Infinity, ax1 = -Infinity, az0 = Infinity, az1 = -Infinity;
    for (const [x, z] of anchors) { ax0 = Math.min(ax0, x); ax1 = Math.max(ax1, x); az0 = Math.min(az0, z); az1 = Math.max(az1, z); }
    const w = ax1 - ax0 + 1, d = az1 - az0 + 1;
    aspect = Math.max(w, d) / Math.max(1, Math.min(w, d));
  }

  const isRoad = (x: number, z: number) => roads.has(cellKey(x, z));
  // Tramos: en cada fila se recorre la tirada continua de vía (los cruces no
  // la cortan) y se cuenta si su fila es el BORDE superior de una banda de
  // calzada (vía debajo, no encima) durante ≥ MIN_STREET_RUN celdas; así cada
  // banda de cualquier anchura cuenta una vez por fila (una avenida con
  // mediana de hierba cuenta sus dos calzadas). Igual por columnas.
  let streets = 0;
  if (roads.size > 0) {
    for (let z = minZ; z <= maxZ; z++) {
      let run = 0, edge = 0;
      for (let x = minX; x <= maxX + 1; x++) {
        if (isRoad(x, z)) {
          run++;
          if (isRoad(x, z + 1) && !isRoad(x, z - 1)) edge++;
        } else {
          if (run > 0 && edge >= MIN_STREET_RUN) streets++;
          run = 0; edge = 0;
        }
      }
    }
    for (let x = minX; x <= maxX; x++) {
      let run = 0, edge = 0;
      for (let z = minZ; z <= maxZ + 1; z++) {
        if (isRoad(x, z)) {
          run++;
          if (isRoad(x + 1, z) && !isRoad(x - 1, z)) edge++;
        } else {
          if (run > 0 && edge >= MIN_STREET_RUN) streets++;
          run = 0; edge = 0;
        }
      }
    }
  }

  // Manzanas: relleno desde el borde de la caja (ampliada en 1) por celdas
  // no-vía; lo que queda sin alcanzar y es grande está rodeado de calles.
  let blocks = 0;
  if (roads.size > 0) {
    const x0 = minX - 1, x1 = maxX + 1, z0 = minZ - 1, z1 = maxZ + 1;
    const W = x1 - x0 + 1, D = z1 - z0 + 1;
    const seen = new Uint8Array(W * D);
    const idx = (x: number, z: number) => (z - z0) * W + (x - x0);
    const flood = (sx: number, sz: number): number => {
      const stack = [sx, sz];
      let area = 0;
      seen[idx(sx, sz)] = 1;
      while (stack.length > 0) {
        const z = stack.pop()!, x = stack.pop()!;
        area++;
        for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]] as const) {
          if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || isRoad(nx, nz) || seen[idx(nx, nz)]) continue;
          seen[idx(nx, nz)] = 1;
          stack.push(nx, nz);
        }
      }
      return area;
    };
    for (let x = x0; x <= x1; x++) { if (!isRoad(x, z0) && !seen[idx(x, z0)]) flood(x, z0); if (!isRoad(x, z1) && !seen[idx(x, z1)]) flood(x, z1); }
    for (let z = z0; z <= z1; z++) { if (!isRoad(x0, z) && !seen[idx(x0, z)]) flood(x0, z); if (!isRoad(x1, z) && !seen[idx(x1, z)]) flood(x1, z); }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (isRoad(x, z) || seen[idx(x, z)]) continue;
      if (flood(x, z) >= MIN_BLOCK_AREA) blocks++;
    }
  }

  return { buildings: anchors.length, aspect, streets, blocks };
}
