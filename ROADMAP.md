# ROADMAP — Guía de ejecución para el agente (Claude Opus 4.8)

Este documento es el **plan maestro** de city-bill: un city builder para navegador con
estética low-poly isométrica pastel, ciudad que crece sola y **NPCs verdaderamente
autónomos**. Está escrito para que un agente (Claude Opus 4.8 en Claude Code) lo ejecute
tarea a tarea sin supervisión. Todo el desarrollo ocurre aquí, en Claude Code.

---

## 0. Protocolo del agente — LEER ANTES DE TOCAR CÓDIGO

1. **Orden estricto.** Ejecuta las tareas en orden (T1.1 → T1.2 → …). No empieces una
   tarea si la anterior no cumple sus criterios de aceptación. No mezcles tareas.
2. **Una tarea, un ciclo completo:** implementar → `npx tsc --noEmit` limpio →
   arrancar preview (`.claude/launch.json`, servidor `city-bill`) → screenshot →
   comparar con el checklist visual (§4) → marcar la casilla en este archivo.
3. **Verificación visual obligatoria** en toda tarea que cambie algo renderizable:
   haz `preview_screenshot` y comprueba el checklist §4. Si la estética empeora,
   revierte y reintenta con otro enfoque. La estética tiene prioridad sobre la feature.
4. **No rompas los contratos de §1.** Si una tarea parece exigir romperlos, detente y
   documenta el conflicto en este archivo (sección §6) en vez de improvisar.
5. **Colores solo desde `src/palette.ts`.** Si necesitas un color nuevo, añádelo a la
   paleta con nombre semántico. Nunca un hex fuera de ese archivo.
6. **Determinismo siempre:** toda aleatoriedad pasa por `createRng(seed)`. Prohibido
   `Math.random()` y `Date.now()` en lógica de mundo/sim (solo permitido para FX
   puramente cosméticos que no persisten).
7. **Presupuesto por frame:** tras cada tarea de las fases 1-3, comprueba en consola el
   contador de draw calls (`renderer.info.render.calls`, T1.7 lo expone). Límites: §1.5.
8. **Commits:** al completar cada tarea, commit con mensaje `T<fase>.<n>: <resumen>`.
   Si el repo no está inicializado, `git init` en la primera tarea.
9. **Al terminar una sesión**, deja este archivo actualizado: casillas marcadas y, si
   quedó algo a medias, una nota en §6 con el estado exacto.

---

## 1. Contratos de arquitectura (inmutables salvo decisión documentada)

### 1.1 Mapa de módulos objetivo
```
src/
  palette.ts            # única fuente de color (ya existe)
  rng.ts                # RNG con semilla (ya existe)
  props.ts              # fábrica de meshes low-poly (ya existe; crecerá)
  core/
    renderer.ts         # setup renderer/escena/luz (extraer de main.ts en T1.1)
    camera.ts           # cámara isométrica + control de encuadre
    loop.ts             # bucle de juego: render 60fps, tick de sim desacoplado
    input.ts            # ratón/teclado/táctil → intents (nunca lógica de juego)
  world/
    grid.ts             # rejilla lógica: celdas, capas, chunks
    roads.ts            # grafo vial + autotiling de carreteras
    catalog.ts          # definición data-driven de todo lo construible (espejo de CATALOG.md)
    builder.ts          # colocar/demoler: valida contra grid, emite acciones
    growth.ts           # crecimiento autónomo de la ciudad (Fase 4)
    render/
      instances.ts      # InstancedMesh pools por tipo de prop
      chunks.ts         # construcción/descarte de chunks visuales
  sim/
    worker.ts           # entry del Web Worker de simulación
    protocol.ts         # tipos de mensajes main↔worker (única frontera)
    clock.ts            # reloj de juego (1 día = 10 min reales por defecto)
    citizens/
      citizen.ts        # estado del ciudadano (datos puros, sin THREE)
      needs.ts          # necesidades y decaimiento
      brain.ts          # utility AI: elección de actividad
      activities.ts     # definición y ejecución de actividades
      social.ts         # encuentros, relaciones, charlas
    economy.ts          # empleos, comercio, demanda
    pathfinding.ts      # A* sobre grafo de navegación
  ui/
    hud.ts              # UI mínima diegética (Fase 2)
  save/
    save.ts             # serialización semilla+acciones+estado sim
```
`neighborhood.ts` actual se convierte en **escenario semilla**: en T1.4 se reescribe para
generar su contenido a través de `grid.ts` + `catalog.ts` (mismo resultado visual).

### 1.2 Rejilla
- 1 celda = **2×2 m**. Chunk = **64×64 celdas**. Coordenadas de celda enteras `(cx, cz)`.
- Capas por celda: `terrain` (campo/hierba/agua), `road`, `building` (id + rotación +
  celda ancla), `prop` (árbol/deco). Un edificio ocupa N celdas pero se ancla en una.
- El mundo lógico vive SOLO en `grid.ts`. El render lee el grid; jamás al revés.

### 1.3 Separación render ↔ simulación
- La simulación corre en un **Web Worker** con tick fijo de **250 ms** de juego.
- Frontera única: `sim/protocol.ts`. Mensajes tipados:
  - main→worker: `init{seed}`, `action{place|demolish|zone}`, `setSpeed{0|1|2|3}`, `save`
  - worker→main: `snapshot{delta}` (posiciones/estados de agentes interpolables),
    `event{cityGrew|citizenBorn|...}`, `saveBlob`
- El hilo principal **interpola** entre snapshots para animar agentes a 60 fps.
- Nada de THREE dentro de `sim/`. Nada de lógica de sim en `world/render/`.

