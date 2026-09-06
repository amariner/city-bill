# ROADMAP — Guía de ejecución para el agente

**city-bill** es un **city builder híbrido** para navegador (Vite + TypeScript + Three.js,
low-poly isométrico pastel): la ciudad **crece sola** con NPCs autónomos que viven, trabajan
y narran su saga en la Crónica, y el jugador **la dirige** como alcalde: calles, zonas,
colocar/demoler, presupuesto, impuestos, servicios, transporte y distritos. Este documento
es el plan maestro y está escrito para que un agente lo ejecute tarea a tarea.

**Rumbo vigente (reconciliado el 2026-09-04):** el modelo híbrido aprobado el 2026-09-02
(`docs/PLAN-CITY-BUILDER-HIBRIDO.md`, diseño detallado de cada tarea). Los hitos **H1-H5**
del plan ya están en el código; quedan **H6** (puertas abiertas) y **H7** (el pueblo se ve
pueblo). El ROADMAP anterior (fases T0-T6, MVP vivarium con hitos H0-H4 y su diario) está
congelado en `docs/ROADMAP-HISTORICO.md`: su numeración de hitos NO es la de este documento.

---

## 0. Protocolo del agente — LEER ANTES DE TOCAR CÓDIGO

1. **Orden estricto.** Trabaja el hito ABIERTO de §3 y nada más; dentro del hito, sus
   tareas en orden. No empieces una tarea si la anterior no cumple su aceptación.
2. **Una tarea, un ciclo:** implementar → `npx tsc --noEmit` limpio → `npm run test:fast`
   verde → preview (`.claude/launch.json`, servidor `city-bill`) → screenshot y checklist §4
   si cambia algo renderizable → marcar la casilla aquí → commit.
3. **La estética manda.** Si una feature empeora la viñeta, se revierte y se reintenta.
4. **Contratos de §1** inmutables salvo conflicto documentado en §6.
5. **Colores solo desde `src/palette.ts`**, con nombre semántico.
6. **Determinismo:** toda aleatoriedad de mundo/sim pasa por `createRng(seed)` o por hash
   de coordenadas + semilla. Prohibido `Math.random()`/`Date.now()` salvo FX cosméticos.
   Ninguna acción del jugador consume el RNG general (`applyAction` sin `this.rng`).
7. **Presupuesto por frame** (§1.5): comprobar en F3 tras cada tarea visual.
8. **Tests como propiedades estructurales**, nunca umbrales tras N días de semilla fija.
   La sonda larga (`sim.test.ts`, ~3 min) es una RED de regresión, no la especificación:
   un cambio espacial deliberado (calles, parcelas) PUEDE mover su trayectoria; en ese caso
   se rebasa la sonda con una entrada en §6 que nombre la causa y compare los contratos
   que cambian. Lo que nunca se rebasa: determinismo, conservación de dinero, replay,
   save→restore, presupuesto de tick.
9. **Suite:** `npm run test:fast` en cada tarea; `npm test` (con sonda larga) antes de cada
   push. La suite corre en CI antes del deploy: un push rojo no publica.
10. **Commits:** `H<hito>.<n>: <resumen>` por tarea; `docs:` para documentación. Al cerrar
    cada sesión: casillas al día, nota en §6 si quedó algo a medias, **push a `main`**.
11. **Gates.** Entre hitos: informe corto (qué se hizo, capturas, números F3, tests) y OK
    del usuario antes de abrir el siguiente. El DONE de §3.1 solo puede encoger.
12. **Un solo escritor:** sesiones locales sobre `main`; nada de ramas de larga vida.

---

## 1. Contratos de arquitectura

