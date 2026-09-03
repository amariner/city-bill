# PLAN PENDIENTE — city-bill jugable + autónomo (city builder híbrido)

> **Estado: APROBADO, NO EJECUTADO.** Sesión de planificación del 2026-09-02 (Claude
> Fable 5.1 + usuario). Este documento es la hoja de ruta completa para convertir el
> vivarium en un city builder híbrido tipo Cities Skylines. Cuando se decida ejecutarlo,
> el primer paso es la **Parte A** (reescribir `ROADMAP.md` a partir de este plan) y a
> continuación los hitos H1-H6 de la **Parte B**, en orden, con gate del usuario entre
> hitos. Hasta entonces, `ROADMAP.md` sigue siendo el vigente (MVP vivarium, §3).

---

## Parte A — Plan de la sesión de arranque (solo documentos)

### Contexto (verificado el 2026-09-02)

- `git fetch`: `main` local == `origin/main` (59b866b). Rama local `rescate/construction-sector`
  con 3 commits de sim sin portar (trama 2D `eeeaab4`, mezcla de densidades `43f2719`,
  jardín `3f731a2`).
- Estado real: ~11.2k líneas TS, 363 aserciones verdes (`npm test`, ~40 s), `tsc` limpio.
  Es un **vivarium**: la ciudad crece sola (demanda real → `findParcel`/`extendRoad`),
  NPCs con utility-AI, economía por hogares con tesoro/impuestos/alquiler/pensiones,
  Crónica, HUD, inspector, atmósfera. **El jugador solo puede mirar y cambiar la
  velocidad.** `ActionMsg` existe en `protocol.ts` pero nadie lo envía; el worker solo
  implementa `demolish`. No hay guardado (el `serialize` de julio se perdió en el merge;
  `Economy.serialize` está huérfano y `SocialSystem.serialize` desapareció — existía en
  `6ca4f31`). No hay coste en el catálogo, no hay zonas, `happiness` es campo muerto.
- Hallazgos verificados en código que condicionan el diseño:
  1. El main **re-ejecuta lógica de mundo** (`main.ts:99-132`: `placeBuilding` +
     `extendRoad` con un `roadRng` propio) mientras la sim usa su RNG general para el
     arbolado (`simulation.ts:872`) → divergencia sim↔render y perturbación del RNG.
  2. `canPlace` (`grid.ts:126`) acepta celdas inexistentes (fuera del mundo) y `path`.
  3. `removeBuilding` barre 41×41 (`grid.ts:153`).
  4. `hireAndAcquaint` es O(n²) otra vez (`simulation.ts:408-414`, regresión del merge).
  5. 11 escrituras directas a `treasury` sin libro mayor (`economy.ts:206-212,222-226,
     420,439,453-458,492-494`; `simulation.ts:691,719-720,1058`).
  6. El upgrade in situ casita→adosados es imposible con las huellas actuales (3×3 vs 8×3).
  7. Teclas 0-3 son velocidad; los dígitos no sirven para herramientas.
- Decisiones del usuario (2026-09-02):
  - **Modelo híbrido**: la ciudad sigue creciendo sola; el jugador dirige (zonas = preferencia
    fuerte; política `free|preferZones|zonesOnly`).
  - **Alcance**: núcleo (calles, zonas, colocar/demoler, presupuesto/impuestos/préstamos) +
    servicios con cobertura, felicidad y valor del suelo + tráfico, autobús, distritos/políticas
    y tren. **Fuera**: electricidad/agua, PWA/táctil. **Dentro**: guardado de partida.
  - **Documento**: reescribir `ROADMAP.md`; el histórico se mueve a `docs/ROADMAP-HISTORICO.md`.
- Destinatario de la ejecución: **Sonnet sin supervisión** → cada tarea con archivos exactos,
  funciones, criterios de aceptación observables, tests como propiedades estructurales,
  verificación visual y trampas.

### Entregables de la sesión de arranque (cero código)

1. **`ROADMAP.md` reescrito** (≈900 líneas): §0 protocolo (actualizado), §1 contratos
   (1.1-1.6 actuales resumidos + 1.7-1.12 nuevos con las formas TS del protocolo), §2 punto de
   partida (~40 líneas con punteros a SIMULATION.md/RESEARCH.md/histórico), §3 hitos H1-H6
   (formato por tarea: objetivo · archivos · pasos · aceptación · tests · visual · trampas),
   §4 checklist visual (igual), §5 riesgos (ampliado), §6 diario (solo la entrada del día +
   enlace), §7 glosario de costuras y smells para Sonnet.
2. **`docs/ROADMAP-HISTORICO.md`**: §2 (fases T0-T6), §3 antiguo (MVP vivarium) y diario §6
   íntegros (líneas 123-353, 356-443, 463-1097 del ROADMAP actual), con cabecera "congelado".
3. **`CATALOG.md`**: tiers sincronizados con el código (25/80/200); columna coste/mantenimiento
   ("a calibrar"); entradas nuevas pendientes: comisaría, bomberos, parque, plaza, zona de
   juegos, `town-house`, `low-block`, parada de bus, vía/estación de tren.
4. **`CLAUDE.md`**: frase en la regla nº 1 (histórico en `docs/ROADMAP-HISTORICO.md`) y regla
   nueva nº 7: "el render nunca muta su grid por su cuenta: solo aplica `gridPatch` del worker".
5. Commit `H0: ROADMAP reescrito — el rumbo es el city builder híbrido (H1-H6)` + push.
6. Verificación: lectura completa del ROADMAP nuevo; `grep` de que el histórico contiene la
   primera línea del §2 antiguo y la última del diario; spot-check de 10 rutas/funciones
   citadas; `npx tsc --noEmit` y `npm test` verdes (constancia de gate).

### Resumen de hitos

| Hito | Nombre | Entrega | Gate |
|---|---|---|---|
| H1 | Cimientos de la agencia | `gridPatch`, acciones con eco + replay, `placementCheck`, puntero/herramientas, fantasma, toolbar + sandbox, bulldoze digno, guardado/carga | Colocar/demoler a mano en sandbox; replay y save verdes; F3 sin regresión |
| H2 | Calles y zonas | `roads.ts` (4 tipos, L por arrastre), capa de zonas + pincel + overlay, política de crecimiento, barras RCI, acceso/abandono, jardín | Zonificar junto a calle propia → brotan casas ahí; sin tocar sigue creciendo |
| H3 | Dinero de alcalde | costes/mantenimiento/ledger, impuestos R/C/I, préstamos/quiebra, panel de presupuesto, conservación de dinero, menú de partida | Sonda económica, panel, tests conservación/replay/save |
| H4 | Servicios, felicidad y valor del suelo | catálogo de servicios, cobertura, felicidad, valor del suelo, densificación in situ, heatmaps, alertas, servicios autónomos con coste | 3 heatmaps, un upgrade con obra, F3 con overlay |
| H5 | Tráfico y ciudad grande | congestión + overlay, líneas de bus, distritos/políticas, tren | Capturas; tick ≤ 50 ms con 1000 hab. |
| H6 | Puertas abiertas | sonido, onboarding, perf/LOD, build + GitHub Pages, docs | DONE en URL pública en frío |

Orden justificado: H1 desbloquea el verbo; H2 antes que H3 porque el dinero sin nada que
comprar no se prueba; el guardado va en H1 (porte casi mecánico de `6ca4f31`) para que cada
hito posterior añada sus campos a `SimSaveState` con test; H4 depende de zonas (H2) y coste
(H3); H5 sobre calles con tipo (H2) y valor del suelo (H4); H6 cierra.

