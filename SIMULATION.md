# SIMULATION.md — Guía de la simulación para el agente (Claude Sonnet)

Este documento explica **cómo funciona la lógica de simulación ya construida**
(Fase 3 del ROADMAP), qué decisiones de diseño son intocables, qué queda por
hacer y las trampas conocidas. Léelo ENTERO antes de tocar nada en `src/sim/`.
El ROADMAP.md sigue siendo el plan maestro; esto es el mapa del territorio.

---

## 1. La idea en una frase

La sim es una **clase pura sin THREE ni DOM** (`sim/simulation.ts`) que avanza
por ticks fijos y deterministas dentro de un **Web Worker**; el hilo principal
solo recibe snapshots planos (`Float32Array`) e **interpola** para animar a
60 fps. Si respetas esa frontera, no puedes romper el render; si la cruzas,
lo rompes todo.

## 2. Mapa de archivos (quién hace qué)

```
src/sim/
  simulation.ts     # ORQUESTADOR. Autómata del ciudadano + tick. Headless.
  clock.ts          # Reloj: 1 día = 10 min reales. TICK_GAME_S = 36 s de juego.
  protocol.ts       # ÚNICA frontera main↔worker. Tipos de mensajes + layout snapshot.
  worker.ts         # Envoltorio del worker: setInterval 250 ms → N sub-ticks.
  client.ts         # Main-thread: dos snapshots + interpolación (view()).
  geometry.ts       # Transitabilidad, entradas de edificio, manhattan. Compartido.
  pathfinding.ts    # A* RESUMIBLE con presupuesto por tick (PathQueue).
  worldIndex.ts     # Índice de edificios por rol + puntos de paseo. rebuild() tras construir.
  economy.ts        # Empleos reales por edificio, visitas a tiendas, prosperidad.
  citizens/
    citizen.ts      # Datos puros del ciudadano + fases del autómata.
    needs.ts        # 5 necesidades [0,1], decaimiento por personalidad, urgencia().
    brain.ts        # utility AI: score = urgencia × idoneidad × cercanía × personalidad × ruido.
    activities.ts   # Definición de actividades (dónde, cuánto, qué restaura, curvas).
    social.ts       # Charlas emergentes al cruzarse + afinidades.
  sim.test.ts       # Tests headless (npm test). SIEMPRE verdes antes de commit.

src/world/
  catalogData.ts    # Datos del catálogo SIN THREE (la sim importa ESTE).
  catalog.ts        # catalogData + build() de meshes (solo render).
src/world/render/
  citizens.ts       # InstancedMesh de ciudadanos (2 draw calls). Bobbing/fade aquí.
```

## 3. Contratos intocables (además de §1 del ROADMAP)

1. **Nada de THREE/DOM en `src/sim/`** — se comprueba fácil: la sim corre en
   `tsx` (los tests). Si un test deja de arrancar por un import, has roto esto.
2. **Determinismo**: toda aleatoriedad via `createRng(seed)`. La sim tiene DOS
   rngs (general y social) sembrados desde la semilla del mundo. Prohibido
   `Math.random()`/`Date.now()`. El test de determinismo lo vigila.
3. **El autómata del ciudadano** tiene 4 fases (`citizen.ts`):
   `deciding → waitingPath → moving → doing → deciding`. Cualquier
   comportamiento nuevo se cuelga de ese ciclo, no lo puentea. La ÚNICA
   excepción legítima es la charla (social.ts) que interrumpe `moving`.
4. **Cero horarios hardcodeados.** El día emerge de curvas: `clock.darkness`
   (coseno suave 0=mediodía 1=medianoche) × urgencia de necesidad. Si te ves
   escribiendo `if (hour > 22)`, para y usa una curva en `activities.ts`.
5. **Snapshot plano**: `AGENT_STRIDE = 6` floats `[id,x,z,heading,state,activity]`,
   x/z en CELDAS float. Si necesitas más columnas, cambia `AGENT_STRIDE` en
   `protocol.ts` Y el writer (`simulation.snapshot()`) Y el reader (`client.view()`)
   en el MISMO commit.
6. **PathQueue**: nunca hagas A* síncrono por ciudadano. Pide ticket con
   `request()`, recoge con `take()`. El presupuesto (4000 expansiones/tick)
   garantiza el tick ≤ 50 ms; si las rutas tardan en llegar, sube el
   presupuesto, no lo rodees.

## 4. Cómo se decide un ciudadano (para depurar comportamiento)

`brain.chooseActivity()` puntúa cada `ActivityDef` de `activities.ts`:

```
score = urgency(need) × suitability(ctx) × proximity × personality × noise
```

- `urgency` (needs.ts): cuadrática al vaciarse + pánico < 0.25. Depósito lleno ≈ 0.
- `suitability`: curva continua de la hora (via darkness). Dormir sube de noche.
- `proximity = 60/(60+distManhattan)`: lo lejano pierde.
- `noise`: 0.85-1.15 con RNG determinista (variedad sin caos).
- Umbral de apatía 0.05: si nada supera eso, el ciudadano queda idle.

**Para depurar "¿por qué X hace Y?"**: reproduce en un test headless (copia el
patrón de `sim.test.ts`), registra `describe(id)` por tick y mira las
necesidades. NO añadas logs al worker en caliente: hazlo headless.

Tuning: los números "de juego" viven en pocos sitios — decaimientos en
`needs.ts` (DECAY_PER_HOUR), restauraciones/duraciones en `activities.ts`,
velocidad de paseo en `simulation.ts` (WALK_CELLS_PER_TICK = 0.9 celdas/tick).

## 5. Estado actual (2026-07-03, sesión Fable)