### 1.1 Mapa de módulos (real a 2026-09-04)
```
src/
  palette.ts, rng.ts, props.ts        # color único · RNG con semilla · mallas low-poly
  core/      renderer, camera(+Controller), loop, input, pointer, tools, debugHud
  world/     grid, catalog(+Data), placement, roads, growth, seed
    render/  worldView, terrain, buildings, instances, citizens, vehicles, construction,
             ghost, zones, overlay, alerts, districts, atmosphere
  sim/       simulation (orquestador), worker, protocol (frontera), client, clock,
             actions, economy, worldIndex, pathfinding, geometry, coverage, happiness,
             landValue, traffic, transit, contagion, health, grief, lifecycle, weather,
             preGrow, logics, citizens/{citizen, needs, brain, activities, social}
  ui/        toolbar, controlBar, cityHud, inspector, chronicle, toasts, budgetPanel,
             districtPanel, startMenu, onboarding, devPanel, theme
  audio/     ambient
  save/      save
```
Mapa de la sim: `SIMULATION.md`. Catálogo: `CATALOG.md` (espejo de `catalogData.ts`).
Historia de la investigación de la sim: `RESEARCH.md`.

### 1.2 Rejilla
- 1 celda = **2×2 m**. Chunk = **64×64 celdas**. Coordenadas enteras `(cx, cz)`.
- Capas por celda: `terrain` (field/grass/water/road/path/rail), `roadKind`, `zone`,
  `district`, `building` (id, rot, ancla, `fw/fd`, `housingCapacity`, `visualId`,
  `abandoned`), `prop`.
- El mundo lógico vive en el grid del **worker**. El grid del main es una RÉPLICA que
  solo se muta aplicando `gridPatch` (journal de celdas del worker). El render nunca
  ejecuta lógica de mundo; lo único que deriva por su cuenta es cosmético (`paintYard`).

### 1.3 Separación render ↔ simulación
- Sim en Web Worker, tick fijo de 250 ms de juego (`clock.ts`). Frontera única:
  `sim/protocol.ts`. Nada de THREE/DOM en `src/sim/`; nada de lógica de sim en render.
- main→worker: `init{seed, gridJson, preGrowDays?|saveBlob?}`, `action{seq, action}`,
  `setSpeed`, `save`, `queryCitizen`, `dev`.
- worker→main: `worldReady`, `snapshot` (agentes `AGENT_STRIDE=8`, vehículos, stats),
  `gridPatch{cells, built, razed}`, `actionApplied|actionRejected`, `event`,
  `buildingStats`, `traffic`, `saveBlob`, `citizenInfo`.
- El main interpola entre snapshots a 60 fps.

### 1.4 Acciones, eco y replay
- Toda mutación del jugador es un `PlayerAction` enviado con `seq` por `SimClient.act()`.
  El worker valida (`placementCheck`, dinero, tier), aplica, registra `{seq, tick, action}`
  y contesta. Acciones entre sub-ticks, nunca dentro de `step()`.
- Rejugar `actions[]` sobre la misma semilla reproduce `snapshot()`, `grid.serialize()` y
  la masa monetaria. Test por hito.

### 1.5 Dinero
- Una caja (`Economy.treasury`) + `ledger` por categoría; toda escritura pasa por
  `changeTreasury`/`spendPublic`. Público cuesta `cost` al colocar y `upkeepPerDay` en el
  cierre del día; privado brota gratis en zonas y paga impuestos R/C/I. Quiebra bloquea
  construir; la ciudad sigue viva. Propiedad de conservación en `money.test.ts`.

### 1.6 Zonas, política y distritos
- `Cell.zone` (R/C/I/A/P) es preferencia, no bloqueo; `growthPolicy` ∈
  `free|preferZones|zonesOnly`. Cívicos por `publicAutobuild` (`off|paid`).
- Distritos con políticas locales (`noIndustry`, `parksPriority`, `speed30`, `taxDelta`).

### 1.7 Canal de overlays
- `buildingStats` y `traffic` viajan en arrays transferibles a ≤1 Hz, fuera del snapshot.
  Capas propias por chunk (`zones`, `overlay`, `alerts`, `ghost`, `districts`): nunca
  `rebuildAllChunks`/`refreshChunkAt` para pintar datos.

### 1.8 Guardado
- `localStorage` `city-bill:save:v2:<seed>` = `{version, seed, day, savedAt, actions,
  simState}`; `simState` opaco al main. Autosave 10 s + `beforeunload`. Regla: cada campo
  nuevo de `Simulation`/`Economy` entra en `SimSaveState` + test guardar→restaurar en la
  misma tarea. Escenas `farm|test-dev|sandbox|buildings|rail` nunca cargan ni guardan.

