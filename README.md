# city-bill

Un pueblo de navegador que **se construye solo** y cuyos vecinos **viven vidas
autónomas** — y lo cuentan: la Crónica narra la fundación, las dinastías y sus
extinciones. Estética low-poly isométrica pastel: flat shading, sombras largas,
cero texturas. Todo determinista a partir de una semilla.

![Un pueblo que se construyó solo en 90 días desde una sola granja](docs/hero.png)

> El pueblo de arriba no lo colocó nadie: emergió de **una sola granja** en 90
> días de juego. La ciudad trazó sus propias calles, levantó casas, tiendas y un
> ayuntamiento, y se pobló de familias que trabajan, compran y envejecen.

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:8888
npm test           # tests headless de la simulación (grid + sim, sin navegador)
npx tsc --noEmit   # type-check
```

## Modos (query params)

| URL | Qué muestra |
|---|---|
| `/` | Un pueblo sembrado con semilla que **vive y crece** en tiempo real. |
| `/?scene=farm` | **Modo autónomo puro**: desde una granja, la ciudad se construye sola. |
| `/?scene=test-dev` | **Banco de pruebas**: pueblo pre-crecido (`?days=`, def. 100) + panel dev. |
| `/?scene=buildings` | Expositor del catálogo completo de edificios. |
| `/?seed=N` | Fuerza la semilla del mundo (comparte un pueblo, reproduce un bug). |
| `/?seed=N&days=D` | Partida normal madurada D días en el worker (0–400), útil para reproducir una ciudad ya crecida. |

Controles: arrastrar/WASD para mover, rueda para zoom, **Q**/**E** para rotar,
clic en un vecino para inspeccionarlo, **F** para seguirlo, **C** para la crónica,
**0**–**3** para la velocidad del tiempo (también en la barra de control), **M**
para silenciar el ambiente y **F3** para el panel de rendimiento.

## Qué lo hace especial

- **Construcción autónoma (Fase 4).** La demanda sale del estado REAL de la sim
  (paro, viviendas llenas, tiendas saturadas), no de un guion. Cuando falta
  frente construible, la ciudad **traza sus propias calles**. Cada edificio se
  **levanta con andamio y pop**, no aparece de golpe.
- **NPCs de verdad (Fase 3).** Ciudadanos con necesidades, personalidad y una
  IA de utilidad: el patrón día/noche (trabajar, comer, comprar, socializar,
  dormir) **EMERGE** de las curvas, sin horarios hardcodeados. Nacen, forman
  pareja, crían, enferman, envejecen y mueren.
- **La historia como sistema.** Apellidos que se heredan, dinastías que
  emergen y se extinguen, hitos del pueblo (el primer edificio de cada tipo, el
  salto de aldea a pueblo a villa) — y una **Crónica** que lo narra todo, desde
  la fundación. Toasts efímeros avisan de lo memorable; el inspector abre la
  vida de cualquier vecino.
- **Economía y sociedad vivas.** Empleos reales en edificios, salarios,
  impuestos, alquiler, pensiones, prestigio del hogar, epidemias con cuarentena
  y vacunación, inmigración por atractividad y emigración digna por penuria.
- **Determinismo total.** Todo el mundo se reconstruye desde una semilla; nada
  usa `Math.random()` en la lógica. Los tests corren días de juego en milisegundos.
- **Rendimiento de maqueta.** Instancing para vegetación y peatones, edificios
  horneados por chunk, mundo con frustum culling, simulación en un Web Worker
  desacoplada del render.

## Stack

- **Three.js** — render 3D real con cámara **ortográfica isométrica** (azimut 45°,
  elevación 32°): 3D de verdad (no sprites) para rotar la cámara y animar
  luz/estaciones, con proyección ortográfica para el look "de maqueta".
- **TypeScript + Vite** — DX rápida, build para navegador sin config.
- **Web Worker** — la simulación corre aparte del hilo de render (tick fijo de
  250 ms de juego); el main interpola snapshots a 60 fps.
- **Sin frameworks de juego** — el motor es pequeño y a medida.

## Arquitectura

```
src/
  palette.ts            # ÚNICA fuente de verdad del color.
  rng.ts                # RNG con semilla — el mundo es determinista.
  props.ts              # Fábrica de meshes low-poly (edificios, árboles, coches).
  core/                 # renderer, cámara iso, bucle, input, HUD de debug.
  world/
    grid.ts             # Rejilla lógica por chunks (1 celda = 2×2 m).
    catalog(Data).ts    # Catálogo data-driven de todo lo construible.
    growth.ts           # Crecimiento autónomo: demanda → edificio → calle.
    seed.ts             # Escenarios semilla (mundo, granja).
    render/             # WorldView por chunks, instancing, terreno, obras, ciudadanos.
  sim/                  # Simulación pura (worker): reloj, pathfinding, economía,
    citizens/           #   ciudadanos (necesidades, cerebro, actividades, social).
  ui/                   # HUD de ciudad, inspector, crónica, avisos, barra de control.
```

La lógica de la sim (`src/sim/`) es una clase pura testeable sin worker ni THREE;
`worker.ts` solo la envuelve con mensajería. Ver [SIMULATION.md](SIMULATION.md)
para el mapa del territorio de la sim y [ROADMAP.md](ROADMAP.md) para el plan
completo. El catálogo de construcciones vive en [CATALOG.md](CATALOG.md).

## Reglas de la dirección de arte

1. Colores solo desde `PALETTE`. Tonos tierra desaturados, verdes casi negros en
   árboles, acentos rojizos apagados.
2. Sin texturas: la riqueza sale de proporciones, variación procedural y sombras.
3. Luz firmada: sol cálido lateral (sombras largas PCF soft) + ambiente frío.
4. Geometría low-poly facetada: primitivas y extrusiones, nunca subdivisiones altas.
5. Nada se repite exacto: cada árbol/edificio varía escala, rotación y tono vía RNG.