---

## Parte B — Diseño validado contra el código (base del ROADMAP nuevo)

### B.0 Correcciones al esqueleto inicial (verificadas en código)

| # | Esqueleto | Código real | Corrección adoptada |
|---|---|---|---|
| 1 | El main replica acciones en su grid | Re-ejecuta lógica (`main.ts:107,119`) con `roadRng` propio; la sim usa el RNG general para árboles (`simulation.ts:872`) | **`GridPatch`**: journal de celdas tocadas en el grid del worker; el main lo aplica tal cual (`Grid.applyPatch`). Cero lógica duplicada, cero RNG en main. Sirve para acciones, crecimiento, vías, abandono y upgrades. |
| 2 | Arbolado determinista por hash | `extendRoad` (`growth.ts:278-286`) tira del RNG que le pasan | `extendRoad` crea `createRng(hash(bx,bz,seed))` internamente; deja de recibir `rng`. |
| 3 | `canPlace` valida el fantasma | Acepta celdas `undefined` y `path`; `clearForGrowth` exige existencia + margen | `placementCheck()` en `world/placement.ts` con `RejectReason`, usada igual por fantasma (main) y `applyAction` (worker). Mapa jugable = extensión sembrada (`EXTENT=90` en `seed.ts`). |
| 4 | `removeBuilding` 41×41 | Confirmado; `BuildingRef` no guarda huella | `BuildingRef.fw/fd` opcionales al colocar (compatibles con saves viejos). |
| 5 | Upgrade in situ cottage→row-houses→slab | Huellas 3×3 / 8×3 / 10×4 / 7×5 incompatibles | Ítems intermedios `town-house` 3×3 (cap 3, T2) y `low-block` 4×3 (cap 8, T3). Escalera: cottage→town-house (misma huella) → low-block (+1 columna si libre) → slab solo por reparcelación. |
| 6 | Teclas 1-9 para herramientas | 0-3 = velocidad; F3, C, F, Esc, Q/E, WASD ocupados | **B** construir, **R** carretera, **Z** zonas, **X** demoler, **T** presupuesto, **V** overlays, **Tab** rotar, **Esc** cancelar, **M** mute (H6). |
| 7 | Tiers 25/80/200 | Correcto (`simulation.ts:545`); CATALOG.md dice 20/100/400/1500 | Sincronizar CATALOG.md. |
| 8 | Dividendo público | Reparte superávit sobre 300/hab (`economy.ts:449-459`): repartiría dinero prestado | Superávit = tesoro − reserva − deuda viva. |
| 9 | Impuesto "I" (industria) | No hay beneficio industrial; salarios `work/agriculture` se acuñan (`payWage`) | `taxRates {R: renta, C: sociedades sobre margen de tiendas, I: tasa de actividad sobre nómina work/agriculture}` (acuñada → tesoro; listada como fuente de acuñación en el test de conservación). |
| 10 | Demolición | `economy.rebuild` despide (`economy.ts:291-294`) pero nadie realoja: `home` colgando | "Bulldoze con dignidad" en H1.7, antes de H2. |
| 11 | `SocialSystem.serialize` | No existe en el código actual; sí en `6ca4f31` | Re-portar de `git show 6ca4f31:src/sim/citizens/social.ts`. |
| 12 | `hireAndAcquaint` con hash espacial | Vuelve a ser O(n²) diario (`simulation.ts:408-414`) | Anotar; arreglar en H6.3. |

Reordenaciones: **save/load → H1.8** (porte mecánico; cada hito posterior añade sus campos con
test) y **bulldoze digno → H1.7**.

### B.1 Protocolo (`src/sim/protocol.ts`) — diseño coherente

```ts
export type RoadKind = 'path' | 'rural' | 'street' | 'avenue';
export type ZoneKind = 'R' | 'C' | 'I' | 'A' | 'P';
export type GrowthPolicy = 'free' | 'preferZones' | 'zonesOnly';
export type TaxSector = 'R' | 'C' | 'I';

export type PlayerAction =
  | { kind: 'place'; id: string; cx: number; cz: number; rot: Rot }                       // H1
  | { kind: 'bulldoze'; cx: number; cz: number }                                           // H1
  | { kind: 'road'; road: RoadKind; from: [number, number]; to: [number, number] }         // H2 (L ortogonal)
  | { kind: 'zone'; zone: ZoneKind | null; x0: number; z0: number; x1: number; z1: number } // H2 (null = borrar)
  | { kind: 'setPolicy'; policy: 'growth'; value: GrowthPolicy }                          // H2
  | { kind: 'setPolicy'; policy: 'publicAutobuild'; value: 'off' | 'paid' }               // H3/H4
  | { kind: 'setTax'; sector: TaxSector; rate: number }                                   // H3 (0..0.5)
  | { kind: 'loan'; tier: 0 | 1 | 2 }                                                     // H3
  | { kind: 'repayLoan'; id: number }                                                     // H3
  | { kind: 'busLine'; op: 'create' | 'delete'; lineId?: number; stops?: Array<[number, number]> } // H5
  | { kind: 'district'; op: 'paint' | 'policy'; x0?: number; z0?: number; x1?: number; z1?: number; district?: number; policy?: string; value?: boolean } // H5
  | { kind: 'rail'; from: [number, number]; to: [number, number] };                       // H5

export interface ActionMsg { type: 'action'; seq: number; action: PlayerAction }
export interface RecordedAction { seq: number; tick: number; action: PlayerAction }
export interface InitMsg { type: 'init'; seed: number; gridJson: string; preGrowDays?: number; saveBlob?: string }
export interface SaveMsg { type: 'save'; reason: 'auto' | 'manual' | 'unload' }

export type RejectReason =
  | 'outOfWorld' | 'blocked' | 'water' | 'road' | 'invalid' | 'notFound'
  | 'tierLocked' | 'noMoney' | 'bankrupt' | 'notPlayerPlaceable';

export interface ActionAppliedMsg { type: 'actionApplied'; seq: number; tick: number; cost: number; action: PlayerAction }
export interface ActionRejectedMsg { type: 'actionRejected'; seq: number; reason: RejectReason; detail?: string }
export interface GridPatchMsg {
  type: 'gridPatch';
  cells: Array<[number, number, Cell]>;
  built: Array<{ id: string; cx: number; cz: number; rot: Rot }>;
  razed: Array<{ cx: number; cz: number }>;
  seq?: number;
}
export interface WorldReadyMsg { type: 'worldReady'; gridJson: string; center: [number, number]; restored: boolean } // sustituye a grownGrid
export interface SaveBlobMsg { type: 'saveBlob'; simState: string; actions: RecordedAction[]; day: number; tick: number }

// H4 — stats por edificio a ~1 Hz
export const BUILDING_STRIDE = 8; // [ax, az, happiness, landValue, coverageMask, alertMask, occupancy, load]
export const enum CoverageBit { Education = 1, Health = 2, Police = 4, Fire = 8, Park = 16, RoadAccess = 32, Transit = 64 }
export const enum AlertBit { NoRoad = 1, NoJob = 2, Unhappy = 4, Abandoned = 8, NoService = 16, Congested = 32 }
export interface BuildingStatsMsg { type: 'buildingStats'; count: number; data: Float32Array }
// H5 — carga por celda de vía
export interface TrafficMsg { type: 'traffic'; cells: Int32Array } // pares [cellKey, load 0..255]
```

