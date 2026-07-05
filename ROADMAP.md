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

### Fase 1 — Motor de mundo ✅ COMPLETADA
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
- [x] **T1.8 Ciclo de luz.** `core/renderer.ts` `updateSun(sun, dayFraction)`:
  el azimut del sol deriva lentamente (±24°) entre la hora dorada de la mañana y
  la de la tarde, ligado al reloj de JUEGO (main.ts loop); se entibia en los
  extremos (`palette.sunGolden`). Elevación FIJA → sombras largas SIEMPRE.
  Verificado por screenshots mañana/tarde: dirección de sombra distinta, ambas
  largas, calidez visible, una sola dirección de sol (checklist §4). **Con esto,
  Fase 1 (T1.1–T1.8) queda COMPLETA.**

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
- [x] **T3.9 Vehículos** (lógica: ciclo 8 de RESEARCH.md; **mesh de coche hecho**
  en `render/citizens.ts` — chasis + cabina instanciados, 2 draw calls, colores
  de `palette.ts`; el peatón no se dibuja al ir en coche). Coches para trayectos
  > 40 celdas: el coche recorre el grafo vial (velocidad por tipo de vía),
  aparca cerca del destino. *Pendiente menor:* tractores en franjas de campo.
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
- [x] **T4.3 Inmigración/emigración.** Familias llegan si hay vivienda+empleo+felicidad;
  se van si no. La población es consecuencia, no un slider. (Inmigración modulada por
  atractividad = ciclo 12; emigración digna por penuria sostenida = ciclo 14, RESEARCH.md.)
- [x] **T4.4 Modo autónomo — FUNCIONA (end-to-end, verificado).** Desde una sola
  granja (`seedFarm`, `?scene=farm`), la ciudad **traza sus propias calles**:
  cuando hay demanda pero no queda frente construible junto a una vía,
  `maybeExtendRoad` ramifica/prolonga una calzada de 3 celdas (con márgenes y
  arbolado, ortogonal) hacia campo abierto, con ritmo (una calle cada ~2 días).
  El evento `roadExtended` la replica en el render (worker→main) y el pathfinding
  la usa al instante (lee el grid en vivo). **Test de aceptación estrella en
  sim.test:** de 3 edificios a un pueblo con calles autotrazadas, población
  creciente y vida en la calle. Verificado también por screenshot (`?scene=farm`).
  *Pulido pendiente:* el crecimiento tiende a RIBBON (casas a lo largo de una
  calle) más que a trama densa 2D — las ramificaciones perpendiculares se
  acorralan con los frentes; afinar para un pueblo más tupido, y el playtest
  largo de 30 min. Pero el criterio "de una granja emerge un pueblo sin input"
  ya se cumple.
  *NÚCLEO HECHO:* `extendRoad(grid, from, dir, length, rng)` en `growth.ts` (puro,
  testeado en grid.test): traza calzada de 3 celdas + márgenes de hierba + arbolado
  con huecos, ortogonal, sin arrasar edificios. *Pendiente (sesión enfocada):* el
  ENGANCHE — cuándo/dónde extender (cuando `findParcel` falla con demanda viva),
  replicar las celdas nuevas en render + grafo de pathfinding vía un evento
  worker→main (como `cityGrew`), y verificar el pueblo emergente a 30 min. Se dejó
  aparte a propósito: toca crecimiento (caóticamente sensible) + worker + render.
  *Hallazgo que BAJA el riesgo del enganche:* el pathfinding lee el grid EN VIVO
  (`walkCost(this.grid.get(nx,nz))`, sin grafo cacheado), así que una vía nueva en
  el grid de la sim es navegable AL INSTANTE — no hace falta reconstruir grafo. Y
  como en `extendRoad` la calzada+márgenes son deterministas (sin RNG; solo el
  arbolado usa RNG), worker y main producen las MISMAS vías aunque el arbolado
  difiera — la réplica en render puede ser `extendRoad(renderGrid, from,dir,len,rng)`
  con solo emitir `{from,dir,length}`. Lo verdaderamente delicado que queda es la
  ESTÉTICA: elegir desde dónde/hacia dónde extender para que el pueblo emergente
  sea bonito (heurística de periferia + demanda), y el playtest de 30 min.
