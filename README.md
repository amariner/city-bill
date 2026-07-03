# city-bill

City builder minimalista para navegador con estética low-poly isométrica:
paleta pastel desaturada, flat shading, sombras largas y cero texturas.

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173
```

## Stack

- **Three.js** — render 3D real con cámara **ortográfica isométrica** (azimut 45°, elevación 32°). 3D de verdad (no sprites) para poder rotar la cámara y animar luz/estaciones más adelante, pero con proyección ortográfica para el look "de maqueta".
- **TypeScript + Vite** — DX rápida, build para navegador sin config.
- **Sin frameworks de juego** — el motor es pequeño y a medida; un engine genérico añadiría peso sin aportar al estilo.

## Arquitectura

```
src/
  palette.ts       # ÚNICA fuente de verdad del color. Ningún material define color fuera de aquí.
  rng.ts           # RNG con semilla — el mundo es determinista.
  props.ts         # Fábrica de props low-poly (árboles, casa, granero, cobertizo).
  neighborhood.ts  # Composición del primer barrio (campos, carreteras, parcela, pueblo).
  showcase.ts      # Expositor de todos los edificios (?scene=buildings).
  main.ts          # Renderer, cámara isométrica y firma de iluminación.
```

### Reglas de la dirección de arte

1. Colores solo desde `PALETTE`. Tonos tierra desaturados, verdes casi negros en árboles, acentos rojizos apagados.
2. Sin texturas: la riqueza visual sale de proporciones, variación procedural y sombras.
3. Luz firmada: sol cálido lateral (sombras largas PCF soft) + ambiente frío azulado + hemisférica suave.
4. Geometría low-poly facetada: primitivas y extrusiones, nunca subdivisiones altas.
5. Nada se repite exacto: cada árbol/edificio varía escala, rotación y tono vía el RNG con semilla.

Ver [ROADMAP.md](ROADMAP.md) para el plan de desarrollo completo.
