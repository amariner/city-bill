# city-bill — Guía para el agente

City builder para navegador (Vite + TypeScript + Three.js) con estética low-poly
isométrica pastel y NPCs autónomos.

## Regla nº 1
El desarrollo se guía por **ROADMAP.md**. Antes de escribir código: lee su §0
(protocolo del agente) y ejecuta las tareas EN ORDEN, marcando las casillas y
anotando decisiones en su §6. El diseño detallado de cada tarea está en
`docs/PLAN-CITY-BUILDER-HIBRIDO.md`; el ROADMAP anterior (vivarium) está congelado
en `docs/ROADMAP-HISTORICO.md` y solo se consulta. El catálogo de construcciones
vive en **CATALOG.md**; el mapa de la simulación, en **SIMULATION.md**.

## Comandos
- `npm run dev` — dev server (o preview_start con el server `city-bill` de `.claude/launch.json`)
- `npx tsc --noEmit` — type-check (debe estar limpio antes de cada commit)
- `npm run test:fast` — toda la suite menos la sonda larga (~10 s; en cada tarea)
- `npm test` — suite completa con `sim.test.ts` (~3,5 min; antes de cada push)

## Reglas de arte (innegociables)
1. Colores SOLO desde `src/palette.ts` (añadir allí los nuevos, con nombre semántico).
2. Sin texturas: primitivas flat-shaded; la riqueza sale de proporción, variación y sombra.
3. Luz firmada: sol cálido lateral con sombras largas + ambiente frío. No tocar sin motivo.
4. Cámara ortográfica isométrica: azimut 45°, elevación 32°. La elevación nunca cambia.
5. Nada se repite exacto: variación por RNG con semilla (`src/rng.ts`); prohibido `Math.random()` en lógica de mundo.
6. Toda tarea visual termina con screenshot del preview y el checklist §4 del ROADMAP.
7. El render nunca muta su grid por su cuenta: solo aplica `gridPatch` del worker
   (lo único derivado en el main es cosmético, como `paintYard`).

## Arquitectura
Contratos en ROADMAP.md §1 (grid y `gridPatch`, worker de sim, protocolo de mensajes,
acciones con replay, dinero con ledger, guardado, presupuestos de rendimiento). Son
inmutables salvo conflicto documentado en ROADMAP.md §6.