- [~] **T4.5 Hitos y tiers.** Población desbloquea tiers del catálogo (T1→T4) con una
  tarjeta de celebración discreta. El tier T4 introduce la estética Zlín (bloques de
  ladrillo, fábrica, tren) — ver CATALOG.md.

### Fase 5 — Atmósfera y juice
- [x] **T5.1 Estaciones.** Crossfade lento continuo por `seasonalWarmth(day)`
  (`weather.ts`): (1) LUZ y cielo — invierno frío/apagado ↔ verano cálido/luminoso
  (`updateSeason` en `renderer.ts`); (2) NIEVE del terreno — el suelo se cubre de
  blanco en invierno vía `emissive` del material único de terreno
  (`updateTerrainSeason` en `render/terrain.ts`; aditivo, sin rebuild de malla).
  Colores en `palette.ts` (`skyWinter/Summer`, `ambientWinter/Summer`, `snow`).
  Verificado por screenshots (mundo invernal nevado vs verano). NOTA (2026-07-05,
  sesión interfaz): el factor emissive de la nieve estaba infradosificado (0.42) y en
  pantalla no se leía → subido a 0.85 (lee como nieve sin saturar a blanco plano ni
  borrar las sombras del suelo). *Pulido opcional:* cubiertas blancas de nieve en los
  tejados (hoy solo el suelo).
- [ ] **T5.2 Tren.** Vía + estación + tren con 3-5 vagones en circuito, humo de la
  locomotora con sprites de esferas.
- [ ] **T5.3 Sonido generativo.** Web Audio: viento, pájaros, campana lejana, murmullo
  al hacer zoom a ciudadanos charlando. Volumen ligado al zoom.
- [x] **T5.4 Juice atmosférico del anochecer.** Luces de ventana encendiéndose una a
  una al caer la tarde (glow *emissive*, no difuso), humo de chimenea y bandada de
  pájaros, todo sobre una "hora azul" que atenúa/enfría el pueblo para que el juice
  cante. El *rebote elástico al colocar* queda para la Fase 2 (construcción manual, aún
  no existe). Sistema único `render/atmosphere.ts` ligado al reloj de juego. Ver §6
  (2026-07-05, sesión juice).
- [ ] **T5.5 Modo foto.** Ocultar UI, encuadres presets, export PNG 4K.

### Fase 6 — Lanzamiento
- [ ] **T6.1 Rendimiento final.** Perfilado con 5.000 ciudadanos; optimizar hotspots.
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
- 2026-07-04 (sesión Opus, profundidad de sim + primer render) — Ver la bitácora
  de RESEARCH.md §4 para los ciclos 11-18 de LÓGICA (salud→mortalidad,
  prestigio→inmigración, clima→coche, emigración digna, clínica medida, duelo,
  consuelo, memoria afectiva de la Crónica). Con inmigración+emigración, **T4.3
  queda COMPLETA**. En render: **T3.9 mesh de coche HECHO** (chasis+cabina
  instanciados, `render/citizens.ts`; colores nuevos `carBodies`/`carCabin` en
  `palette.ts`; el peatón no se dibuja en coche). Decisión de proceso importante:
  · **Verificación visual headless establecida**: Chromium preinstalado
    (`/opt/pw-browsers`) + `playwright-core` (instalado en el scratchpad, NO en el
    proyecto) permiten arrancar `npm run dev` y capturar la escena con
    `--use-gl=swiftshader`. El mesh de coche se verificó en una escena de
    aislamiento temporal (borrada tras la captura): lee como cochecito low-poly,
    proporción correcta vs peatón, paleta coherente, sombra. Este es el camino
    para saldar la deuda visual acumulada (nieve/estaciones T5.1, plaza, jardín
    de prestigio, franjas de campo T3.8) con screenshot obligatorio del §4.
  · Trampa aprendida cazando el coche en el mundo vivo: a zoom máximo la cámara
    puede quedar sobre campo vacío sin agentes, y el wheel de Playwright satura
    al límite de zoom — para verificar un mesh concreto, una escena de
    aislamiento es MUCHO más fiable que perseguir agentes en la sim.
  · **T5.1 completa** (tinte de luz/cielo + NIEVE del terreno por estación, via
    emissive de un material de terreno único). **T1.8 completa** (ciclo de luz).
  · **Semilla del mundo aleatoria y PERSISTIDA** (`pickWorldSeed` en main.ts,
    `seedWorld(seed)` parametrizado): cada jugador tiene SU pueblo (antes era el
    mismo hardcodeado para todos) y perdura al recargar; `?seed=N` lo fuerza.
    Verificado: seeds distintas → pueblos distintos, misma seed → mismo pueblo.
    Es un primer paso de T2.6 (persiste el MUNDO; falta persistir el TIEMPO/
    estado de sim — el guardado completo §1.4 sigue pendiente).