### 1.9 Presupuestos de rendimiento (portátil medio)
- ≤ **200 draw calls** · ≤ 16 ms/frame · tick ≤ 50 ms con 1000 ciudadanos · GPU ≤ 300 MB ·
  cero allocaciones por frame en el bucle caliente. Base medida (2026-09-04, seed 4242 d80):
  60 fps, 109 draw calls, 123k triángulos; `?stress=500` mantiene 60 fps.

### 1.10 Puntero y teclas
- Con herramienta activa el botón izquierdo es de la herramienta (pan: central/derecho +
  WASD); con `none`, todo como antes. **B** construir · **R** vías · **Z** zonas · **X**
  demoler · **U** distritos · **T** presupuesto · **V** overlays · **Tab** rotar · **Esc**
  cancelar (antes que cerrar inspector) · **C** Crónica · **F** seguir · **M** mute ·
  **0-3** velocidad · **F3** rendimiento.

### 1.11 Dirección de arte
Paleta pastel desaturada, flat shading sin texturas, sol cálido lateral con sombras largas
+ ambiente frío, ortográfica isométrica (azimut 45°, elevación 32° fija), variación
procedural en todo lo repetido, arbolado automático con huecos en márgenes de vía.

---

## 2. Punto de partida (2026-09-04)

- ~16.6k líneas de TS de producto + ~4.1k de tests; 33 archivos de test, ~700 aserciones,
  `npm test` ≈ 3,5 min (la sonda larga sola, ≈3 min). `tsc` y `npm run build` limpios.
- **Hecho (H1-H5 del plan híbrido, 2026-09-03/04):** journal `gridPatch`; acciones con
  eco y replay; `placementCheck`; puntero y herramientas; fantasma; toolbar y sandbox;
  bulldoze con realojo; guardado v2 con menú de partida; vías de 4 tipos con herramienta;
  zonas pintables con overlay; política de crecimiento; demanda RCI; acceso a vía y
  abandono; jardines; costes, mantenimiento, ledger, impuestos por sector, préstamos y
  quiebra; panel de presupuesto; conservación monetaria; catálogo de servicios; cobertura;
  felicidad; valor del suelo; densificación in situ (escalera completa hasta bloque Zlín);
  heatmaps; alertas; servicios autónomos de pago; congestión y overlay de tráfico; líneas
  de bus con flota; distritos y políticas; tren con estación Zlín.
- **Hecho de H6:** sonido generativo (6.1), onboarding (6.2), LOD de ciudadanos y banco
  `?stress=N` (parte de 6.3), workflow de GitHub Pages y `base` (6.4, primer push el
  2026-09-04). Estaciones con paleta continua y nieve en tejados.
- **Deuda conocida:** `hireAndAcquaint` vuelve a ser O(n²) en el cierre del día
  (`simulation.ts`, "vecinos de vista"); el crecimiento autónomo tiende a RIBBON (dos
  ejes y un racimo) y ~10 sondas de trama 2D se revirtieron (ver §6 y el histórico);
  `findParcel` consume el RNG vital por candidato, por lo que cualquier calle nueva
  altera nacimientos, contagios y economía; sin playtest largo de 30 min; los gates de
  H1-H5 no se celebraron formalmente (el usuario ordenó continuar el 2026-09-04).

---

## 3. Hitos — el rumbo vigente

### 3.1 Definición de DONE de la v1 pública (solo puede encoger, con OK del usuario)

1. [~] **URL pública viva** en GitHub Pages (`https://amariner.github.io/city-bill/`):
   carga en frío, 60 fps en portátil medio, CI verde. *Push hecho el 2026-09-04; falta
   la validación en frío desde otra máquina.*
2. [x] **Arranque en día 0** con la fundación como primer beat; `?seed=N`, `?days=N`,
   semilla visible y "nueva partida".
3. [x] **El jugador dirige**: vías, zonas, colocar/demoler, presupuesto e impuestos,
   servicios, buses, distritos, tren; todo registrado, rejugable y guardado.