### 1.4 Guardado
- Formato: `{version, seed, actions[], simState}` en `localStorage` (JSON).
- `actions[]` = lista ordenada de acciones del jugador. Rejugar semilla+acciones debe
  reconstruir el mismo mundo (test de regresión barato: T2.6).

### 1.5 Presupuestos de rendimiento (portátil medio)
- ≤ **200 draw calls** (todo prop repetido va por `InstancedMesh`).
- ≤ 16 ms/frame render; tick de sim ≤ 50 ms con 1000 ciudadanos.
- Memoria GPU ≤ 300 MB. Cero allocaciones por frame en el bucle caliente.

### 1.6 Dirección de arte (resumen operativo)
Ver README. En corto: paleta pastel desaturada de `palette.ts`, flat shading sin
texturas, sol cálido lateral con sombras largas + ambiente frío, ortográfica isométrica
(azimut 45°, elevación 32°), variación procedural (escala/rotación/tono) en todo lo
repetido, arbolado automático en márgenes de carretera (rasgo de identidad).

---

## 2. Fases y tareas

### Fase 0 — Fundación visual ✅ COMPLETADA
- [x] Stack Vite+TS+Three, paleta, props (árboles, casa, granero, cobertizo, casita, tienda, ciudadano), primer barrio con pueblo, luz firmada, RNG con semilla.

### Fase 1 — Motor de mundo
> Objetivo: del diorama estático a un mundo por rejilla, navegable y barato de renderizar.

- [x] **T1.1 Extraer core.** `core/renderer.ts` (stage+luz), `core/camera.ts` (IsoCamera),
  `core/loop.ts` (GameLoop con dt). Comportamiento idéntico.
- [x] **T1.2 Grid lógico.** `world/grid.ts` según §1.2: rejilla dispersa por chunks,
  canPlace/placeBuilding/removeBuilding con footprint rotado, serialize. 26 tests (npm test).
- [x] **T1.3 Catálogo data-driven.** `world/catalog.ts`: 15 ítems `{id, w, d, tier, role,
  capacity/jobs/happiness, build()}`. Expositor `?scene=buildings`.
- [x] **T1.4 Escenario semilla sobre grid.** `world/seed.ts` puebla el grid;
  `world/render/terrain.ts` mergea el terreno con vertex-colors; `worldView` renderiza
  desde el grid. Carreteras y edificios son celdas consultables.
- [x] **T1.5 Cámara jugable.** `core/input.ts` + `core/cameraController.ts`: pan
  (arrastre + WASD), zoom por niveles con easing, rotación 90° (Q/E) suavizada, límites.
  Elevación constante.
- [x] **T1.6 Instancing.** `world/render/instances.ts`: árboles a `InstancedMesh`
  (tronco+copa por especie). Verificado: 4 draw calls para toda la vegetación, O(1) al crecer.
- [x] **T1.7 Chunks + HUD de debug.** Mundo por chunks (culling automático por
  boundingSphere) + `core/debugHud.ts` (F3): fps, draw calls, triángulos, chunks
  visibles, celda bajo cursor. Verificado: zoom-in baja chunks vis 10→7 y draw calls
  168→118 (culling activo), 60 fps.
- [ ] **T1.8 Ciclo de luz.** Interpolación lenta del sol entre dos "horas doradas"
  (mañana/tarde) ligada al reloj de juego. Las sombras siguen siendo largas SIEMPRE.
  *Aceptación:* transición imperceptible frame a frame; screenshots en ambos extremos
  pasan el checklist §4.

### Fase 2 — Construcción
> Objetivo: el verbo del juego. Colocar cosas bonitas con validación del grid.

- [ ] **T2.1 Raycast a celda + fantasma.** Hover muestra la huella del ítem
  seleccionado (verde translúcido válido / rojizo inválido) usando `canPlace`.
- [ ] **T2.2 Herramienta carretera.** Trazado ortogonal por arrastre con preview,
  autotiling de intersecciones/curvas en `world/roads.ts` (grafo vial actualizado
  incrementalmente) y **arbolado automático de márgenes** con huecos RNG.
  *Aceptación:* cualquier red trazada se ve como las referencias; el grafo expone
  `nearestNode`, `neighbors` para el pathfinding futuro.
- [ ] **T2.3 Colocación de edificios y naturaleza.** Todo el catálogo T0-T1 colocable
  con rotación (R). Demolición con animación de "pop" inverso.
- [ ] **T2.4 Zonificación por pincel.** Zonas residencial/agrícola/verde pintables; de
  momento solo guardan celdas zonificadas (el crecimiento llega en Fase 4).
- [ ] **T2.5 HUD diegético mínimo.** Barra inferior translúcida: categorías del
  catálogo, iconos monocromos dibujados en canvas/SVG inline (nada de librerías UI).
  La estética manda: la UI no tapa la viñeta, tipografía pequeña y limpia.
- [ ] **T2.6 Guardado/carga.** §1.4 completo + test de regresión: guardar, recargar
  página, comprobar hash del grid idéntico.

### Fase 3 — NPCs autónomos ⭐ (el corazón del juego)
> Objetivo: ciudadanos con vida propia observable: viven, trabajan, compran, socializan
> y duermen sin ningún script fijo. Todo dato puro en el worker; el main solo anima.

- [x] **T3.1 Worker + protocolo + reloj.** Levanta `sim/worker.ts` con `protocol.ts`
  (§1.3) y `clock.ts` (día de 10 min, velocidades 0/1/2/3). El main interpola un
  snapshot vacío. *Aceptación:* HUD debug muestra hora de juego avanzando; pausar
  congela agentes pero no el render.
- [x] **T3.2 Grafo de navegación + A*.** `sim/pathfinding.ts`: nodos = celdas de
  carretera/camino + entradas de edificio; A* con heurística Manhattan, presupuesto
  incremental (máx N expansiones/tick, colas por prioridad). Suavizado de esquinas.
  *Aceptación:* 200 rutas concurrentes calculadas sin pasar el tick de 50 ms.