`CityStats` gana (añadir, nunca renombrar): H2 `demand{R,C,I}`, `growthPolicy`, `noAccess`,
`abandoned`; H3 `budget{incomeToday, expenseToday, upkeepPerDay, debt, bankrupt,
breakdown{taxR,taxC,taxI,rent,goods,lifestyle,wages,pensions,upkeep,interest,build,dividend}}`,
`taxes{R,C,I}`, `loans[]`, `publicAutobuild`; H4 `happiness`, `avgLandValue`,
`coverage{education,health,police,fire,park}`; H5 `congestion`, `busLines`, `trainActive`.
Snapshot (H5): `vehicles: Float32Array` stride 6 `[id,x,z,heading,kind(0 bus,1 loco,2 vagón),lineId]`
y `TravelModeCode.Bus = 2`.

Guardado (localStorage `city-bill:save:v2:<seed>`):
`{version: 2, seed, day, savedAt, actions: RecordedAction[], simState: string}`; `simState`
opaco al main (JSON de `SimSaveState`).

### B.2 Contratos nuevos para ROADMAP §1

- **§1.7 Acciones, eco y replay.** Toda mutación del jugador es un `PlayerAction` con `seq`
  por `SimClient.act()`. El main no toca su grid al enviar (solo fantasma "pendiente"). El
  worker valida, aplica, registra `{seq, tick, action}` en `Simulation.actions` y contesta
  `actionApplied`/`actionRejected`. **Todo cambio del grid llega por `gridPatch`** (también
  el autónomo). Acciones entre sub-ticks, nunca dentro de `step()`. Test por hito: replay de
  `actions[]` ⇒ `snapshot()`, `grid.serialize()` y `treasury` idénticos.
- **§1.8 Dinero.** Una caja (`Economy.treasury`) + `ledger` por categoría. Público cuesta
  `cost` al aplicarse la acción y `upkeepPerDay` en el cierre del día (entre
  `economy.endOfDay()` y `chargeRent()`); privado brota gratis en zonas y paga impuestos; el
  jugador puede colocarlo pagando (caro). Tesoro negativo solo por intereses/mantenimiento,
  nunca por construir. Quiebra = `treasury < −0.5·reserva` sin préstamo posible: bloquea
  construir; la ciudad sigue viva. Test de conservación: `Δ(wallets+tills+treasury) ==
  acuñado − fugado − construido − intereses + préstamos`.
- **§1.9 Zonas y política.** `Cell.zone?: ZoneKind` en serialize/deserialize/applyPatch; no
  bloquea nada. `growthPolicy` por acción `setPolicy` (registrada). Rol→zona: residential→R,
  commerce→C, work→I, agriculture→A, park→P; civic no se zonifica (`publicAutobuild`).
- **§1.10 Canal de overlays.** `buildingStats`/`traffic` en arrays transferibles a ≤1 Hz,
  fuera del snapshot. Capas propias (`zones.ts`, `overlay.ts`, `alerts.ts`, `ghost.ts`):
  **nunca** `rebuildAllChunks`/`refreshChunkAt` para pintar datos.
- **§1.11 Guardado.** Autosave 10 s + `beforeunload`. Regla: cada tarea que añade estado a
  `Simulation`/`Economy` lo mete en `SimSaveState` + test guardar→restaurar en la misma tarea.
- **Puntero.** Con herramienta activa el botón izquierdo es de la herramienta y el pan pasa a
  central/derecho + WASD; con `none` todo como hoy. Esc cierra herramienta antes que inspector.

### B.3 Riesgos nuevos (§5)

| Riesgo | Mitigación |
|---|---|
| Doble lógica sim/render diverge | `gridPatch` única vía de mutación del render grid; test: tras N patches `renderGrid.serialize() === simGrid.serialize()` |
| Una acción rompe el determinismo | Acciones entre sub-ticks; `applyAction` sin `this.rng` (hash de coordenadas); test de replay por hito |
| Coste de zonas/overlays en draw calls | Mallas fundidas por chunk, visibles solo con herramienta/overlay; medir en F3 |
| Despawns silenciosos al demoler | `rehouseOrEmigrate()` obligatorio; test: población antes == después |
| `rebuildAllChunks` con mapa grande | No añadir disparadores; overlays en capas propias; H6 mide el hitch |
| Save incompleto pierde estado en silencio | Casilla por tarea: campo en `SimSaveState` + test |
| Costes mal calibrados | `scripts/economyProbe.ts` (H3.1) imprime ingresos/gastos diarios a pop 30/100/300 antes del gate |

### B.4 Tareas por hito (7 campos por tarea)

Formato: **objetivo · archivos (C crear / M modificar) · pasos · aceptación · tests · visual ·
trampas**. Los tests nuevos se añaden al script `"test"` de `package.json`.

#### H1 — Cimientos de la agencia

**H1.1 Journal del grid y `GridPatch` (sustituye la réplica del main)**
- Objetivo: el render grid deja de ejecutar lógica; recibe diffs del worker y los aplica.
- Archivos: M `src/world/grid.ts`, M `src/sim/protocol.ts`, M `src/sim/worker.ts`, M `src/sim/client.ts`, M `src/main.ts`, M `src/world/growth.ts`, M `src/world/render/worldView.ts`, M `src/world/grid.test.ts`.
- Pasos: (1) `Grid`: `journal = new Set<number>()` (claves `cellKey`); `ensureCell`, `setTerrain`, `setProp`, `placeBuilding`, `removeBuilding` añaden la clave; `takeJournal(): Array<[number,number,Cell]>` (vacía y ordena por clave) y `applyPatch(cells)` (escribe terrain/building/prop/zone, marca `dirty`, sin `canPlace`); `deserialize` copia también `zone`. (2) `extendRoad(grid, from, dir, length, seed)`: sin `rng`; dentro `createRng((bx*73856093) ^ (bz*19349663) ^ seed)` por paso; `maybeExtendRoad` pasa `this.seed`. (3) Worker: en `sendSnapshot()`, antes del snapshot, `takeJournal()` → `gridPatch{cells, built, razed}`; `Simulation` acumula `pendingBuilt/pendingRazed`; vaciar el journal tras `preGrow`/`worldReady`. (4) `SimClient.onGridPatch`; `main.ts`: `grid.applyPatch` → `worldView.refreshCells(cells)` → `construction.start` por cada `built`; `atmosphere.invalidate()` por `razed`. Borrar los bloques `cityGrew`/`roadExtended` de `main.ts:103-122` y `roadRng`. (5) `worldView.refreshCells`: chunks tocados → `refreshChunkAt` una vez por chunk.
- Aceptación: `?scene=farm` a ×8 crece y traza calles como antes; `main.ts` no importa `extendRoad` ni `createRng`.
- Tests (`grid.test.ts`): journal captura toda mutación (3×2 ⇒ 6 entradas); `applyPatch(takeJournal())` sobre un gemelo ⇒ `serialize()` idéntico; `extendRoad` misma semilla en dos grids ⇒ mismos props; (`sim.test.ts`) tras 5 días, `renderGrid.serialize() === sim.grid.serialize()`.
- Visual: `?scene=test-dev`, calle nueva con márgenes y árboles con huecos (§4); F3 sin cambio.
- Trampas: ordenar el journal antes de emitir; el patch no se transfiere (objetos); vaciar journal tras `preGrow` (miles de celdas).