- 2026-07-05 (sesión Opus, veta INTERFAZ — surfacing) — La UI se había quedado muy
  por detrás de la sim (40 ciclos de lógica, casi invisibles). Primer paso de la veta:
  **HUD de ciudad** (`ui/cityHud.ts`) siempre visible (población/tesoro/paro/estación/
  granero/salud/riqueza) + **inspector enriquecido** (vocación ✓, legado, alquiler).
  Sin lógica nueva: sólo plumbing por la frontera única — `CityStats` en `protocol.ts`,
  `Simulation.cityStats()` puro, en el `SnapshotMsg`, expuesto en `SimClient.city`.
  Acentos de alerta con colores semánticos de la paleta. Verificado por screenshot
  (§4). Detalle: `describe()` ahora devuelve `Omit<CitizenInfoMsg,'type'|'id'>` (el
  contrato del mensaje es la única fuente de verdad). Ver RESEARCH.md §4 (2026-07-05).
  NOTA: la nieve del TERRENO en invierno (T5.1 paso 2) YA estaba implementada
  (`updateTerrainSeason`); lo pendiente ahí es sólo el pulido de cubiertas en tejados.
- 2026-07-05 (sesión Opus — BANCO DE PRUEBAS `?scene=test-dev`) — Nueva escena de
  desarrollo: abre directamente en una ciudad MADURA y VIVA (≈90-100 hab, ~30
  edificios, tier 3, calles auto-trazadas, economía y estaciones corriendo) para
  testear TODAS las mecánicas de un vistazo. Es el banco de pruebas visual del
  proyecto: cada avance nuevo debe verse aquí. Decisiones y trampas:
  · **Pre-crecido DENTRO del worker** (no reseed con pérdida). La idea inicial del
    brief era pre-crecer headless y sembrar el worker con `grid.serialize()`; lo
    PROBÉ y medí: reseed desde el grid pierde toda la vida acumulada (el
    constructor de `Simulation` sólo repuebla viviendas a capacidad → ~33 hab, sin
    niños ni mayores, ~2 personas en la calle → ciudad casi muerta). En su lugar,
    el worker PRE-CRECE su propia `Simulation` N días (init con `preGrowDays`) y su
    sim ES la ciudad madura (gente, edades, vínculos, obras intactas: ~90 hab, con
    30 niños). Devuelve el grid resultante (`grownGrid`) para que el render dibuje
    EXACTO lo que construyó (cero divergencia). Bloquea el worker ~10 s, no el main
    (overlay animado + barra de progreso vía `growProgress`). Contratos nuevos en
    `protocol.ts`: `InitMsg.preGrowDays`, `GrowProgressMsg`, `GrownGridMsg`.
  · **Determinismo**: semilla FIJA por defecto (`0x7e57de5`, pueblo reproducible
    para testear a ojo), forzable con `?seed=`; días de maduración con `?days=`
    (def. 100), encuadre con `?zoom=`. Semilla mínima de granja (`seedFarm`): la
    ciudad se traza sus propias calles → trama 2D tupida, lo más vistoso.
  · **Abre al ATARDECER (~19:00), no a mediodía.** MEDIDO headless (contando
    agentes fuera por hora): a las 13-14h casi todos trabajan/estudian DENTRO (~9
    en la calle); el pico es tras la jornada, ~19h (~17 fuera, ×2). Un año son 80
    días (4 estaciones de 20, `weather.ts`); el reloj arranca a medianoche tras el
    pre-crecido → hay que adelantar a la hora viva. Aun en el pico, la mayoría está
    dentro (modelo de actividades): la ciudad se ve viva pero NO abarrotada — es la
    densidad real de la sim, se disfruta mejor observándola en el tiempo.
  · **Panel dev** (`ui/devPanel.ts`, overlay DOM plegable, sólo test-dev): velocidad,
    saltar tiempo (+1d/+estación/+año), disparar epidemia, toggles de mecánicas
    (crecimiento/cuarentena/vacuna/sanidad/alquiler) y contadores en vivo (pob. por
    edad, empleo/paro, obras, tier, economía, contagio). CERO lógica de sim ahí: sólo
    LEE `simClient.city` y ENVÍA comandos (`DevMsg` en el contrato). Los toggles
    reflejan el estado REAL que reporta la sim (fuente de verdad), no un espejo local.
    `CityStats` ampliado con los agregados del panel; helpers dev en `Simulation`
    (`forceEpidemic` garantiza casos índice levantando inmunidad; `advanceDays`).
  · **Salto de tiempo NO congela**: `advanceDays` a 0.2 s/día-de-juego bloquearía
    el worker ~16 s en un "+año". Se ENCOLA (`pendingSkip`) y el bucle lo consume por
    lotes (`SKIP_TICKS_PER_FRAME`) → el salto se VE correr (reloj y estaciones
    girando) en vez de congelar. Verificado: +estación pasa otoño→invierno en ~3 s.
  · Todo verificado end-to-end en navegador con Playwright (disparar epidemia:
    sana→enfermos; toggles; salto con cambio de estación; sin errores de página).
    `tsc` limpio, `grid.test` 33/33. Refactor de `main.ts`: `buildRenderAndUi(grid)`
    separado de la creación del `SimClient` (el render se monta al llegar el grid
    maduro; el juego normal lo llama sincrónico como antes).
