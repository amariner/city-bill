# city-bill — Guía para el agente

City builder para navegador (Vite + TypeScript + Three.js) con estética low-poly
isométrica pastel y NPCs autónomos.

## Regla nº 1
El desarrollo se guía por **ROADMAP.md**. Antes de escribir código: lee su §0
(protocolo del agente) y ejecuta las tareas EN ORDEN, marcando las casillas y
anotando decisiones en su §6. El catálogo de construcciones vive en **CATALOG.md**.

## Comandos
- `npm run dev` — dev server (o preview_start con el server `city-bill` de `.claude/launch.json`)
- `npx tsc --noEmit` — type-check (debe estar limpio antes de cada commit)

## Reglas de arte (innegociables)
1. Colores SOLO desde `src/palette.ts` (añadir allí los nuevos, con nombre semántico).
2. Sin texturas: primitivas flat-shaded; la riqueza sale de proporción, variación y sombra.
3. Luz firmada: sol cálido lateral con sombras largas + ambiente frío. No tocar sin motivo.
4. Cámara ortográfica isométrica: azimut 45°, elevación 32°. La elevación nunca cambia.
5. Nada se repite exacto: variación por RNG con semilla (`src/rng.ts`); prohibido `Math.random()` en lógica de mundo.
6. Toda tarea visual termina con screenshot del preview y el checklist §4 del ROADMAP.

## Arquitectura
Contratos en ROADMAP.md §1 (grid, worker de sim, protocolo de mensajes, presupuestos
de rendimiento). Son inmutables salvo conflicto documentado en ROADMAP.md §6.