**H1.2 Acciones: `SimClient.act`, `Simulation.applyAction`, registro y eco**
- Objetivo: colocar y demoler; toda acción registrada y reproducible.
- Archivos: M `protocol.ts`, M `worker.ts`, M `client.ts`, M `simulation.ts`, C `src/sim/actions.ts`, C `src/sim/actions.test.ts`, M `package.json`.
- Pasos: (1) tipos de B.1 (solo `place`/`bulldoze` implementados; resto rechazado `invalid`; eliminar `ActionMsg.terrain`). (2) `applyPlayerAction(sim, a, seq): {ok:true; cost} | {ok:false; reason}`: `place` = `placementCheck` + `grid.placeBuilding` + `index.rebuild()` + `economy.rebuild()` + si residencial `fillHome` con atractividad (extraer `settleNewBuilding(p, it)` de `applyGrowth`, `simulation.ts:892-907`) + `hireAndAcquaint()` + evento `cityGrew{byPlayer:true}` + `pendingBuilt`; `bulldoze` = ancla desde cualquier celda de huella → `razeBuilding` (H1.7), o si es vía, `road→field` (solo esa celda; H2 amplía). (3) `Simulation.actions: RecordedAction[]`, `applyAction(a, seq)` registra `{seq, tick, action}` solo si ok. (4) Worker `case 'action'`: `applyAction` → `actionApplied{seq,tick,cost}` o `actionRejected` → `sendSnapshot()` inmediato. (5) `SimClient.act(action): number` (asigna `seq`, `pending: Map`), callbacks `onActionApplied/onActionRejected`. (6) `replayActions(sim, actions)`: avanza `step()` y aplica cada acción cuando `sim.clock.tick === a.tick`.
- Aceptación: desde consola `simClient.act({kind:'place', id:'cottage', cx, cz, rot:0})` levanta casita con obra y llega familia; `blocked` sobre otro edificio.
- Tests: replay (sim A con 3 acciones en ticks 300/900/1500 + 2 días; sim B reproduce `A.actions` ⇒ `snapshot()` y `grid.serialize()` idénticos); rechazada no aparece en `actions`; `place` residencial sube población ≥1; determinismo existente verde.
- Trampas: `fillHome` consume `this.rng` (esperado; replay lo reproduce en el mismo tick). No aplicar acciones a mitad de lote de `pendingSkip`. No llamar `hireAndAcquaint` por celda en operaciones masivas.

**H1.3 `placementCheck` compartido y `removeBuilding` exacto**
- Archivos: C `src/world/placement.ts`, M `grid.ts`, M `growth.ts` (`clearForGrowth` usa `placementCheck` + margen), M `grid.test.ts`.
- Pasos: `placementCheck(grid, w, d, cx, cz, rot, {margin: 0|1, allowPath}): RejectReason | null` — `!cell` → `outOfWorld`; `building` → `blocked`; `water`; `road` (y `path` si `!allowPath`). `BuildingRef.fw/fd` en `placeBuilding`; `removeBuilding` usa `fw/fd` si existen, si no el barrido antiguo. `Grid.buildingAt(cx,cz)`.
- Tests: `outOfWorld` en celda inexistente; `removeBuilding` de un 10×4 limpia exactamente 40 celdas (vecino a 1 celda sobrevive).
- Trampas: `canPlace` sigue existiendo (lo usa `seed.ts`); no cambiar su semántica.

**H1.4 Puntero unificado y máquina de herramientas**
- Archivos: C `src/core/pointer.ts`, C `src/core/tools.ts`, M `src/core/input.ts`, M `src/ui/inspector.ts`, M `src/core/debugHud.ts`, M `main.ts`.
- Pasos: `Pointer(domElement, camera)`: `hoverCell` (raycast a plano y=0, código de `inspector.ts:117-127`/`debugHud.ts:80-85`), `DRAG_THRESHOLD_PX = 6` único, `onClick(cell, button)`, `onDragStart/onDrag/onDragEnd`. Regla de botones (B.2). `Input` recibe el pan del `Pointer` (`feedPan(dx,dy)`); se elimina la escucha duplicada de `inspector.ts:79-87` y el raycast de `debugHud.ts`. `tools.ts`: `type Tool = {kind:'none'} | {kind:'place'; id; rot} | {kind:'bulldoze'} | {kind:'road'; road} | {kind:'zone'; zone} | {kind:'busLine'} …`; `ToolState` con `set/get/onChange`, teclas B/X/Esc/Tab (`preventDefault`), `handle(pointerEvent)` → `simClient.act(...)`.
- Aceptación: con herramienta activa, arrastrar con izquierdo no mueve la cámara; con `none`, como hoy; clic en vecino sigue abriendo inspector; Esc cierra herramienta antes que inspector.
- Tests: `src/core/tools.test.ts` opcional (Tab rota mod 4; Esc → none).
- Trampas: `setPointerCapture` pasa al `Pointer`; no reutilizar letras de WASD.

**H1.5 Fantasma de colocación**
- Archivos: C `src/world/render/ghost.ts`, M `src/palette.ts` (`ghostOk`, `ghostBad`), M `main.ts`.
- Pasos: `Ghost` = quad de huella (y=0.12) + copia `it.build()` con materiales clonados `transparent, opacity 0.55`; `update(tool, hoverCell, renderGrid)` colorea por `placementCheck(renderGrid, …)`; al enviar `act` pasa a "pendiente" (gris) hasta el eco; en `actionRejected` parpadea rojo 300 ms + toast con la razón.
- Aceptación: verde en campo, rojo sobre vía/agua/edificio/fuera del mundo; Tab rota; huella coincide con la del edificio construido.
- Visual: captura verde y rojo en `?scene=sandbox`.
- Trampas: ocultar en `none` (draw calls); `depthWrite:false` para no pelear con el terreno a 0.11.

**H1.6 Toolbar mínima, tema compartido y escena `sandbox`**
- Archivos: C `src/ui/toolbar.ts`, C `src/ui/theme.ts`, M `cityHud.ts`, `controlBar.ts`, `toasts.ts`, `devPanel.ts` (usar `theme.css()`), M `main.ts`, M `src/world/seed.ts` (`seedSandbox`).
- Pasos: `theme.ts` (`css(hex)`, `INK`, `PANEL_BG`, `panelStyle()`); borrar las 4 copias. `Toolbar` abajo-centro (toasts a `bottom:72px`): "construir" (catálogo filtrado por `city.tier` y `playerPlaceable`), "demoler"; luego vías/zonas/presupuesto. `seedSandbox(seed)`: campo ±90 con cruz de vías rural, `autonomousGrowth=false`.
- Aceptación: toolbar clicable y por teclas; leyenda de `controlBar` con B/X/Tab/Esc; `?scene=sandbox` arranca vacío.
- Visual: captura de la toolbar (no tapa la viñeta; monospace 12 px).

**H1.7 Bulldoze con dignidad**
- Archivos: M `simulation.ts` (`razeBuilding`, `rehouseOrEmigrate`), M `sim.test.ts`.
- Pasos: `razeBuilding(ax, az)`: (1) ciudadanos con `home` ahí → `rehouseOrEmigrate(ids)`: vivienda con hueco más cercana (Manhattan, determinista por orden de ancla), mueve `home`, fusiona claves `households/pantry/wallets/emigrationPressure` con `+=`; sin hueco → `leaving.add(id)` (Crónica: "se marcha porque su casa fue demolida", `reason:'evicted'`); (2) `inside` en ese edificio → `inside=false`, `phase={kind:'deciding'}`, posición = `entrance ?? ancla`; (3) `grid.removeBuilding` + `index.rebuild()` + `economy.rebuild()` + evento `buildingRazed{id,label,byPlayer}` + `pendingRazed`.
- Tests: `pop antes == pop después` en el tick de demolición; `index.at(home)` definido para todo ciudadano; sin huecos ⇒ `leaving.size > 0`.
- Trampas: no borrar de `wallets` sin fusionar (H3.5 lo vigila).

