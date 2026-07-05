/**
 * Crecimiento autónomo de la ciudad (T4.1-T4.2, LÓGICA pura — sin THREE).
 * Corre dentro de la sim (worker): la demanda sale del estado REAL
 * (empleo, vivienda, prosperidad de tiendas), nunca de un guion.
 *
 * Reglas estéticas (§5 del ROADMAP): los edificios nacen JUNTO a una vía,
 * mirando hacia ella, con 1 celda de retranqueo, y cerca del centro del
 * pueblo (compacidad). El resultado debe parecer un pueblo, no un vertido.
 *
 * El worker aplica la colocación a SU grid y emite `cityGrew`; el main
 * replica la colocación en el grid de render (misma llamada, mismo resultado).
 */
import { Grid, Rot } from './grid';
import { catalogData, CATALOG_DATA, Tier } from './catalogData';
import { Rng } from '../rng';

export interface GrowthPlacement {
  id: string;
  cx: number;
  cz: number;
  rot: Rot;
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
}

export type DemandKind = 'residential' | 'commerce' | 'work' | 'school' | 'clinic' | null;

/**
 * T4.1 — ¿Qué pide la ciudad AHORA? Una sola cosa por vez (crecer despacio
 * es parte de la estética). Prioridad: techo > empleo > comercio.
 */
export function computeDemand(d: DemandInput): DemandKind {
  const openJobs = d.jobs - d.employed;
  const unemployment = d.population > 0 ? (d.population - d.employed) / d.population : 0;
  // Niños sin plaza escolar → escuela (antes que nada: la escuela es sagrada).
  if (d.children > d.studentSlots && d.children >= 3) return 'school';
  // Salud media baja → clínica reactiva; pero con la mortalidad (ciclo 11) los
  // frágiles MUEREN y la media de los vivos ya no baja, así que un pueblo que
  // crece también se dota de sanidad de forma PROACTIVA (infraestructura
  // pública) — la clínica existe justamente para PREVENIR esas muertes.
  if (!d.hasClinic && d.population >= 10 && (d.avgHealth < 0.88 || d.population >= 20)) return 'clinic';
  // Paro alto, o parados sin ninguna vacante → un lugar de trabajo.
  if (unemployment > 0.35 || (openJobs <= 0 && unemployment >= 0.15)) return 'work';
  // Gente queriendo venir (hay trabajo, o la ciudad va bien) y sin casas → vivienda.
  // Freno denso-dependiente (ciclo 30): por encima del techo el pueblo ya no
  // tira de forasteros — deja de construir vivienda de inmigración y se aplana.
  if (d.freeHousing <= 0 && d.totalPopulation < d.carryingCapacity && (openJobs >= 1 || unemployment < 0.1)) return 'residential';
  // Tiendas saturadas (prosperidad alta sostenida) o pueblo sin tienda.
  if (d.shops === 0 && d.population >= 8) return 'commerce';
  if (d.shops > 0 && d.avgProsperity > 0.75 && d.population / d.shops > 14) return 'commerce';
  return null;
}

/**
 * Vivienda por MEZCLA DE DENSIDADES (T4.2 — consistencia y variedad, §4). En vez
 * de materializar siempre el mayor tier disponible (que volvía el pueblo un muro
 * de bloques idénticos en cuanto se desbloqueaba un tier), la ciudad reparte
 * densidades: la casita nunca desaparece, y los adosados/bloques entran como
 * acento creciente. El resultado es una silueta VARIADA — un pueblo con
 * gradiente, no un vertido de paneláks.
 *
 * Determinista (RNG con semilla). Devuelve una LISTA por orden de preferencia:
 * el primero es la densidad elegida (ponderada); los demás, de menor a mayor
 * huella, sirven de FALLBACK si la elegida no cabe junto a una vía — así el
 * crecimiento no se atasca por elegir al azar un bloque que nunca encaja.
 */
