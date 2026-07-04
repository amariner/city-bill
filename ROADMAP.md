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
- [ ] **T4.4 Modo autónomo.** Toggle: la ciudad también traza carreteras nuevas
  (extensiones del grafo hacia demanda no servida, siempre ortogonales y arboladas).
  Con el juego en marcha y sin input, en 30 min de juego debe emerger un pueblo
  coherente y bonito desde una sola granja. **Este es el test de aceptación estrella
  del proyecto** — grabarlo con screenshots periódicos.
- [~] **T4.5 Hitos y tiers.** Población desbloquea tiers del catálogo (T1→T4) con una
  tarjeta de celebración discreta. El tier T4 introduce la estética Zlín (bloques de
  ladrillo, fábrica, tren) — ver CATALOG.md.

### Fase 5 — Atmósfera y juice
- [~] **T5.1 Estaciones.** *Primer paso HECHO:* tinte estacional de LUZ y cielo con
  crossfade lento continuo (`seasonalWarmth(day)` en `weather.ts` → `updateSeason`
  en `renderer.ts`), invierno frío/apagado ↔ verano cálido/luminoso; colores en
  `palette.ts` (`skyWinter/Summer`, `ambientWinter/Summer`). Verificado por
  screenshots invierno/verano. *Pendiente:* repintado del TERRENO (nieve estilo
  Zlín: cubiertas blancas, campos claros) — la malla mergeada con vertex-colors.
- [ ] **T5.2 Tren.** Vía + estación + tren con 3-5 vagones en circuito, humo de la
  locomotora con sprites de esferas.
- [ ] **T5.3 Sonido generativo.** Web Audio: viento, pájaros, campana lejana, murmullo
  al hacer zoom a ciudadanos charlando. Volumen ligado al zoom.
- [ ] **T5.4 Juice.** Rebote elástico al colocar, humo en chimeneas al anochecer,
  bandadas de pájaros, luces de ventanas encendiéndose una a una al caer la tarde.
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