**H1.8 Guardado/carga (porte de `6ca4f31`) + autosave + slot mínimo**
- Archivos: M `simulation.ts` (`SimSaveState`, `serialize`, `constructor(grid, seed, restore?)`), M `citizens/social.ts` (`serialize/restore` re-portados), M `worker.ts`, M `client.ts`, M `protocol.ts`, M `main.ts`, C `src/save/save.ts`, M `sim.test.ts`.
- Pasos: `git show 6ca4f31:src/sim/simulation.ts` como referencia (`serializeCitizen` normaliza `waitingPath`→`deciding`, `friends` Map→pares). Ampliar con TODO el estado actual: `households`, `pantry`, `emigrationPressure`, `leaving`, `inEpidemic`, `tier`, `lastDay`, `lastRoadDay`, `roadsExtended`, `carTrips`, `emigrations`, `vaccinationsGiven`, `firstBuildingSeen`, `dynastiesSeen/Fallen/Names`, `settlementLevelSeen`, `nextId`, los 5 flags, `actions`, `rngState` + `churnRngState` + `social.rngState`, `clock.time/tick`, `economy.serialize()` (completar `goodsSold/goodsImported/lifestyleSpent/lifestyleLeft/dividendPaid/wagesFromTreasury`), `gridJson`. Worker: `init` con `saveBlob` → restaurada → `worldReady{restored:true}`; `save` → `saveBlob`. Main: autosave 10 s + `beforeunload`; cargar si hay save para la semilla y no es `?scene=farm|test-dev|sandbox|buildings`; `?new=1` borra. Slot mínimo en `controlBar`: "nueva partida" / "semilla: N".
- Aceptación: recargar continúa la partida (reloj, población, edificios, acciones).
- Tests: guardar tick 700 → `JSON.stringify/parse` → restaurar → 3 días == original (snapshot + grid + `actions.length`); restaurar + acción nueva: replay completo desde cero reproduce el estado; determinismo verde.
- Trampas: el test DEBE pasar por JSON (referencias compartidas, bug documentado en ROADMAP §6 2026-07-04). `PathQueue` no se serializa. `Chronicle` ya persiste por semilla (`chronicle.ts:228`). `preGrowDays` y `saveBlob` excluyentes.

**Gate H1:** `tsc` limpio, suite verde (replay, save), captura sandbox con fantasma + obra manual + demolición con vecinos saliendo, F3 sin regresión.

#### H2 — Calles y zonas

**H2.1 `world/roads.ts`: planificación y pintado puros**
- Archivos: C `src/world/roads.ts`, C `src/world/roads.test.ts`, M `grid.ts` (`Cell.roadKind?: 'rural'|'street'|'avenue'`), M `protocol.ts`.
- Pasos: `ROAD_SPECS: Record<RoadKind, {lanes, sidewalk, median, margin, trees, costPerCell, speed, capacity}>` (path 1; rural 3 + margen 2 + árboles ±3 = `extendRoad`; street 3 + acera `path` por lado; avenue 2+1 mediana (`grass` + ciprés cada 3) + 2 + aceras). `planRoad(from, to)`: eje en L (X luego Z). `paintRoad(grid, axis, kind, seed): {laid, blocked}`: calzada limpia props; aceras/mediana/márgenes solo si la celda no es `road` ni tiene edificio (cruces solos); árboles por hash; se detiene si un edificio pisa la calzada. `extendRoad` = `paintRoad('rural')` sobre eje recto.
- Tests: ancho de cada tipo; cruce no rompe la calzada previa; árboles deterministas; no toca celdas con `building`; `roadCost = celdas × coste`.
- Trampas: `walkCost`/`isRoad`/`speedAt` miran `terrain === 'road'` — no nuevos `Terrain`. `roadKind` en serialize/deserialize/applyPatch.

**H2.2 Herramienta de vías + acción `road` + render de tipos**
- Archivos: M `tools.ts`, M `ghost.ts` (preview L con celdas verdes/rojas y coste), M `actions.ts` (`road`: `paintRoad` en sim.grid, `index.rebuild()`, `roadsExtended++`, evento `roadBuilt{byPlayer}`), M `render/terrain.ts` (acera `PALETTE.path`; mediana hierba; `LAYER_Y` acera), M `toolbar.ts` (submenú, street T2, avenue T3), M `controlBar.ts`.
- Aceptación: arrastrar A→B traza L; sobre edificio, tramo hasta el bloqueo; cruces limpios; coches usan la vía nueva.
- Tests: `road` registrada y reproducible; `index.roadCells` crece exactamente `laid`.
- Visual: sandbox con rural, street y avenue cruzándose (§4).
- Trampas: bulldoze de vía → "tramo" (celdas `road` conectadas del mismo `roadKind` hasta el cruce).

**H2.3 Capa de zonas: dato, acción, pincel y overlay**
- Archivos: M `grid.ts` (`Cell.zone`), M `actions.ts` (`zone` rect solo en celdas existentes no `road/water/building`), M `tools.ts` (arrastre rectangular; Shift borra), C `src/world/render/zones.ts`, M `palette.ts` (`zoneR/C/I/A/P` pastel), M `toolbar.ts`, M `main.ts`.
- Pasos: `ZonesLayer` por chunk (patrón `buf/emit/finish` de `terrain.ts`) a y=0.13, `transparent, opacity 0.45, depthWrite:false`; `refreshCells(cells)` solo chunks tocados; visible solo con herramienta zona o `V`. Fantasma del rectángulo = mismo shader a 0.7.
- Aceptación: pintar/borrar por arrastre; sobreviven a save/load; invisibles fuera de herramienta.
- Tests: `zone` sobrevive serialize/deserialize/applyPatch; `zone` sobre vía no zonifica.
- Visual: 5 zonas junto a una calle; F3 ≤1 draw call por chunk visible.

**H2.4 Política de crecimiento y portes de la rama rescatada**
- Archivos: M `growth.ts` (`findParcel(grid, itemId, center, rng, policy, opts)`), M `simulation.ts` (`growthPolicy`, `buildingsSinceRoad/STREET_EVERY` de `eeeaab4`, `residentialChoices` + fallback de `43f2719`), M `actions.ts` (`setPolicy`), M `devPanel.ts`, M `sim.test.ts`.
- Pasos: `zoneForRole(role)`. En `findParcel`: `zoned` = huella 100 % en zona del rol; `zonesOnly` descarta si no; `preferZones` `score -= 20`; `free` como hoy. `maybeGrow`: `zonesOnly` ⇒ nunca `maybeExtendRoad` ni `STREET_EVERY`; `preferZones` ⇒ reactivo; `free` ⇒ reactivo + proactivo. Centro = centroide de zonas si no hay edificios.
- Tests: puros con grid sintético (zonesOnly ⇒ parcela 100 % en R; C con demanda commerce ⇒ shop en C; sin zona ⇒ null; preferZones elige zonificada aunque esté 6 celdas más lejos; `residentialChoices` nunca supera el tier).
- Visual: sandbox, zonas R junto a calle, `zonesOnly` a ×8: casitas solo dentro, fachada a la calle.