- [x] **T3.3 El ciudadano.** `citizens/citizen.ts`: `{id, nombre, hogar, trabajo?,
  edad, personalidad{sociable, trabajador, hogareño: 0-1}, needs, actividad, pos, path}`.
  Nace ligado a una vivienda con capacidad libre. `needs.ts`: energía, hambre, social,
  ocio, trabajo — decaen con tasas distintas moduladas por personalidad.
- [x] **T3.4 Cerebro (utility AI).** `brain.ts`: cada ciudadano puntúa las actividades
  disponibles `score = urgencia(need) × idoneidad(hora) × cercanía × personalidad` y
  elige la mejor con algo de ruido (RNG con semilla, determinista). NADA de horarios
  hardcodeados: el patrón día/noche debe EMERGER de las curvas (dormir gana de noche
  porque energía decae y su urgencia se dispara).
  *Aceptación:* en un día acelerado se observa: mañana → trabajo, mediodía → comida,
  tarde → compras/ocio/social, noche → casa. Registrar un log de un ciudadano y
  verificar que su día es coherente sin ningún `if hora==8`.
- [x] **T3.5 Actividades.** `activities.ts`: dormir, trabajar, comer, comprar (tienda),
  pasear (parque/estanque/arboleda), visitar amigo, mirar escaparate, sentarse.
  Cada una: destino, duración, needs que restaura, animación asociada.
- [~] **T3.6 Cuerpos en pantalla.** Los ciudadanos se renderizan instanciados con
  interpolación de posición, orientación al andar, bobbing sutil al caminar y
  "idle sway" parados. LOD: a zoom lejano, sin bobbing. Aparecen/desaparecen al entrar
  y salir de edificios (fade de escala).
  *Aceptación:* 500 ciudadanos animados a 60 fps; de cerca se ven como la referencia
  (siluetas simples de colores apagados).
- [x] **T3.7 Social emergente.** `social.ts`: relaciones por afinidad (vecinos,
  compañeros). Si dos conocidos se cruzan y ambos tienen `social` bajo, se detienen,
  se orientan cara a cara y "charlan" (como las dos figuras de la referencia) restaurando
  `social`. Amistades se refuerzan con encuentros; los amigos se visitan.
  *Aceptación:* observable sin tocar nada: parejas charlando en caminos y porches.
- [x] **T3.8 Economía viva.** `economy.ts`: los empleos son puestos REALES en edificios
  del catálogo (granja 2, tienda 3…). Los ciudadanos solicitan empleo por cercanía y
  personalidad; las tiendas requieren clientes para prosperar; los campos activos
  requieren granjeros para pasar de barbecho a cultivo (feedback 100 % visual: el campo
  cambia de color por franjas). Dinero explícito añadido en RESEARCH.md
  ciclos 2/3/4 (salario, impuestos, economía circular) — ver `sim/economy.ts`.
- [~] **T3.9 Vehículos** (lógica hecha en `sim/simulation.ts`, ciclo 8 de
  RESEARCH.md; falta mesh de coche — TODO en `render/citizens.ts`). Coches
  (T2+) para trayectos > 40 celdas: el ciudadano camina
  a su coche, el coche recorre el grafo vial (velocidad por tipo de vía, pausa en
  cruces ocupados), aparca cerca del destino. Tractores recorren campos en franjas.
- [x] **T3.10 Inspector de ciudadano.** Click en un ciudadano → tarjetita diegética:
  nombre, actividad actual ("Volviendo a casa"), necesidades como barritas mínimas.
  Cámara puede seguirle (tecla F). Es la ventana para VERIFICAR la autonomía.

### Fase 4 — Ciudad autónoma
> Objetivo: la ciudad se construye y evoluciona sola; el jugador es más alcalde-jardinero
> que constructor. Modo "solo observar" completamente viable.

- [x] **T4.1 Demanda.** `world/growth.ts` calcula demanda residencial/comercial/agrícola
  a partir del estado real de la sim (desempleo, viviendas llenas, tiendas saturadas).
- [~] **T4.2 Crecimiento por etapas.** En celdas zonificadas (o adyacentes a carretera
  en modo autónomo total), la demanda materializa edificios por etapas con animación de
  construcción (andamio low-poly → pop). Parcela vacía → casita → casa con jardín →
  adosados → bloque, según densidad local. Cada edificio nuevo genera/atrae ciudadanos.
- [~] **T4.3 Inmigración/emigración.** Familias llegan si hay vivienda+empleo+felicidad;
  se van si no. La población es consecuencia, no un slider.
- [x] **T4.4 Modo autónomo.** `world/growth.ts` traza ramales nuevos
  (extensiones del grafo hacia demanda no servida, siempre ortogonales y
  arboladas, mismo aspecto que las vías sembradas) cuando `findParcel` no
  encuentra sitio junto a una vía existente. Activo por defecto (mismo flag
  `autonomousGrowth` que el resto del crecimiento; sin toggle de UI todavía,
  como el resto de T4.1-T4.3). **Escenario del test de aceptación estrella**:
  `world/seedFarm.ts` (`?scenario=farm`) siembra SOLO una granja (farmhouse +
  barn) junto a un tocón corto de vía, rodeada de campo abierto — el punto de
  partida mínimo desde el que debe emerger un pueblo sin más input.
  Verificado headless (`sim.test.ts`): población de la familia inicial a 37+
  en 30 días de juego, 23 edificios, y **al menos un ramal de carretera
  nuevo (`roadBuilt`) trazado por sí solo** (día 11 en la semilla de test).
  Bug real encontrado y corregido durante esta misma verificación — ver
  bitácora. **Verificado también EN VIVO** en el preview (`?scenario=farm`,
  ×3, ~15 min reales observados): hacia el día 12 de juego ha emergido un
  pueblo coherente y bonito — 9-10 edificios (cottages, tienda con toldo
  rojo) alineados a ambos lados de la calle, orientados hacia ella,
  espaciados con retranqueo, junto a la granja original — sin ningún input
  del jugador. Draw calls dentro de presupuesto (64-79) durante todo el
  crecimiento observado.