Hecho y con tests verdes (14/14, `npm test`):
- **Fase 4 (lógica)**: `world/growth.ts` — demanda desde el estado real
  (computeDemand: trabajo si paro>35% o parados sin vacantes; vivienda si no
  hay huecos y hay vacantes; comercio si prosperidad alta), parcelas junto a
  vía con retranqueo y fachada a la calle (findParcel), compacidad hacia el
  centro de masa. La sim intenta crecer 1 vez/hora de juego, solo de día.
  El worker construye en SU grid y emite `cityGrew`; el main replica con
  `worldGrid.placeBuilding` + `worldView.refreshChunkAt` (ver main.ts).
  Inmigración: cada vivienda nueva se llena de familias (`fillHome`).
  Tiers T4.5: pop 25→T2, 80→T3, 200→T4 (evento `tierUnlocked`, sin UI aún).
- T3.10 inspector: click en ciudadano → tarjeta (nombre, actividad, barritas);
  F sigue, Esc cierra (`ui/inspector.ts`).
- BUG ARREGLADO: `clock.darkness` estaba invertida (1 a mediodía). Si tocas
  esa curva, añade un check de cordura: darkness(0h) ≈ 1, darkness(12h) ≈ 0.
- T3.1 worker+protocolo+reloj (velocidades 0-3 con teclas 0-3; HUD F3 muestra reloj).
- T3.2 A* incremental (falta suavizado de esquinas VISUAL, ver §6).
- T3.3 ciudadano+necesidades. T3.4 cerebro (día coherente verificado por test).
- T3.5 actividades: sleep, work, eat, shop, stroll, visit (falta: mirar
  escaparate, sentarse — son triviales: nuevas entradas en ACTIVITIES).
- T3.6 PARCIAL: instanciado con interpolación, bobbing, fade inside/outside.
  Falta: LOD sin bobbing a zoom lejano, y verificación visual con 500.
- T3.7 charlas emergentes (cara a cara, afinidad creciente, cooldown).
- T3.8 economía: empleos reales, visitas a tiendas, prosperidad media móvil.
  Falta: feedback visual de campos por franjas (necesita render de terreno).

## 6. Trabajo pendiente, en orden recomendado

1. **T3.10 Inspector** (la ventana para VERIFICAR la autonomía): raycast click →
   agente más cercano → `simClient.queryCitizen(id)` → tarjetita DOM (estilo del
   debugHud). El worker ya responde `citizenInfo` con `activityLabel` en español.
   Tecla F para seguir al ciudadano (mover target de cámara al agente).
2. **T3.6 restante**: LOD por `camera.zoomIndex` (pasa el índice a
   `CitizenView.update`); prueba de estrés con un grid sintético de 500+.
3. **Suavizado visual de esquinas**: en `client.ts` o `citizens.ts`, redondea
   la posición interpolada cerca de waypoints (bezier corto). NO toques el path
   lógico del worker.
4. **T3.9 Vehículos**: nuevo estado del autómata (`moving` con modo 'drive'),
   velocidad por terreno en geometry.ts (road más rápida para coches),
   snapshot: añade columna `mode` (ver contrato 5 de §3).
5. **Fase 2 (construcción)**: cuando el jugador construya, envía `ActionMsg` al
   worker (el handler 'action' ya reindexay reconstruye economía; 'place' está
   pendiente de completar con footprint de catalogData — nota en worker.ts).
6. **Fase 4 (growth)**: la sim ya expone lo que necesita: `economy.stats()`,
   `economy.prosperity`, viviendas via `index.ofRole('residential')` vs
   población. `growth.ts` debe decidir QUÉ construir y emitir la misma ruta
   que una acción de jugador (grid.placeBuilding + index.rebuild()).

## 7. Trampas conocidas (aprendidas construyéndolo)

- **Orden de iteración de Maps**: es de inserción; tras deserializar un grid
  puede variar → `worldIndex.rebuild()` ORDENA edificios y spots por coordenada
  para mantener el determinismo. Si añades otra colección al índice, ordénala.
- **`removeBuilding` escanea 40×40 desde el ancla** (grid.ts): válido para el
  catálogo actual (máx 10 celdas), no para futuros mega-edificios.
- **social.detectEncounters es O(n²)** sobre caminantes: bien hasta ~200
  simultáneos; con más, hash espacial por celda (bucket = floor(x/4),floor(z/4)).
- **El RNG general se consume en spawn Y en decisiones**: cambiar el orden de
  spawn cambia TODO el futuro (es esperado, no un bug — pero no "reordenes por
  limpieza" sin actualizar las expectativas de tests).
- **`beginDoing` teleporta al agente a la puerta** si decide algo a ≤1 celda:
  correcto (evita micro-paths), pero si ves un "saltito" visual de 1 celda, es esto.
- **El worker también manda snapshot en pausa** (velocidad 0): así el HUD sigue
  fresco. No lo "optimices" quitándolo.
- Los tests corren la sim SIN worker (tsx no tiene Worker): todo lo nuevo de
  lógica debe vivir en `simulation.ts`/módulos puros, no en `worker.ts`.

## 8. Definición de "hecho" para cualquier cambio de sim

1. `npx tsc --noEmit` limpio.
2. `npm test` verde (añade checks para tu feature al estilo de los existentes).
3. Si cambia comportamiento observable: arrancar preview, velocidad ×8 durante
   un día de juego (75 s reales) y describir lo observado en el diario del
   ROADMAP (§6). Screenshot si es visual.
4. Presupuestos: tick ≤ 50 ms (hay test), draw calls ≤ 200 (HUD F3).
5. Commit `T<fase>.<n>: <resumen>`.