**H2.5 Demanda RCI continua y barras**
- Archivos: M `growth.ts` (`demandLevels(d): {R,C,I}` en [0,1]), M `simulation.ts` (`cityStats.demand`), M `toolbar.ts` (3 barras).
- Pasos: R = clamp(0.5·(1 − freeHousing/max(1, pop/4)) + 0.5·atractividad − penalización si pop ≥ K); C = clamp((pop/shops − 10)/10) con prosperidad; I = clamp(unemployment/0.35) + (openJobs ≤ 0 ? 0.3 : 0). `computeDemand` sigue decidiendo QUÉ; `demandLevels` informa.
- Tests: monotonía (más `freeHousing` ⇒ R no sube; más paro ⇒ I sube; acotado).

**H2.6 Acceso a vía, alertas y abandono** — ✅ implementado
- Archivos: M `worldIndex.ts` (`SimBuilding.roadAccess` — anillo ±3 con `road/path`), M `simulation.ts` (`noAccessSince: Map<key, day>`; a `ABANDON_DAYS=10` → `abandonBuilding`: `rehouseOrEmigrate`, despido, `BuildingRef.abandoned = true`, evento `buildingAbandoned`), M `grid.ts`, M `worldView.ts` (tinte `PALETTE.abandoned` al hornear: ×0.75 y desaturar), M `cityHud.ts` (chip si > 0), M `chronicle.ts`/`toasts.ts`.
- Tests: casa a 5 celdas de la vía ⇒ `roadAccess=false`; tras 10 días `abandoned` y pop conservada; re-trazar vía antes cancela.
- Visual: casita gris tras demoler su calle.
- Trampas: el abandonado ocupa huella; si recupera acceso, `abandoned=false` y `freeHousing` lo cuenta.

**H2.7 Jardín de hierba bajo edificios (render-only)** — ✅ implementado
- Archivos: M `growth.ts` (`paintYard`), M `main.ts` (en `built` del patch y en `worldReady`). `ConstructionSites` mantiene el grid fuera de la animación; el jardín se deriva en main tras `applyPatch` y antes de `refreshCells`.
- Trampas: nunca en `sim.grid` (cambia `walkCost` grass 1.6 vs field 2.4). Aplicar tras `applyPatch` y antes de `refreshCells`.

**H2.8 Playtest y gate H2**: 30 min ×8 `zonesOnly` (sandbox) + 30 min `free` (`?scene=farm`); capturas d0/d30/d80; F3 con overlay de zonas.

#### H3 — Dinero de alcalde

**H3.1 Costes, mantenimiento, ledger y débito al construir**
- Archivos: M `catalogData.ts` (`cost?`, `upkeepPerDay?`, `playerPlaceable?`), M `roads.ts` (`costPerCell`, `upkeepPerCell`), M `economy.ts` (`ledger`, `spendPublic(amount, category)`, `chargeUpkeep(index, roadCells)`), M `actions.ts` (`noMoney`, débito), M `simulation.ts` (pipeline: `economy.endOfDay()` → **`chargeUpkeep`** → `chargeRent` …), M `sim.test.ts`, C `scripts/economyProbe.ts`.
- Valores iniciales (calibrar con la sonda; a pop 100 el tesoro ingresa ~5 k/día): path 3/celda, rural 8, street 14, avenue 24; school 1500 (upkeep 60), clinic 800 (40), civic 3000 (80), police 1200 (50), fire 1200 (50), park 400 (8), plaza 600 (10). Privados `playerPlaceable:true` con `cost` = 3× cívico equivalente por celda; el crecimiento autónomo privado no cuesta.
- Tests: tras `place(school)`, `treasury` baja exactamente `cost` y `ledger.build` sube igual; `treasury < cost` ⇒ `noMoney` sin cambios; `chargeUpkeep` cobra Σ una vez/día; save incluye ledger.
- Trampas: el orden del cierre del día es load-bearing; cívicos autónomos gratis hasta H4.8.

**H3.2 Impuestos por sector**
- Archivos: M `economy.ts` (`taxRates {R:0.2, C:0.15, I:0.1}` sustituyen constantes en `payWage`/`settleShops`; `activityLevy` en `payWage` para `work/agriculture`: `gross · taxRates.I` acuñado → `ledger.taxI`), M `growth.ts` (`townAttractiveness` con `taxBurden` = media ponderada − 0.2, ×(1 − 0.6·max(0, burden))), M `actions.ts` (`setTax` clamp [0, 0.5]), M `protocol.ts`, M `sim.test.ts`.
- Tests: `payWage` con R=0.3 deja neto 0.7·bruto; atractividad decrece con la carga; fuera de rango ⇒ `invalid`; replay reproduce tasas.
- Trampas: mantener `TAX_RATE`/`CORP_TAX_RATE` exportadas como defaults.

**H3.3 Préstamos, quiebra y dividendo corregido**
- Archivos: M `economy.ts` (`loans`, `LOAN_TIERS = [{2000, 0.004, 40}, {5000, 0.006, 60}, {15000, 0.009, 80}]`, `takeLoan`, `serviceLoans()`, dividendo sobre `treasury − reserve − debt`, `bankrupt`), M `actions.ts` (máx 1 por tramo vivo; quiebra rechaza `place/road`), M `simulation.ts` (`serviceLoans` tras `chargeUpkeep`), M `growth.ts` (atractividad −0.15 si quiebra).
- Tests: préstamo sube `treasury` y `debt` igual; tras `days`, `debt ≈ 0` e `interest > 0`; dividendo no reparte por debajo de `reserve + debt`; en quiebra `place` ⇒ `bankrupt` pero `step()` sigue (pop > 0 a 5 días).
- Trampas: `payWage` cívico ya clampa a 0 (`economy.ts:206`); `payPensions` devuelve si `perHome ≤ 0`.

**H3.4 Panel de presupuesto**
- Archivos: C `src/ui/budgetPanel.ts` (tecla T; desglose por categoría; sliders R/C/I → `act(setTax)`; préstamos; sparkline 30 días de `treasury` en `CityStats.budget.history`), M `cityHud.ts` (tesoro rojo si quiebra, ámbar si deuda), M `theme.ts`.
- Visual: panel abierto; colores de paleta. Trampas: firma-diff a 4 Hz.

**H3.5 Conservación de dinero y replay con dinero**
- Archivos: C `src/sim/money.test.ts`, M `package.json`.
- Propiedad: `M(t) = Σwallets + Σtills + treasury`; `M(t) − M(0) == minted − leaked − build − interest + loanIn − loanOut` (±1e-6) en 10 días con 3 acciones (road, school, loan). `minted` = nómina privada + tasa I + pensiones acuñadas; `leaked` = `goodsImported + lifestyleLeft + wholesale externo`.
- Trampas: canalizar por `ledger` las 11 escrituras a `treasury` (lista en Parte A).

**H3.6 Menú de partida**
- Archivos: C `src/ui/startMenu.ts` (continuar (día N) / nueva partida con semilla / sandbox), M `main.ts`, M `save/save.ts`.
- Aceptación: sin save ⇒ nueva directa; con save ⇒ menú; `?seed=N` fuerza.

**Gate H3:** tabla de la sonda a 3 poblaciones, captura del panel, tests conservación/replay/save.

#### H4 — Servicios, felicidad y valor del suelo