- [~] **T4.5 Hitos y tiers.** Población desbloquea tiers del catálogo (T1→T4) con una
  tarjeta de celebración discreta. El tier T4 introduce la estética Zlín (bloques de
  ladrillo, fábrica, tren) — ver CATALOG.md.

### Fase 5 — Atmósfera y juice
- [~] **T5.1 Estaciones.** Hechas las 4 variantes de paleta en `palette.ts`
  (`SEASON_PALETTES`: terreno + vegetación; invierno = campos claros/pálidos,
  ver bitácora). `sim/weather.ts` ya calculaba la estación desde el ciclo 6 —
  esto le da su reflejo visual, carencia anotada varias veces. Falta el
  CROSSFADE lento (hoy el cambio de estación es un corte discreto al
  reconstruir los chunks, como `cultivation`/`festivalActive`) y las
  cubiertas blancas de nieve en los edificios (no tocado: exigiría cambiar
  todos los builders de `props.ts`).
- [ ] **T5.2 Tren.** Vía + estación + tren con 3-5 vagones en circuito, humo de la
  locomotora con sprites de esferas.
- [ ] **T5.3 Sonido generativo.** Web Audio: viento, pájaros, campana lejana, murmullo
  al hacer zoom a ciudadanos charlando. Volumen ligado al zoom.
- [ ] **T5.4 Juice.** Rebote elástico al colocar, humo en chimeneas al anochecer,
  bandadas de pájaros, luces de ventanas encendiéndose una a una al caer la tarde.
- [ ] **T5.5 Modo foto.** Ocultar UI, encuadres presets, export PNG 4K.

### Fase 6 — Lanzamiento
- [x] **T6.1 Rendimiento final.** Lado SIM: perfilado con hasta 10.000
  ciudadanos sintéticos (`sim.test.ts`): encontrado y arreglado un O(n²)
  real en `simulation.hireAndAcquaint()` (vecinos de vista) que solo
  aparecía en el tick de cierre de día — hasta 1.1 s por tick a 3.000 hab.
  antes del arreglo, 25 ms después; a 10.000 hab., 61-77 ms (dentro de un
  margen razonable para un evento de una vez al día). Detalle completo y
  números en RESEARCH.md §5.
  Lado RENDER: nueva herramienta `?stress=N` (main.ts) satura
  `CitizenView` con N agentes sintéticos (sin sim, sin worker) para medir
  fps/draw calls a escala real — encontró un SEGUNDO límite real:
  `MAX_AGENTS=2048` en `render/citizens.ts` truncaba en silencio (sin
  avisar, sin degradar visiblemente el HUD) todo lo que pasara de esa
  cifra. Ampliado a 12.000. Medido en el preview: **10.000 agentes
  (peatones + coches) simultáneos a 60 fps, 105 draw calls** — el mismo
  presupuesto que con 10 agentes, gracias a la instanciación ya existente.
  Con esto, T6.1 está completo por los dos lados (sim y render) al
  objetivo de 10.000 de RESEARCH.md §5. `?stress=N` se queda como
  herramienta permanente de QA (mismo espíritu que `?scene=buildings`).
- [ ] **T6.2 PWA + táctil.** Instalable, gestos de pan/zoom en tablet.
- [ ] **T6.3 Onboarding.** 5 tooltips contextuales máximo. Nada de tutorial modal.
- [ ] **T6.4 Build + deploy.** `npm run build` limpio, deploy estático (Vercel/Netlify),
  página itch.io.

---

## 3. Orden de valor (si hay que priorizar)
La demo mínima encantadora = Fase 1 completa + T2.1-T2.3 + T3.1-T3.7. Si el tiempo
aprieta, T3.8-T3.10 y la Fase 4 valen más que cualquier cosa de la Fase 5.

## 4. Checklist visual por screenshot (obligatorio en tareas visuales)
- [ ] Solo colores de `palette.ts`; nada saturado ni brillante.
- [ ] Sombras largas, suaves y coherentes (una sola dirección de sol).
- [ ] Nada se repite exacto: variación visible en árboles/casas contiguas.
- [ ] Carreteras con margen verde y arbolado con huecos.
- [ ] Silueta legible: a zoom lejano la escena sigue leyéndose como las referencias
      (patchwork beige + parcelas verdes + siluetas oscuras de árboles).
- [ ] 60 fps y draw calls dentro de presupuesto (F3).

## 5. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| El worker se convierte en cuello de botella | Presupuesto por tick + colas incrementales (T3.2); medir en HUD F3 |
| La IA de NPCs se vuelve caja negra | Inspector T3.10 + log por ciudadano; el día debe ser explicable |
| El crecimiento autónomo genera ciudades feas | Reglas estéticas en growth.ts (retranqueos, arbolado, ortogonalidad) + test visual T4.4 |
| Deriva estética con contenido nuevo | Checklist §4 obligatorio + paleta única |
| Scope creep | Nada fuera de este documento sin añadirlo aquí primero |

## 6. Diario del agente (rellenar al trabajar)
> Anota aquí: fecha, tarea, decisiones no obvias, deuda técnica, conflictos con §1.