4. [x] **Sonido generativo** y **onboarding** no modal.
5. [ ] **El pueblo se ve pueblo**: en `free` desde una granja, a d80 hay trama 2D
   (≥ 3 calles con ≥ 2 manzanas cerradas) y mezcla de densidades; el arco aldea→villa
   pasa el checklist §4; playtest de 30 min a ×8 sin fealdad ni atasco.
6. [x] **Contrato §1.9 verificado** en la escena real (F3) y con `?stress=500`.
7. [ ] **Higiene**: `tsc` limpio, suite verde, docs al día (README, CATALOG, SIMULATION).

**Fuera de la v1** (post-v1, decisión 2026-09-02): electricidad/agua, PWA/táctil, modo
foto, tractores, página itch.io.

### 3.2 Hitos cerrados (detalle de tareas en `docs/PLAN-CITY-BUILDER-HIBRIDO.md` §B.4)

- [x] **H1 Cimientos de la agencia** (H1.1-H1.8) — commits `6bd16cc`…`049c9dc`.
- [x] **H2 Calles y zonas** (H2.1-H2.7) — `bd0446e`…`cb454b3`. *H2.8 (playtest) pasa a H7.*
- [x] **H3 Dinero de alcalde** (H3.1-H3.6) — `2acba46`…`ab0525e`.
- [x] **H4 Servicios, felicidad y valor del suelo** (H4.1-H4.8) — `abd5aaf`…`cc7c06c`.
- [x] **H5 Tráfico y transporte** (H5.1-H5.6) — `1900629`…`1c9b6ad`.

### 3.3 H6 — Puertas abiertas *(ABIERTO)*

- [x] **H6.1 Sonido** (`src/audio/ambient.ts`): viento, pájaros, campana, murmullo de
  charlas reales; volumen por zoom; M; tras el primer gesto; cero allocs/frame.
- [x] **H6.2 Onboarding** (`ui/onboarding.ts`): 4 pistas no modales, persistidas.
- [x] **H6.3 Rendimiento.** LOD lejano de ciudadanos, `?stress=N`, medición F3, y
  `SocialSystem.acquaintNeighbours` (hash espacial, mismo resultado y orden que el
  barrido O(n²); 3000 hogares en ~5 ms; test A/B en `social.test.ts`).
- [~] **H6.4 Build + deploy.** Workflow `.github/workflows/deploy-pages.yml` (suite +
  build + Pages), `base` `/city-bill/` en CI. Primer push el 2026-09-04: suite y build
  verdes en Actions, pero `configure-pages` falló porque Pages no estaba activado en el
  repo; se añadió `enablement: true` al paso. La revisión del 2026-09-05 confirma que
  el último run (33891762322) se detuvo antes del build por tres tests de simulación
  heredados (H6.7); el log tardó 75 min, no los ~3,5 min que estimaban estas notas.
  *Pendiente:* suite/Actions verdes y validación pública en frío.
- [ ] **H6.5 Docs.** README (controles y modos al día, hero actual), CATALOG (tiers
  25/80/200 y entradas de H4/H5), SIMULATION (acciones, patch, save, `AGENT_STRIDE=8`).
- [~] **H6.6 Usabilidad (ampliación autorizada el 2026-09-04).** Catálogo por categorías
  con costes, mantenimiento, capacidad y bloqueos; estación accesible; atajos sin
  conflicto; HUD y paneles adaptables; necesidades priorizadas desde el worker.
  Implementado: 38/38 archivos de la suite rápida verdes, build limpio y capturas
  a 1280, 652 y 390 px. Pendiente: cierre de la suite completa y commit.
- [~] **H6.7 Reconciliar las sondas heredadas de H7.2.** El run 33891762322 falla
  en tres expectativas antiguas de cuarentena, capacidad fija y dinastías. Sustituir
  las comparaciones sin control causal por propiedades del sistema, documentar
  el nuevo límite por tier y validar la suite completa antes de publicar.
- [ ] **Gate H6:** URL pública recorrida en frío con el usuario + números F3 + suite.

### 3.4 H7 — El pueblo se ve pueblo *(siguiente)*

> El único punto del DONE que sigue abierto. Diez sondas del 2026-09-04 (histórico §6)
> fallaron por la misma razón: cada calle nueva cambia el orden de `findParcel`, consume
> el RNG vital y dispara una ráfaga de obras; la sonda larga lo castiga. H7 ataca las
> causas en este orden, con criterio de paso explícito, en vez de otra cadencia fija.