export function residentialChoices(tier: Tier, rng: Rng): string[] {
  const pool = CATALOG_DATA.filter((it) => it.role === 'residential' && it.tier > 0 && it.tier <= tier);
  if (pool.length === 0) return ['cottage'];
  // Gradiente por MADUREZ: se favorece la densidad del tier DESBLOQUEADO (la
  // "moda" de construcción del momento) con una cola geométrica hacia densidades
  // menores, que perduran como acento. Así un pueblo (T2) es sobre todo adosados
  // con casitas sueltas; una villa (T3) añade paneláks; una ciudad (T4) se vuelve
  // de bloques Zlín pero conserva su casco antiguo. Silueta variada Y con la
  // aglomeración propia de cada etapa (§4 + coherencia del tejido urbano).
  const weighted = pool.map((it) => ({ id: it.id, w: Math.pow(0.55, tier - it.tier), area: it.w * it.d }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = rng.next() * total;
  let pick = weighted[0].id;
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) { pick = x.id; break; }
  }
  const rest = weighted
    .filter((x) => x.id !== pick)
    .sort((a, b) => a.area - b.area)
    .map((x) => x.id);
  return [pick, ...rest];
}

/** Ítem del catálogo que materializa cada demanda, por tier. Determinista. */
export function itemForDemand(kind: Exclude<DemandKind, null>, tier: Tier): string {
  const pool = CATALOG_DATA.filter((it) => it.tier <= tier && it.tier > 0);
  const byRole = (roles: string[]) => pool.filter((it) => roles.includes(it.role));
  switch (kind) {
    case 'residential':
      // El de mayor tier disponible ata la densidad al progreso (T4.2 etapas).
      return byRole(['residential']).sort((a, b) => b.tier - a.tier)[0]?.id ?? 'cottage';
    case 'commerce':
      return byRole(['commerce']).sort((a, b) => b.tier - a.tier)[0]?.id ?? 'shop';
    case 'work':
      return byRole(['commerce', 'work', 'civic']).filter((it) => !it.students && it.id !== 'clinic').sort((a, b) => b.tier - a.tier)[0]?.id ?? 'shop';
    case 'school':
      return 'school';
    case 'clinic':
      return 'clinic';
  }
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
}): number {
  const raw = 0.45 + 0.2 * a.employment + 0.15 * a.avgHealth + 0.1 * a.avgFood + 0.35 * a.avgPrestige;
  return Math.min(1, Math.max(0.5, raw));
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
  rng: Rng,
  searchRadius = 60,
): GrowthPlacement | null {
  const it = catalogData(itemId);
  if (!it) return null;
  const [ccx, ccz] = center;

  let best: GrowthPlacement | null = null;
  let bestScore = Infinity;
  let bestDist = Infinity;

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
          const ax = cx + t.dx;
          const az = cz + t.dz;
          if (!clearForGrowth(grid, it.w, it.d, ax, az, t.rot)) continue;
          const d = Math.abs(ax - ccx) + Math.abs(az - ccz);
          const score = d + rng.next() * 4; // pizca de ruido: variedad de trama
          if (score < bestScore) {
            bestScore = score;
            bestDist = d;
            best = { id: itemId, cx: ax, cz: az, rot: t.rot };
          }
        }
      }
    }
    // Con candidato en un anillo cercano, no hace falta mirar más lejos.
    if (best !== null && r > bestDist + 6) break;
  }
  return best;
}

// --- T4.4 (núcleo): extensión autónoma de vías --------------------------------
// Geometría PURA y testeable de "la ciudad traza carretera nueva" (el test
// estrella del ROADMAP §4.4). Todavía NO está enganchada al bucle de crecimiento
// (esa integración — cuándo/dónde extender + replicar en render/pathfinding vía
// evento worker→main — es el siguiente paso, deliberadamente aparte para no
// desestabilizar el crecimiento, ya de por sí sensible). Aquí solo la geometría.

/** Extiende una vía de 3 celdas de ancho desde `from` en la dirección ortogonal
 * `dir` (unitaria: (±1,0) o (0,±1)), hasta `length` celdas, con márgenes de
 * hierba a los lados y arbolado con huecos (el rasgo de identidad del juego).
 * Solo pisa terreno SIN edificios; se detiene si choca con uno (no arrasa el
 * pueblo). Devuelve las celdas de VÍA nuevas (para que el llamador refresque
 * render y grafo de navegación). Determinista (RNG con semilla). */