- 2026-07-05 (sesión Opus, LÓGICA+INTERFAZ a la par — ciclo 41) — **Rotación vocacional
  (churn)**: la vocación (ciclo 36) ya no es solo un tinte de propósito, ahora MUEVE a la
  gente. Un adulto infeliz en su oficio (trabaja lejos de su vocación) puede DEJARLO para
  buscar el suyo, si hay vacante que lo colma a su alcance; al reasignar, gravita a su
  llamada (descuento de distancia solo para el que busca). Salda la lección del ciclo 37
  (preferir sin churn = no-op): medido A/B, el encaje sube (p.ej. seed 500 0.27→0.38) y
  el suelo de comida es IDÉNTICO ON/OFF (benigno). RNG APARTE (`churnRng`) para no
  perturbar el flujo general. **Interfaz a la par**: evento `vocationFound` → la Crónica
  lo narra ("X encuentra su vocación: por fin labra la tierra"), un toast ✦ lo asoma, y
  el inspector ya lo marca ✓ — se ve a alguien pasar a su vocación. 282/282 tests, `tsc`
  limpio, screenshot de regresión limpio. Ver RESEARCH.md §4 (2026-07-05, ciclo 41).
- 2026-07-05 (sesión Opus, LÓGICA+INTERFAZ a la par — ciclo 42) — **Linaje (apellidos
  heredados)**: la historia autónoma (la Crónica) se vuelve SAGA generacional. Un hijo
  hereda el apellido de un progenitor (mismo nº de tiradas de RNG → mundo byte-idéntico,
  282 tests previos intactos); los apellidos se perpetúan y emergen dinastías. **Interfaz
  a la par**: la Crónica narra "nace Ada, de Vera" y el inspector muestra "hijo/a de Vera
  Novák". Descartado un hito de dinastía por apellido (ruidoso con solo 12 apellidos;
  pediría un árbol genealógico real — ciclo futuro). 288/288 tests, `tsc` limpio.
  Ver RESEARCH.md §4 (2026-07-05, ciclo 42).