**Métricas de H7** (puras, en `world/growth.ts`, cubiertas por test):
`layoutMetrics(grid)` → `{aspect, blocks, streets, buildingsPerDay}`: `aspect` = lado
largo / lado corto de la caja de anclas urbanas (hoy ≈1,65 en seed 4242 d80; objetivo
≤ 1,35); `blocks` = manzanas cerradas del grafo vial (objetivo ≥ 2 en d80); `streets` =
tramos de vía distintos (objetivo ≥ 3); tope de **4 obras/día** en media móvil de 7 días.

- [x] **H7.1 RNG espacial aislado.** `findParcel` ya no recibe RNG: el desempate es
  `hashCoord01(ax, az, seed ^ rot)` (`rng.ts` es la fuente única del hash de coordenada;
  `roads.ts` la reutiliza). Test: misma semilla ⇒ misma parcela; el desempate varía con
  la semilla. La sonda larga se rebasó (§6).
- [x] **H7.2 Escalera de demanda sin bloqueo.** Diagnóstico con `scripts/layoutProbe.ts`
  (nueva sonda: hab/edificios/vías/obras por día/`layoutMetrics`/demanda/eventos): la
  ciudad base se PARABA en el día 10 (24 edificios en 70 días) porque `computeDemand`
  devolvía UNA demanda y una clínica impagable bloqueaba todo; y con otro desempate se
  desbocaba (94 parques para 72 hab.). Hecho: `computeDemands` devuelve la lista
  priorizada y `maybeGrow` atiende la primera que puede (dinero, parcela); los
  servicios autónomos solo se levantan donde cubren ≥1 hogar sin cubrir (prefieren
  cubrir más) y con tope de uno por cada 8 viviendas; las vías solo se abren por demanda
  privada; `findParcel` no tapa los extremos de una vía (así los cabos se prolongan);
  tope de **3 obras/día** (`MAX_BUILDS_PER_DAY`, guardado); inmigración diaria a
  viviendas vacías por atractividad (T4.3 completa; antes solo llegaban con la obra
  nueva y el pueblo moría de viejo); `freeHousing` ignora viviendas sin acceso (un
  hueco inaccesible apagaba la demanda residencial); la demanda de empleo cuenta
  parados en PERSONAS (un parado de 9 adultos dejaba a la aldea sin demanda de empleo
  ni de vivienda: punto muerto del arranque); el lugar de trabajo se dimensiona al paro
  (un parado ⇒ tienda, no fábrica); la capacidad de carga K deja de ser fija (120):
  con inmigración el pueblo superaba el techo y la natalidad se anulaba (cero
  nacimientos en 100 días). Se probó K atada a la vivienda (243 hab. en 20 días) y al
  empleo (728 en 60): espirales sin freno. Queda K por ESCALONES de tier
  (`CARRYING_CAPACITY_BY_TIER` 120/160/260/400): cada meseta supera el umbral del tier
  siguiente y la meseta final es 400. Resultado en seed 20260703/42: 400 hab. y 83
  edificios a d60 (antes 92/24 y parón). *Deuda H7.4:* el arranque es rápido (aldea →
  ciudad en 30 días); calibrar ritmo (3 obras/día, `IMMIGRATION_RATE`) en el playtest.
  Tests: `growthLadder.test.ts` (12) + `growth.test` (cabos, métricas, K).
- [ ] **H7.3 Trama proactiva y manzanas.** Con H7.2 el pueblo ya crece sin parar, pero
  sigue siendo tira: en la granja 16 vías para 47 edificios y `blocks = 0`. Diseño:
  al pintar cada vía (semilla y extensiones) se reservan **corredores** deterministas
  cada 14 celdas, a lados alternos (ancho 5, fondo 12, puro: `planCorridors(grid, seed)`
  en `roads.ts`); `findParcel` no pisa corredores; cuando la demanda privada se bloquea,
  la ramificación usa el corredor libre más cercano al centro (siempre despejado por
  construcción) y, si dos cabos quedan a ≤ 10 celdas, se cierra la manzana. Menos vías,
  más cortas, y manzanas reales. *Aceptación:* `layoutMetrics` en seed 4242 y granja 42
  a d80: `aspect ≤ 1,35`, `blocks ≥ 2`, `streets ≥ 3`, y ≤ 1 vía por cada 4 edificios;
  capturas d0/d30/d80 pasan §4; F3 dentro de §1.9. Repetir en 3 semillas más.