**H4.1 Catálogo de servicios y sus mallas**
- Archivos: M `catalogData.ts` (`service?: {kind: 'education'|'health'|'police'|'fire'|'park'; radius}` sustituye `happiness`; nuevos `police` 4×4 T2, `fire-station` 4×4 T2, `park` 4×4 T1 rol `park`, `plaza` 4×4 T2 rol `park`, `playground` 2×2 T1 rol `park`; `school`/`clinic` ganan `service`; árboles `amenity: 1`), M `props.ts` (5 builders), M `catalog.ts`, M `showcase.ts`, M `worldIndex.ts` (`SimRole` gana `'park'`; helper `isUrban(role)` sustituye `role !== 'nature'` en `simulation.ts:800,925` y `worker.ts:98`), M `CATALOG.md`.
- Visual: `?scene=buildings` con los 5 nuevos (§4).
- Trampas: convención `props.ts` (centrado XZ, y=0, frente +Z). Parques bloquean (son `building`); sus senderos entran como `strollSpots`.

**H4.2 `sim/coverage.ts`**
- Archivos: C `src/sim/coverage.ts` (`computeCoverage(index): Map<key, mask>`; Manhattan entre centros ≤ radius; `RoadAccess` de H2.6), M `worldIndex.ts` (`SimBuilding.coverage`), M `simulation.ts` (`cityStats.coverage`), M `activities.ts`.
- Tests: casa a 8 de escuela radio 10 ⇒ Education; a 12 ⇒ no; máscara combinada; < 5 ms a 500 edificios.

**H4.3 Felicidad por hogar**
- Archivos: C `src/sim/happiness.ts` (`householdHappiness(input)` puro; pesos necesidades 0.35, cobertura 0.25 (educación solo con niños), impuestos 0.15, paro 0.10, enfermedad/duelo 0.10, industria <6 celdas 0.05), M `simulation.ts` (`happiness: Map` diario; `cityStats.happiness`; atractividad; emigración por felicidad < 0.25 sostenida 3 años), M `protocol.ts` (`CitizenInfoMsg.happiness`), M `inspector.ts`.
- Tests: monotonías; hogar sin servicios con R=0.5 acaba con presión migratoria (20 días).
- Trampas: solo en el cierre del día.

**H4.4 Valor del suelo**
- Archivos: C `src/sim/landValue.ts` (cobertura 0.4, parque/agua ≤6 0.2, centro 0.2 (Manhattan/60), industria ≤6 −0.15, street/avenue +0.1), M `simulation.ts` (`landValue: Map` diario; `avgLandValue`), M `economy.ts` (alquiler ×(1 + 0.5·landValue)).
- Tests: monotonías; alquiler mayor con más valor.

**H4.5 Densificación in situ**
- Archivos: M `catalogData.ts` (+`town-house` 3×3 cap 3 T2, `low-block` 4×3 cap 8 T3), M `props.ts`, M `growth.ts` (`DENSITY_LADDER`, `upgradeCandidate(grid, b, tier, landValue)` con `placementCheck` tratando las celdas del actual como libres, misma rotación), M `simulation.ts` (`maybeUpgrade()` 1/día entre viviendas con `landValue ≥ 0.6` y `households == capacity`; `razeBuilding` sin realojar + `placeBuilding` + `moveHomeKey` si cambia el ancla + `fillHome` para huecos + evento `buildingUpgraded` + `pendingBuilt`), M `main.ts`.
- Tests: residentes conservan `home` válido y `households ≤ capacity`; el previo no existe en el índice; con valor bajo nunca; el ladder nunca baja ni supera `sim.tier`.
- Trampas: claves `'ax,az'` (`households/wallets/pantry/prestige`) → `moveHomeKey` obligatorio.

**H4.6 `BuildingStatsMsg` y heatmaps**
- Archivos: M `simulation.ts` (`buildingStats(): Float32Array` stride 8), M `worker.ts` (cada 4º snapshot), M `client.ts`, C `src/world/render/overlay.ts` (`OverlayLayer` por chunk; modos `none|happiness|landValue|coverage|zones|traffic`; V cicla; `refreshFromStats` solo reescribe el atributo `color`), M `palette.ts` (`heatLow/Mid/High`).
- Visual: cada heatmap sobre `?scene=test-dev`; F3 +1 draw call por chunk visible.
- Trampas: buffer transferido; `Map` `[ax,az]`→índice de quad por chunk.

**H4.7 Alertas sobre edificios**
- Archivos: C `src/world/render/alerts.ts` (`InstancedMesh` pin cono+esfera, color por `AlertBit`; orientado al azimut; MAX 2000), M `main.ts`.
- Visual: pins sobre casas sin acceso, tienda sin empleados; bobbing cosmético.

**H4.8 Servicios autónomos con coste y `publicAutobuild`**
- Archivos: M `simulation.ts` (`maybeGrow` construye school/clinic/police/fire/park solo si `publicAutobuild === 'paid'` y `treasury ≥ cost`; si `'off'`, evento `serviceNeeded{kind}`), M `growth.ts` (`computeDemand` gana `police` (pop ≥ 60 sin cobertura ≥ 50 %), `fire`, `park` (felicidad < 0.5 sin parque)), M `budgetPanel.ts` (toggle), M `sim.test.ts`.

**Gate H4:** 3 heatmaps, un upgrade in situ con obra, parque en showcase, tests, F3 con overlay.

#### H5 — Tráfico y transporte

**H5.1 Carga de vía y congestión**
- Archivos: M `simulation.ts` (`traffic: Map<cellKey, load>`; en `stepWalk` por coche `+1`/tick; decaimiento ×0.9/hora; `speedAt` × `congestionFactor = max(0.35, 1 − load/capacity)`), M `roads.ts` (`capacity`), M `sim.test.ts`.
- Tests: factor decrece y nunca < 0.35; con 200 coches por un tramo el tiempo medio sube (dos configuraciones sintéticas).

**H5.2 `TrafficMsg` y overlay**
- Archivos: M `worker.ts` (cada 8 snapshots, pares `load > 0`), M `client.ts`, M `overlay.ts` (modo `traffic`).

**H5.3 Líneas de bus (lógica)**
- Archivos: C `src/sim/transit.ts` (`BusLine`, `Bus`, `stepBuses()` con `PathQueue`; velocidad `CAR_CELLS_PER_TICK_ROAD × 0.8 × congestión`; 1 bus por 12 celdas, mínimo 2), M `simulation.ts` (`vehicles`; `TravelMode 'bus'` en `planTrip` si hay parada a ≤6 celdas de origen y destino en la misma línea: caminar a parada, esperar = `doing` con condición de salida, a bordo = `moving` con `mode:'bus'` y posición del bus), M `actions.ts` (`busLine`: paradas en `road`), M `protocol.ts`.
- Tests: loop de 3 paradas se recorre; un ciudadano cerca de paradas elige `bus`; replay reproduce la línea.
- Trampas: sin fase nueva en el autómata; contador `busTrips`.

**H5.4 Bus y paradas: render y herramienta**
- Archivos: C `render/vehicles.ts` (bus `PALETTE.busBody` + cristal; paradas instanciadas), M `tools.ts` (clic en paradas, Enter cierra), M `toolbar.ts`.
- Visual: bus en loop en sandbox; pasajeros desaparecen al subir.

**H5.5 Distritos y políticas**
- Archivos: M `grid.ts` (`Cell.district?`), M `actions.ts`, M `tools.ts`, M `simulation.ts` (`districtPolicies: Map<number, {taxDelta, noIndustry, parksPriority, speed30}>`), C `src/ui/districtPanel.ts`.
- Tests: puros por política.