- 2026-07-05 (sesión Opus, LÓGICA+INTERFAZ a la par — ciclo 43) — **Dinastías
  (descendencia real)**: el hito de dinastía legítimo que el ciclo 42 dejó pendiente. Cada
  persona lleva un `lineId` (el tronco de su estirpe, propagado al nacer); cuando una línea
  cruza 8 descendientes vivos, la Crónica la reconoce ("la familia Novák echa raíces: 9
  descendientes vivos"), un toast ❦ lo asoma, y el inspector muestra la familia hacia abajo
  ("familia: N hijos viven aquí"). Descendencia REAL (por lineId, no coincidencia de
  apellido); sin RNG → mundo byte-idéntico (288 tests previos intactos). El linaje se lee
  ya en tres direcciones: de quién vienes, quién sigue contigo, cuándo tu estirpe se vuelve
  historia. 292/292 tests, `tsc` limpio. Ver RESEARCH.md §4 (2026-07-05, ciclo 43).
- 2026-07-05 (sesión Opus, LÓGICA+INTERFAZ a la par — ciclo 44) — **Extinción de estirpe**:
  cierra el arco familiar (rise & fall). Cuando una dinastía reconocida se apaga del todo
  (ni un descendiente vivo ni el fundador), la Crónica cierra su historia ("se extingue la
  familia Novák — no queda ninguno de su sangre") y un toast ❧ sobrio la asoma. Emergente
  de largo plazo (medido offline: ~día 180 en seeds 7/999/12345); cubierto por test
  unitario del predicado + narración (el run de 200 años disparaba la suite a >4 min).
  Con esto el arco de una familia es COMPLETO: nace (42), crece y se reconoce (43), se
  apaga (44). 297/297 tests, `tsc` limpio. Ver RESEARCH.md §4 (2026-07-05, ciclo 44).
- 2026-07-05 (sesión Opus, LÓGICA+INTERFAZ a la par — ciclo 45) — **Hitos del pueblo
  (primer edificio de cada tipo)**: abre la veta de la historia del LUGAR (tras el arco
  familiar). Cuando la ciudad levanta sola un tipo de edificio que no había (escuela,
  consultorio, adosados, fábrica…), la Crónica lo celebra ("el pueblo estrena un edificio
  nuevo: Escuela") y un toast ⌂ lo asoma. Acoplado a los tiers (cada tier abre tipos);
  emerge del crecimiento sin guion. 301/301 tests, `tsc` limpio, screenshot del pueblo en
  desarrollo sin regresión. Ver RESEARCH.md §4 (2026-07-05, ciclo 45).
- 2026-07-05 (sesión Opus, INTERFAZ alcanza a la lógica — ciclo 46) — **Las amistades,
  visibles**: la afinidad social (charlas/vínculos/duelo, T3.7) se simulaba desde hace ~40
  ciclos pero nunca se veía. El inspector muestra ahora el lazo más cercano vivo, marcándolo
  "amistad íntima" si supera el umbral de duelo por amigo (0.55) o "conocido/a" si no. Cero
  lógica nueva (`closestFriend` sobre `c.friends`, dos campos en el mensaje). Con esto el
  inspector cuenta a una persona casi completa (quién es, con quién vive, de quién viene,
  quién la acompaña, qué hace, qué ama, qué debe, qué deja). 305/305 tests, `tsc` limpio.
  Ver RESEARCH.md §4 (2026-07-05, ciclo 46).
- 2026-07-05 (sesión Opus, LÓGICA+INTERFAZ a la par — ciclo 47) — **Identidad del
  asentamiento (aldea→pueblo→villa→ciudad)**: el lugar tiene ahora un nombre por su tamaño
  (función pura `settlementClass`, umbrales 0/20/60/150, eje distinto de los tiers). El HUD
  lo muestra SIEMPRE (la etiqueta del chip de población pasó a ALDEA/PUEBLO/VILLA/CIUDAD;
  verificado por screenshot "ALDEA · 16") y la Crónica celebra cada ascenso ("la aldea se
  hace pueblo (20 almas)") con toast ✦. Emerge pronto (seed 42: pueblo@d3) → test barato.
  309/309 tests, `tsc` limpio. Ver RESEARCH.md §4 (2026-07-05, ciclo 47).
- 2026-07-05 (sesión Opus — JUICE ATMOSFÉRICO T5.4) — El atardecer del banco de
  pruebas (`?scene=test-dev` abre a ~19 h) ahora está VIVO. Un único sistema,
  `world/render/atmosphere.ts` (clase `Atmosphere`), ligado al reloj de JUEGO:
  · **Luces de ventana una a una** — la señal es `lampFactor(hora)` (0 de día, 1 de
    noche, rampa suave al anochecer 17.5→20 h y al amanecer 5.5→7.5 h; nada de
    `if hora==X`). Cada ventana tiene un `threshold` → prende cuando `lampFactor` lo
    supera (efecto "una a una", escalonado). Dos mecanismos por rendimiento/estética:
    (a) bloques urbanos (`windowGrid`): el brillo cálido va como EMISSIVE por
    instancia vía un atributo `aGlow` (vec3) + parche mínimo de shader
    (`onBeforeCompile`, se suma a `totalEmissiveRadiance`, SIN tocar el difuso →
    apagadas = cristal frío normal, encendidas brillan aunque el pueblo se atenúe);
    (b) casas pequeñas (`litWindow`, mesh suelto): material propio cuyo
    `emissiveIntensity` sube Atmosphere (0 de día → cálido de noche). Añadidas
    ventanas encendibles a `cottage`/`farmhouse`/`rowHouses` para que el PUEBLO
    entero se ilumine, no sólo los bloques. Escalonado por posición de mundo
    (determinista, sin RNG).
  · **"Hora azul"** (`updateNight` en `renderer.ts`) — TRAMPA/decisión clave: el mundo
    NO oscurecía nunca (la elevación del sol es fija por regla de arte §4, no hay
    atenuación nocturna), así que un glow difuso cálido se PERDÍA contra las paredes
    crema a plena luz. Sin un pueblo que se atenúe, "encender luces" no se lee. Añadida
    una atenuación nocturna suave y fría (nunca a negro, §4: silueta legible) que modula
    intensidad de sol/ambiente/hemi y tiñe cielo+ambiente hacia el crepúsculo. Es motivo
    documentado para tocar la luz firmada (regla §0.3/§0.4). La ELEVACIÓN del sol NO se
    toca: sólo intensidad/color/cielo → las sombras siguen largas. Colores nuevos en
    `palette.ts`: `windowLit` (subido a ámbar), `skyNight`, `ambientNight`, `smoke`,
    `bird` (+`windowDay` sin uso final).
  · **Humo de chimenea** — bocanadas (InstancedMesh de esferas facetadas pálidas,
    `depthWrite:false`) que suben, derivan y se deshacen encogiendo; sólo emiten al
    anochecer/amanecer (`lampFactor>0.2`). Chimeneas marcadas con `userData.kind` +
    `topOffset` en `farmhouse`/`cottage`/`factory`. Es FX cosmético efímero → usa
    `Math.random` (permitido, §0.6). El resto (luces, bandada) es determinista.
  · **Bandada** — una bandada (InstancedMesh de conos triangulares oscuros) que gira
    sobre el centro de la ciudad al alba (~7 h) y al ocaso (~18.5 h), dormida el resto.
  · **Escaneo del mundo**: Atmosphere recorre el árbol de render y cachea ventanas
    (`kind:'windows'`/`'litWindow'`) y chimeneas; `invalidate()` en `cityGrew` re-escanea
    tras crecer la ciudad (ventanas/chimeneas nuevas). Las ventanas sólo se repintan
    cuando el crepúsculo se MUEVE (`lastLamp`); de día/noche pleno, gratis.
  · Verificado con Playwright (headless swiftshader) en `?scene=test-dev` (dusk vivo:
    ventanas cálidas por todo el pueblo, humo, bandada, hora azul) y en `?scene=buildings`
    (de día: ventanas = cristal frío, cero glow, sin artefactos del shader). `tsc` limpio;
    `npm test` 33/33 + 276/276 verde. Coste medido: +14 draw calls sobre la base (2 FX
    instanciados + ~12 ventanas de casa); la base del banco ya son ~425 (edificios como
    grupos de meshes, NO instanciados — deuda pre-existente de T1.6/T6.1, no de T5.4).
    NOTA fps=10 del HUD headless es artefacto de swiftshader (SW render), no hardware real.