- [ ] **H7.4 Playtest** (antiguo H2.8): 30 min ×8 en `free` desde `?scene=farm` y 30 min
  `zonesOnly` en sandbox; anotar en §6 fealdades, atascos y ráfagas; corregir.
- [ ] **Gate H7 = DONE nº 5:** capturas del arco + métricas + sonda larga rebasada y verde.

### 3.5 Post-v1 (no abrir sin gate)
Modo foto (UI oculta, export PNG 4K) · PWA/táctil · tractores en campo · página itch.io ·
electricidad/agua (descartado salvo decisión nueva) · tren con varias líneas.

---

## 4. Checklist visual por screenshot (obligatorio en tareas visuales)
- [ ] Solo colores de `palette.ts`; nada saturado ni brillante.
- [ ] Sombras largas, suaves y coherentes (una sola dirección de sol).
- [ ] Nada se repite exacto: variación visible en árboles/casas contiguas.
- [ ] Vías con margen verde y arbolado con huecos; cruces limpios.
- [ ] Silueta legible a zoom lejano (patchwork beige + parcelas verdes + árboles oscuros).
- [ ] UI no tapa la viñeta; overlays solo con herramienta o V.
- [ ] 60 fps y draw calls dentro de presupuesto (F3).

## 5. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Doble lógica sim/render diverge | `gridPatch` única vía de mutación del render grid; test de gemelo tras N patches |
| Una acción rompe el determinismo | Acciones entre sub-ticks; `applyAction` sin `this.rng`; replay por hito |
| La sonda larga bloquea todo cambio espacial | Regla §0.8: rebase documentado; contratos como propiedades A/B |
| El crecimiento autónomo genera ciudades feas o ráfagas | H7: métricas explícitas + presupuesto de frente + checklist §4 |
| Costes/overlays comen draw calls | Capas por chunk visibles solo con herramienta; medir en F3 |
| Save incompleto pierde estado en silencio | Campo nuevo ⇒ `SimSaveState` + test en la misma tarea |
| Dos documentos de rumbo | Solo este ROADMAP manda; el plan detalla, el histórico consulta |
| Scope creep | Nada fuera de §3 sin añadirlo aquí primero |

## 6. Diario del agente

- 2026-09-06 — **H6.6, integración solicitada por el usuario.** Catálogo de
  `playerPlaceable` por categorías con precio, mantenimiento, capacidad y estado;
  estación Zlín accesible; distritos en U, formularios protegidos frente a atajos;
  HUD principal compacto y paneles adaptables. `CityStats.needs` expone hasta tres
  prioridades del worker, con causa, impedimento conocido y destino de interfaz.
  `growthDemandInput` comparte datos con el crecimiento y descuenta escuelas
  abandonadas. Sin nuevo estado persistente; lectura, guardado y determinismo
  cubiertos en `cityNeeds.test.ts`. Capturas del 09-05 a 1280×720, 652×820 y
  390×844: paleta, sombras, variación, márgenes y silueta preservados; catálogo
  accesible por scroll y controles visibles. Granja 42 de d0 a d3 a ×8: de 3 a 16
  vecinos, 60 fps/43–49 draw calls en las muestras, consola sin errores. No equivale
  al playtest largo de H7.4. F3 muestra ahora el multiplicador real y se aparta del
  botón de necesidades. Build y 38/38 pruebas rápidas verdes el 09-06.
  Comprobación final del build de producción: arranque limpio y F3 ×8 correcto;
  muestra de 30 fps/43 draw calls mientras corría la suite larga. Esta comprobación
  de carga no certifica rendimiento sostenido ni sustituye las medidas anteriores.