**H5.6 Tren**
- Archivos: M `grid.ts` (`Terrain 'rail'`, bloqueante), M `roads.ts` (`paintRail`), M `catalogData.ts` (`station` 3×6 T4 rol `infra`, `service: transit` radio 20), M `props.ts` (estación + loco + vagón), M `transit.ts` (`Train` sobre circuito cerrado, 1 loco + 3-5 vagones), M `growth.ts` (+0.1 atractividad), M `render/terrain.ts` (`LAYER_Y.rail`, `PALETTE.rail/ballast`), M `render/vehicles.ts`.
- Tests: `rail` no transitable; circuito cerrado detectado; el tren completa una vuelta.
- Visual: estación Zlín + tren a la hora azul.
- Trampas: revisar `LAYER_Y`, `baseColor`, `walkCost`, `canPlace`, `placementCheck`.

**Gate H5:** capturas tráfico/bus/distrito/tren; tick ≤ 50 ms con 1000 hab.

#### H6 — Puertas abiertas

- **H6.1 Sonido (T5.3)**: `src/audio/` (viento/pájaros/campana/murmullo por zoom; mute M; tras primer gesto). Sin determinismo; cero allocs/frame.
- **H6.2 Onboarding**: 5 tooltips máx. (`ui/onboarding.ts`, localStorage "visto").
- **H6.3 Perf**: F3 en escena real con overlays; LOD de ciudadanos por `zoomIndex`; hash espacial en `hireAndAcquaint`; medir hitch de `rebuildAllChunks`; `?stress=N`.
- **H6.4 Build + deploy**: `vite.config.ts` `base: '/city-bill/'`, workflow GitHub Pages, `npm run build` limpio.
- **H6.5 Docs**: README/hero, CATALOG.md, SIMULATION.md (acciones, patch, save; corregir `AGENT_STRIDE` 6→8), ROADMAP §1/§5.
- **Gate H6** = DONE final en URL pública en frío.

### B.5 Glosario de costuras y trampas para Sonnet

**Patrones a reutilizar**

| Necesitas | Reusa | Dónde |
|---|---|---|
| Malla plana por chunk (zonas, overlays) | `buf/emit/finish` + `cellFromKey` | `src/world/render/terrain.ts:40-113` |
| Instanciado con color por instancia | `crownMesh`/`fillMatrices`; `CitizenView.update` | `src/world/render/instances.ts:36-70`, `src/world/render/citizens.ts:150-200` |
| Hornear un `Group` en ≤2 mallas | `mergeBuildingsForChunk` | `src/world/render/buildings.ts` |
| Animación de obra | `ConstructionSites.start` + `beginConstruction/endConstruction` | `src/world/render/construction.ts:63-89` |
| Raycast a celda | `intersectPlane(ground)` + `worldToCell` | `src/ui/inspector.ts:117-127` → `core/pointer.ts` |
| Panel DOM con firma-diff | `CityHud.update` (`sig`) | `src/ui/cityHud.ts:100-120` |
| `<style>` inyectado | `ControlBar.injectStyle` | `src/ui/controlBar.ts:120-162` |
| Toggle que refleja estado real | `DevPanel` | `src/ui/devPanel.ts` |
| Colocar + alojar + contratar | `applyGrowth` (extraer `settleNewBuilding`) | `src/sim/simulation.ts:887-919` |
| Emigración digna | `stepEmigration` | `src/sim/simulation.ts:624-675` |
| Serializar economía | `Economy.serialize/restore` | `src/sim/economy.ts:525-569` |
| Guardado completo (referencia) | `git show 6ca4f31:src/sim/simulation.ts` / `:src/sim/citizens/social.ts` / `:src/main.ts` | historial git |
| Trama 2D / densidades / jardín | `eeeaab4`, `43f2719`, `3f731a2` | rama `rescate/construction-sector` |
| Continuar un RNG | `rng.state` → `createRng(state)` | `src/rng.ts:20-24` |
| RNG por coordenada | `createRng((cx*73856093) ^ (cz*19349663))` | `src/world/render/terrain.ts:55` |
| Test headless de N días | `runDays`/`TICKS_PER_DAY` | `src/sim/sim.test.ts:44-70` |
| Escenario mínimo | `seedFarm` | `src/world/seed.ts:130-160` |

**Smells → tarea que los salda**

| Smell | Ubicación | Tarea |
|---|---|---|
| `removeBuilding` 41×41 | `grid.ts:153-161` | H1.3 |
| `canPlace` acepta fuera de mundo y `path` | `grid.ts:126-136` | H1.3 |
| Umbral de arrastre 6 px duplicado | `inspector.ts:85`, `input.ts` | H1.4 |
| `css(hex)` ×4 | `cityHud.ts:16`, `controlBar.ts:15`, `toasts.ts:15`, `devPanel.ts:19` | H1.6 |
| `roadRng` del main; arbolado consume RNG general | `main.ts:96,119`; `simulation.ts:872`; `growth.ts:278-286` | H1.1 |
| El main re-ejecuta lógica de mundo | `main.ts:99-132` | H1.1 |
| `rebuildAllChunks` por estación/fiesta/cultivo | `worldView.ts:100-125` | H6.3 (no añadir disparadores) |
| Teclas 0-3 = velocidad | `main.ts:134` | H1.4 |
| `happiness` muerto en catálogo | `catalogData.ts:34,58-59` | H4.1 |
| Tiers CATALOG.md ≠ código | `simulation.ts:545` | Arranque (CATALOG) y H6.5 |
| `hireAndAcquaint` O(n²) | `simulation.ts:408-414` | H6.3 |
| `Economy.serialize` huérfano; `social.serialize` perdido | `economy.ts:525`; `social.ts` | H1.8 |
| Escrituras directas a `treasury` | 11 sitios (Parte A) | H3.5 |
| Filtros `role !== 'nature'` repetidos | `simulation.ts:800,925`, `worker.ts:98` | H4.1 |
| `ActionMsg.terrain` sin uso | `protocol.ts:112` | H1.2 |
| Toasts y toolbar compiten abajo-centro | `toasts.ts:79-80` | H1.6 |
| SIMULATION.md dice `AGENT_STRIDE = 6` (es 8) | `SIMULATION.md` §3.5 | H6.5 |

**Reglas de determinismo (toda tarea de sim)**
1. Nada de `this.rng` en `applyAction`; aleatoriedad estructural = hash de coordenadas + `seed`.
2. Iterar `Map`s solo si el orden no afecta; si afecta, `[...keys].sort()` (patrón `investInHomes`, `economy.ts:257`).
3. Toda escritura a `treasury` pasa por `ledger`.
4. Cada campo nuevo de `Simulation`/`Economy` entra en `SimSaveState` + test guardar→restaurar en la misma tarea.
5. Tests como propiedades estructurales, nunca umbrales tras N días de semilla fija.

**Reglas de render/perf (toda tarea visual)**
1. Colores solo de `palette.ts` con nombre semántico (`zoneR`, `ghostOk`, `heatLow`, `abandoned`, `busBody`, `rail`).
2. Capas nuevas = mallas propias por chunk o instanciadas; jamás `refreshChunkAt` para pintar datos.
3. Cero allocaciones por frame en `update()` (scratch como campos; patrón `citizens.ts`, `atmosphere.ts`).
4. Cada tarea visual termina con captura + checklist §4 + F3 con la capa activa.