export function extendRoad(
  grid: Grid,
  from: [number, number],
  dir: { dx: number; dz: number },
  length: number,
  rng: Rng,
): Array<[number, number]> {
  const laid: Array<[number, number]> = [];
  const px = -dir.dz; // perpendicular (rotación 90°) para el ancho de la vía
  const pz = dir.dx;
  for (let step = 1; step <= length; step++) {
    const bx = from[0] + dir.dx * step;
    const bz = from[1] + dir.dz * step;
    // ¿Hay edificio en la franja de la calzada? Si sí, cortar aquí.
    let blocked = false;
    for (let w = -1; w <= 1; w++) {
      if (grid.get(bx + px * w, bz + pz * w)?.building) { blocked = true; break; }
    }
    if (blocked) break;
    // Calzada de 3 celdas (limpia props que hubiera) + márgenes de hierba (±2).
    for (let w = -1; w <= 1; w++) {
      const cx = bx + px * w, cz = bz + pz * w;
      grid.setProp(cx, cz, undefined);
      grid.setTerrain(cx, cz, 'road');
      laid.push([cx, cz]);
    }
    for (const m of [-2, 2]) {
      const cx = bx + px * m, cz = bz + pz * m;
      if (!grid.get(cx, cz)?.building) grid.setTerrain(cx, cz, 'grass');
    }
    // Arbolado con huecos en el margen exterior (±3), cada 2 celdas (identidad).
    if (step % 2 === 0 && rng.next() > 0.35) {
      for (const m of [-3, 3]) {
        const cx = bx + px * m, cz = bz + pz * m;
        const c = grid.get(cx, cz);
        // Terreno abierto (campo, hierba o sin sembrar): planta. No sobre
        // edificios, calzada ni agua.
        if (!c?.building && !c?.prop && c?.terrain !== 'road' && c?.terrain !== 'water') {
          grid.setProp(cx, cz, { id: rng.next() < 0.6 ? 'tree-cypress' : 'tree-blob', variant: Math.floor(rng.next() * 1e9) });
        }
      }
    }
  }
  return laid;
}

/**
 * Pinta un JARDÍN de hierba bajo el edificio y en un anillo de 1 celda alrededor
 * (el "retranqueo" habitado), para que el pueblo autónomo se asiente sobre verde
 * como el pueblo sembrado a mano — frondoso y vivido, no plantado sobre tierra
 * beige. Respeta vías, agua y edificios ajenos. Determinista (sin RNG): no altera
 * la trayectoria del crecimiento. Devuelve las celdas pintadas (para refrescar el
 * render). `fw`/`fd` = footprint YA rotado.
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
      const c = grid.get(x, z);
      if (!c) continue;
      if (c.terrain === 'road' || c.terrain === 'path' || c.terrain === 'water') continue;
      const inFootprint = x >= anchorX && x < anchorX + fw && z >= anchorZ && z < anchorZ + fd;
      // En el anillo, no pisar el jardín de un edificio ajeno (deja su borde).
      if (c.building && !inFootprint) continue;
      if (c.terrain !== 'grass') {
        grid.setTerrain(x, z, 'grass');
        painted.push([x, z]);
      }
    }
  }
  return painted;
}

/** canPlace + margen de respeto: 1 celda libre alrededor (retranqueo/paso). */
function clearForGrowth(grid: Grid, w: number, d: number, ax: number, az: number, rot: Rot): boolean {
  if (!grid.canPlace(w, d, ax, az, rot)) return false;
  const [fw, fd] = rot % 2 === 0 ? [w, d] : [d, w];
  for (let x = ax - 1; x < ax + fw + 1; x++) {
    for (let z = az - 1; z < az + fd + 1; z++) {
      const c = grid.get(x, z);
      if (!c) return false; // fuera del mundo sembrado
      if (c.building) return false;
      if (c.terrain === 'water') return false;
    }
  }
  return true;
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