- 2026-09-06 — **H6.7, rebase explícito de tres sondas de H7.2 (§0.8).** El último
  CI de `e6ea82c` reportó cuarentena 141/157 enfermos, poblaciones 370/409/412 y
  ninguna dinastía a d60. Comparar picos de dos ciudades con urbanismo, población
  e inmigración divergentes no aísla la cuarentena: `quarantine.test.ts` prueba
  los mismos contactos con/sin aislamiento, contagio efectivo, sanos y umbral en
  ambos órdenes del par. Se conserva la sonda de oleadas y supervivencia.
  `lineage.test.ts` prueba parentesco real frente a coincidencia de apellido,
  umbral 7/8, evento único, restauración y extinción; se conserva la sonda de
  nacimientos/herencia, pero no se exige una estirpe de ocho miembros en una fecha
  fija. La cota poblacional usa K del tier (120/160/260/400), conservando el margen
  relativo anterior de 1,5; no se modifica la sim para satisfacer estas sondas.
  Se mantienen dinero, replay, guardado, determinismo y límite de tick. El benchmark
  social mantiene 25 ms con mediana de cinco muestras calientes y ciudadanos nuevos
  por muestra; equivalencia con el barrido cuadrático intacta. El runner usa el
  loader de tsx sin socket IPC y guarda logs completos en el directorio temporal.
  La ejecución anterior se interrumpió; suite completa reiniciada antes del push.

- 2026-09-04 (Codex, desarrollo continuo autorizado): el usuario pide avanzar
  sin parar hasta que lo indique, tras la revisión de interfaz, jugabilidad y
  autonomía. Se prioriza una iteración de usabilidad antes de retomar H7.3;
  esta instrucción permite continuar entre iteraciones sin solicitar otro gate.
  Alcance actual: catálogo informativo y estación accesible, atajos sin conflicto,
  disposición adaptable y diagnóstico de necesidades. No cambia el DONE ni los
  contratos de simulación. Validación y commit pendientes.

> Fecha, tarea, decisiones no obvias, deuda, conflictos con §1. Entradas anteriores al
> 2026-09-04: `docs/ROADMAP-HISTORICO.md` §6.

- 2026-09-04 — **H7.1/H7.2, rebase de la sonda larga.** El desempate por hash y la
  escalera sin bloqueo cambian la trayectoria de todas las semillas: la sonda larga
  pasó de 11 contratos rotos (solo H7.1) a 1 tras corregir el punto muerto del
  arranque y atar K a la vivienda. Las roturas intermedias fueron DIAGNÓSTICO, no
  ruido: cada una señaló un mecanismo real (clínica impagable que bloqueaba todo,
  lluvia de parques, casas tapando cabos, hueco inaccesible contado como libre,
  natalidad nula sobre el techo fijo). Contratos que se rebasan y por qué: ver la
  entrada siguiente cuando cierre la sonda. Deuda anotada: el arranque es ahora rápido
  (6 → 80 hab. en 12 días con 3 obras/día) — calibrar en el playtest de H7.4; la
  tesorería crece sin freno (80k a d80: impuestos > gastos), fuera de H7.
- 2026-09-04 — **Reconciliación.** Auditoría del estado: los hitos H1.1-H5.6 del plan
  híbrido se implementaron el 09-03/04 sin reescribir el ROADMAP (Parte A del plan), y
  los commits posteriores reutilizaron la numeración del MVP vivarium; `npm test` estaba
  rojo (4 aserciones de `extendRoad` en `grid.test` sobre un grid sin terreno, obsoletas
  tras unificar el pintor de vías); 75 commits sin push desde el 08-14. Hecho: test
  arreglado, runner `scripts/test.mjs` (toda la suite, resumen único, `--fast` omite la
  sonda larga), push y primer run de Pages, ROADMAP reescrito (este documento; el anterior
  íntegro en `docs/ROADMAP-HISTORICO.md`), CLAUDE.md/CATALOG/SIMULATION al día. Decisión:
  H1-H5 se dan por cerrados por orden del usuario ("sigue con el desarrollo"); H6 queda
  abierto y H7 recoge la trama 2D con métricas y presupuesto de frente en vez de una
  cadencia fija. Regla nueva §0.8: la sonda larga es red de regresión, no especificación.