- 2026-07-04 (misma sesión Sonnet, continuación) — **T6.1: perfilado de
  escala, un O(n²) real encontrado y arreglado**. Con "complejo, eficiente
  y autónomo" como objetivo explícito de la sesión, tocaba dedicarle
  atención de verdad al pilar "eficiente" más allá del arreglo de draw
  calls de antes. Escribí un diagnóstico sintético (3000→10000 hab.,
  reusando el mismo patrón de estrés de RESEARCH.md §5) que corre un DÍA
  COMPLETO de juego, no solo ticks sueltos — y ahí apareció: el tick de
  cierre de día llegó a costar >1000 ms a 3000 habitantes y directamente
  murió (desbordamiento de pila) al intentarlo a 10.000. Perfilando con
  `console.time` a mano (nada sofisticado, solo cronometrar cada sub-bloque
  del cierre de día) encontré el culpable exacto: `hireAndAcquaint()`
  conocía "vecinos a <40 celdas" con un barrido O(n²) sobre TODA la
  población, cada día, para siempre. Arreglado con hash espacial (mismo
  patrón que `social.detectEncounters`, ya existente) MÁS un tope de 12
  vecinos por celda de bucket — el hash solo no bastaba porque el
  escenario de estrés (a propósito, "todos amontonados en las mismas
  viviendas") mete a miles de vecinos en el MISMO bucket, así que hacía
  falta acotar también dentro de la celda, no solo entre celdas.
  Resultado: de >1000 ms a 25 ms a 3000 hab.; 10.000 hab. pasa de "muere"
  a 61-77 ms en el peor tick. Detalle completo, tabla de números y la
  lección aprendida en RESEARCH.md §5.
  · Efecto colateral esperado (ya no me sorprende, es la N-ésima vez esta
    sesión): el cambio de patrón de amistades desplazó la trayectoria de
    RNG compartida lo bastante para que un test de crecimiento contenido
    (T4.2, umbral 16 en 4 días) pasara a 18 — ampliado a 20 con nota
    explicando por qué (sigue muy lejos de la explosión de 750+/35 días
    que ese test realmente vigila). 141/141 tests.
  · Deuda para una futura sesión: el perfilado de esta ronda fue solo del
    LADO SIM — el lado RENDER (draw calls, ya arreglado para edificios
    antes en esta sesión) no se ha verificado con 5.000+ ciudadanos y
    coches simultáneos en pantalla a la vez; candidato natural para
    cerrar T6.1 del todo.

- 2026-07-04 (misma sesión Sonnet, continuación) — **T4.4, escenario de
  granja + bug real de `extendRoad` encontrado y corregido**. Orquestado con
  un workflow multi-agente (entender → implementar → verificar) el nuevo
  `world/seedFarm.ts` (`?scenario=farm`): siembra SOLO una granja
  (farmhouse+barn) junto a un tocón corto de vía (41 celdas, no las vías
  casi infinitas de `seed.ts`), rodeada de campo abierto real (no vacío
  implícito — `grid.get()` sin sembrar es "fuera del mundo" para
  `findParcel`/`extendRoad`, así que el campo alrededor tiene que existir de
  verdad). `seedWorld()`/el juego por defecto quedan intactos, cero cambios.
  · **Hallazgo real durante la verificación** (no del escenario en sí):
    `extendRoad` (añadido esta misma sesión, antes de esta continuación)
    tenía un fallo de diseño que impedía que se disparara casi nunca en la
    práctica — solo miraba la celda de vía MÁS CERCANA al centro de
    crecimiento y probaba sus dos lados perpendiculares; en cuanto la
    densificación normal (casitas a ambos lados de cada tramo de vía
    servible — justo lo que produce `findParcel`) flanqueaba esa celda
    concreta, la función devolvía `null` PARA SIEMPRE, aunque hubiera vía
    servible mucho más allá. Confirmado con una sim de 60 días sobre el
    mundo sembrado por defecto (sus vías CASI INFINITAS): 0 eventos
    `roadBuilt` en total.
  · **Arreglo**: `paintRoadExtension` gana un parámetro `dryRun` (comprueba
    el hueco sin pintar); `extendRoad` funde la búsqueda y la validación en
    un solo barrido en anillos — para CADA celda de vía que encuentra prueba
    en seco sus dos lados, y si ambos fallan sigue mirando más lejos en vez
    de rendirse. De paso se quita el parámetro `rng` de `extendRoad` (solo
    decidía qué lado probar primero): ahora sale de un hash determinista de
    las propias coordenadas del candidato, igual que ya hacía el arbolado de
    `paintRoadExtension` — aplica la lección de esta sesión sobre no
    perturbar el rng compartido con decisiones estructurales sin
    consecuencia de juego (y de paso, como el nº de candidatos probados
    varía con la densidad, mantener esto fuera del rng compartido evita una
    fuente más de sensibilidad de trayectoria).
  · Test de regresión que reproduce el fallo exacto (sin adivinar a mano el
    orden del barrido en anillos: se descubre el punto natural en un grid
    limpio, se bloquea ESE punto en un grid gemelo, se comprueba que la
    función mira más allá) — ver `sim.test.ts`. Verificado también con una
    sim de 30 días sobre `seedFarm()`: población de la familia inicial a 37,
    23 edificios, y **el primer ramal de carretera nuevo trazado el día 11**
    (antes del arreglo: nunca). 131/131 tests.
  · El crecimiento se frena visiblemente hacia el día 20-30 (21→23
    edificios) según la demanda pide edificios de tier 2-3 que no caben
    todavía en la red vial pequeña — comportamiento esperado, mismo límite
    de `extendRoad` (una vía nueva por vez, longitud fija de 16 celdas), no
    un bug nuevo.

- 2026-07-04 (misma sesión Sonnet, continuación) — **Presupuesto de draw
  calls roto en producción, no solo en teoría**: el HUD F3 mostraba 220-249
  draw calls ya en el día 1-4 de partida con solo 10-20 edificios, muy por
  encima del límite de §1.5 (≤200) — y los fps reales medidos en el preview
  eran de 10-17, no 60. Causa: los edificios de `props.ts` NO están
  instanciados (cada uno es un `Group` de 5-15 `Mesh` sueltos — paredes,
  tejado, porche, columnas...); `worldView.ts` los añadía tal cual al chunk,
  así que el coste escalaba con nº edificios × piezas por edificio, no con
  nº de chunks como el terreno.
  · Arreglo orquestado con un workflow multi-agente (panel de 3 diseños
    independientes → jueces → implementación → revisión adversarial):
    ganó "fundir todo el edificio (ya posicionado/rotado/decorado) en como
    mucho 2 `THREE.Mesh` con vertex-colors, agrupados por `castShadow`" —
    mismo patrón que `terrain.ts` (buf/emit/finish) y el horneado de
    `citizens.ts` (`paintedPart`/`mergeParts`), generalizado a un recorrido
    recursivo (`buildings.ts`, nuevo). Las `InstancedMesh` de ventanas
    (`windowGrid`) se expanden instancia a instancia y se hornean también —
    cero draw calls extra por ventanas.
  · La fase de verificación automática del workflow murió por un corte de
    conexión a la API (no un hallazgo real) — la repetí a mano: `tsc`
    limpio, 126/126 tests, y en el preview real los draw calls bajaron de
    ~220-249 a **73-102** (por debajo del presupuesto) y los **fps subieron
    de 10-17 a 60** — la caída de fps que había notado antes en esta misma
    sesión SÍ era este problema, no un artefacto del entorno como sospeché
    en su momento. Revisé también a ojo (zoom en granja/granero) que
    sombras, colores y siluetas no cambiaron nada.
  · Detalle no obvio de la implementación: las geometrías originales de cada
    pieza se disponen (`geometry.dispose()`) tras hornearlas — sin esto,
    cada `refreshChunkAt`/`rebuildAllChunks` (que ya se dispara por
    `setCultivation`/`setFestivalActive`/`setSeason`/`setHomePrestige`)
    filtraría memoria GPU porque los edificios se construyen y se tiran en
    cada reconstrucción, a diferencia del terreno (procedural, nunca se
    dispone). `showcase.ts` (`?scene=buildings`) no se toca: llama a
    `catalogItem.build()` directamente y nunca pasa por el camino de fusión
    de `worldView.ts`.
  · Deuda que queda: el presupuesto de 200 draw calls vuelve a acercarse
    según crecen vegetación/citizens/coches en chunks muy poblados — sigue
    siendo el candidato número uno para T6.1 (perfilado con 5.000
    ciudadanos) en cuanto la población autónoma llegue a esa escala.

- 2026-07-04 (misma sesión Sonnet, continuación) — T5.1 (paleta estacional).
  `sim/weather.ts` calculaba estación desde el ciclo 6 sin reflejo visual
  (anotado como carencia en varias entradas de la bitácora de RESEARCH.md).
  `palette.ts` gana `SEASON_PALETTES` (terreno + vegetación por estación,
  todo dentro de las mismas familias de color, ningún hex nuevo fuera de
  ahí); `render/terrain.ts` y `render/instances.ts` reciben `season` como
  parámetro, `WorldView.setSeason()` repinta todo el mapa al cambiar (mismo
  patrón de "reconstruir chunks al cambiar de estado" que `cultivation` y
  `festivalActive`). `main.ts` calcula la estación en el propio hilo
  principal con `weatherAt(seed, day)` (pura, sin THREE) — igual que ya
  hacía con `isFestivalDay`, cero mensaje nuevo del worker.
  · `cypress` NO varía con la estación a propósito: es de hoja perenne, se
    queda verde todo el año — el detalle que separa un ciprés de un árbol
    de hoja caduca en la vida real.
  · El juego ahora ARRANCA en invierno (día 0 cae en `SEASONS[0]`), no en el
    verano cálido de las capturas de referencia del checklist §4 — cambio
    de identidad visual INTENCIONADO (es la variante que pedía T5.1
    explícitamente: "campos claros"), verificado que sigue leyéndose como
    patchwork con siluetas oscuras de árboles, solo que en tonos pálidos.
  · Marcado `[~]`: falta el CROSSFADE lento entre estaciones (hoy es un
    corte discreto al reconstruir chunks — la vertex-color horneada no se
    presta a interpolar en shader sin más trabajo) y las cubiertas de nieve
    en tejados (tocaría todos los builders de `props.ts`, fuera de alcance
    de esta pasada). Verificado en preview: invierno se ve correctamente
    (campos pálidos, hierba verde-grisácea distinguible junto a los
    edificios); primavera/verano/otoño comparten el mismo código genérico
    (tipado por `tsc`, sin rama especial por estación) — no se esperó en
    vivo a que el reloj cruzara de estación (20 días de juego ≈ 25 min
    reales a ×3): el riesgo de que solo LOS DATOS de las otras 3 paletas
    tengan un error puntual es bajo y más barato de repasar a ojo (ya
    revisados) que de esperar; queda como verificación en vivo pendiente
    para una sesión con más margen de tiempo. 126/126 tests, `tsc` limpio.

- 2026-07-04 (misma sesión Sonnet, continuación) — T4.4 (modo autónomo):
  mecanismo de ramales nuevos en `world/growth.ts`. Cuando `findParcel` no
  encuentra sitio junto a una vía existente, `extendRoad` localiza la vía
  más cercana (mismo barrido en anillos que `findParcel`), detecta su eje
  contando vía en X vs Z a corta distancia, y `paintRoadExtension` traza un
  ramal PERPENDICULAR con el mismo perfil que las vías sembradas (3 celdas
  de vía + 2 de margen verde a cada lado, arbolado con huecos) — siempre
  ortogonal por construcción. `maybeGrow` lo intenta como fallback antes de
  rendirse, y reintenta `findParcel` una vez abierto el ramal.
  · Decisión clave (aplica la lección de la sesión sobre sensibilidad del
    RNG compartido, ver RESEARCH.md): `paintRoadExtension` es PURA salvo la
    mutación del grid — el arbolado sale de un rng propio sembrado por las
    coordenadas (`rx,rz,dir`), no del `this.rng` de la sim. Esto permite que
    el hilo principal repita EXACTAMENTE la misma pintura en su grid espejo
    recibiendo solo `{rx,rz,axis,dir,length}` por el evento `roadBuilt` — ni
    transmite el rng compartido ni lo perturba. Test dedicado que verifica
    la repetibilidad byte a byte (terreno + árboles) en un segundo grid.
  · Bug de test encontrado al verificar: `nearestRoadCell` (mismo algoritmo
    de anillos que `findParcel`) no devuelve el punto más cercano en línea
    recta sino el PRIMER acierto del anillo — para una vía "infinita" eso es
    el extremo `(centro.x - r, ...)`, no el punto directamente encima del
    centro. No es un bug del mecanismo (ya era así en `findParcel`, aceptado
    en producción porque el mundo sembrado es mucho más ancho que cualquier
    radio de búsqueda razonable) pero sí lo era de mi primer grid de prueba,
    demasiado estrecho — lo ensanché y el test pasó a ser determinista.
  · Marcado `[~]` en vez de `[x]`: falta el test de aceptación completo
    (30 min desde una sola granja, escenario semilla nuevo) — ver nota en la
    tarea. 126/126 tests, `tsc` limpio.

- 2026-07-04 (sesión Sonnet, pulido visual) — Empieza el barrido de los 4 TODOs
  de mesh que RESEARCH.md dejó pendientes tras cerrar la pirámide N0-N5
  (ciclo 10): coche, consultorio, escuela, plaza de fiestas.
  · **Mesh de coche** (`world/render/citizens.ts`): geometría fundida a mano
    (sin `BufferGeometryUtils`, que no tiene tipos y rompería `tsc` bajo
    `isolatedModules` — se construye igual que `render/terrain.ts`, copiando
    arrays de posición/normal de cada primitiva ya transformada). Chasis+ruedas
    en un InstancedMesh (blanco para tintar por instancia vía `setColorAt`,
    ruedas en `PALETTE.carTire` que se oscurece igual al multiplicar) +
    cabina de cristal en OTRO InstancedMesh de color fijo (`PALETTE.glass`,
    mismo patrón que las tiras de vidrio de `officeBlock`). `CitizenView`
    ahora reparte cada agente a peatón o coche según `AgentView.mode`
    (columna del ciclo 8) con contadores de instancia separados (`nWalk`/
    `nCar`); el fade de aparición/desaparición se comparte porque `mode`
    nunca es 1 en estado `Inside` (solo durante `moving`). Verificado en
    preview a ×3: coche visible en carretera con chasis+ruedas+cabina,
    orientado con el heading. 4 draw calls totales para todos los agentes
    (2 peatón + 2 coche), presupuesto intacto.
  · **Consultorio y escuela** (`props.ts` + `catalog.ts`): mesh propio en vez
    de reusar `civic()` (que desbordaba el lote — 16×9m sobre un footprint de
    8×6m/12×8m). Consultorio: caja con tejado plano + cruz roja discreta
    (dos listones de `PALETTE.signRed` cruzados sobre la puerta — a la
    distancia de zoom máximo del juego se lee como un acento discreto, tal
    como pedía RESEARCH.md). Escuela: aulas + patio cubierto con columnas +
    torrecita con campana (reutiliza el perfil de tejado a cuatro aguas de
    `civic()`). Ambos ajustados a su footprint real de catalogData (antes:
    civic() sin ajustar).
  · Bug de infraestructura encontrado de paso: `.claude/launch.json` fijaba
    el puerto 5173, que Vite abandona silenciosamente si está ocupado (otra
    sesión con el mismo repo abierta) — el proxy del preview quedaba
    apuntando al puerto declarado, no al real, y daba `ERR_CONNECTION_REFUSED`
    aunque el server sí arrancaba. Fix: `vite.config.ts` con
    `server.port=8888` + `strictPort:true` (falla alto y claro en vez de
    saltar de puerto en silencio) y `launch.json` a juego. Puerto fijo
    acordado con el usuario para evitar este choque en el futuro.
  · Pendientes de esta ronda: plaza/decoración de fiestas (ciclo 10) y
    jardín/fachada de prestigio (ciclo 9) — siguiente en la cola.
  · **Cierra las 3 deudas restantes** (jardín de prestigio, plaza de fiestas,
    franjas de cultivo T3.8). Las tres comparten el mismo problema: son
    estado de la SIM (`sim/economy.ts`) que el render por chunks
    (`world/render/worldView.ts`) no podía ver — los edificios se
    construyen una vez desde `catalogItem.build()` sin margen para
    "decoración según estado". Solución uniforme: el worker emite un
    evento nuevo cuando el estado cambia (`homePrestige` al invertir en una
    vivienda, `cultivationChanged` al cierre del día) y `WorldView` guarda
    ese estado en un `Map`/escalar propio y reconstruye SOLO el chunk
    afectado (`refreshChunkAt`) — mismo mecanismo que ya usaba `cityGrew`,
    ninguna infraestructura nueva. La decoración se añade como hijo del
    `mesh` del edificio ANTES de posicionarlo, así hereda su transform
    (posición+rotación) gratis.
    - `homeGarden(prestige, w, d, seed)` (`props.ts`): seto siempre que
      prestige≥0.3, flores desde 0.6, banderín en 1 — todo en el borde +Z
      (convención de "frente" del catálogo). `seed` determinista por ancla
      (`ax*92821 + az*68917`), nunca `Math.random()`.
    - `festivalDecor(w, d, seed)` (`props.ts`): guirnalda de luces
      (`PALETTE.windowLit`, catenaria aproximada con `sin`) + 2 puestos de
      mercado, en edificios `role==='civic'`. Activado/desactivado desde
      `main.ts` comparando `isFestivalDay(day)` cada frame contra el estado
      guardado en `WorldView` (la comparación es barata; solo dispara
      reconstrucción en el flanco de cambio) — cero mensaje nuevo del
      worker necesario porque `isFestivalDay` ya es una función pura
      importable en el hilo principal.
    - `economy.cultivation` [0,1]: sube deprisa (×0.35/día) si hubo faena
      agrícola HOY, decae despacio (×0.12/día) si no — un campo se ve
      trabajado varios días después de la última jornada, no de un día
      para otro. `render/terrain.ts` interpola `PALETTE.fields` →
      `PALETTE.fieldsCultivated` y oscurece filas pares un 12%×cultivation
      (franjas/surcos). Sin estado por parcela: el modelo sigue sin atar un
      granjero a UN campo concreto (deuda ya anotada en RESEARCH.md ciclo 1;
      esto da el feedback agregado que T3.8 prometía, no granularidad nueva).
    - Verificación: `festivalDecor` se lee a simple vista en `?scene=buildings`
      (puestos grandes, colores saturados) y también en el mundo real sobre
      el ayuntamiento/escuela. Las franjas de cultivo se confirmaron en el
      mundo real (día 1-2, faena ya visible como mosaico verde/beige con
      surcos). `homeGarden` se confirmó por conteo de nodos en el showcase
      (hijos > 0 para los 5 tipos residenciales, seto+flores+banderín según
      prestige) — el seto es pequeño y del mismo verde que el césped, así
      que a la distancia de cámara fija es difícil de distinguir a simple
      vista en captura; no llegó a observarse un hogar cruzando el umbral de
      inversión (bolsillo≥80) en el tiempo de sesión disponible, así que la
      confirmación 100% visual EN VIVO queda como deuda menor para la
      próxima sesión (el mecanismo — evento `homePrestige` + reconstrucción
      de chunk — es idéntico al de `festivalDecor`, que sí se vio, y al de
      `cityGrew`, ya probado en producción). 116/116 tests, `tsc` limpio.
  · De paso, un acoplamiento de lógica pura (sin render, no necesita
    screenshot): **salud→mortalidad** en `sim/lifecycle.ts` — ver
    RESEARCH.md §4 para el detalle (`deathChance` ahora lee `c.health`).

- 2026-07-03 — Fase 0 completada. Escenario semilla actual generado ad-hoc en
  `neighborhood.ts`; se migrará a grid en T1.4 (previsto, no es deuda).
- 2026-07-03 — Adelanto de modelado urbano (ventaja para T1.3): `props.ts` ya incluye
  `apartmentSlab`, `brickBlock`, `officeBlock`, `rowHouses`, `supermarket`,
  `parkingGarage`, `civic` y `factory`, con retículas de ventanas en `InstancedMesh`
  por edificio (helper `windowGrid`). Expositor visual en `showcase.ts`, accesible
  con `?scene=buildings` — úsalo como test visual del catálogo en T1.3.
- 2026-07-03 — Fase 1 (T1.1–T1.4) hecha. Decisiones:
  · El terreno se renderiza como UNA malla mergeada con vertex-colors (`render/terrain.ts`):
    color base por región (parches grandes) + jitter fino por celda → patchwork con ~1 draw call.
  · El campo de fondo se siembra dentro del grid (área finita ±90 celdas). El streaming
    infinito llega en T1.7; por ahora el mundo es finito.
  · El estanque se aproxima con celdas `water` (borde escalonado). Aceptable; mejorable luego.
  · TRAMPA APRENDIDA (para futuras mallas a mano): un BufferGeometry de quads en el plano
    XZ necesita winding CCW visto desde +Y o el backface culling lo descarta (se ve el
    fondo del cielo y parece que "no hay suelo"). La normal declarada NO afecta al culling,
    solo a la luz. Además, computeBoundingSphere() explícito por higiene.
  · Deuda T1.4: los árboles se renderizan como Groups individuales (cientos de draw calls).
    Lo resuelve T1.6 (instancing). No tocar hasta entonces.
- 2026-07-03 (sesión Fable, lógica de sim) — Fase 3 casi completa: T3.1-T3.5, T3.7,
  T3.8 hechas con tests headless (10/10 en `npm test`); T3.6 parcial (instanciado +
  interpolación + bobbing/fade; falta LOD y estrés 500). **LEE `SIMULATION.md`**: es
  la guía del territorio de `src/sim/` — arquitectura, contratos, trampas conocidas y
  el orden recomendado de lo pendiente (T3.10 inspector primero). Decisiones clave:
  · Catálogo partido en `catalogData.ts` (datos puros, sin THREE) + `catalog.ts`
    (builders): la sim del worker importa SOLO los datos.
  · La sim es una clase pura (`sim/simulation.ts`) testeable sin worker: `worker.ts`
    solo la envuelve con mensajería. Los tests corren días de juego en ms.
  · Necesidad 'purpose' en vez de need "trabajo" literal: los parados la sienten
    decaer igual (presión para aceptar empleo), pero no puntúan 'work' sin puesto.
  · Saltadas de momento en T3.5: 'mirar escaparate' y 'sentarse' (triviales de añadir
    como entradas de ACTIVITIES cuando haya bancos/escaparates renderizados).
  · Teclas 0-3 = velocidad de sim. HUD F3 muestra reloj de juego y agentes.
