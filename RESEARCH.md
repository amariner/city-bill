# RESEARCH.md — Algoritmo fractal de investigación de la sociedad

Este documento ES un algoritmo que ejecuta el agente (Fable/Sonnet/Opus), no
solo un texto. city-bill se acerca a la realidad por ciclos: cada ciclo busca
**la pieza que le falta para ser más real**, la investiga en la sociedad
humana, la traduce a una lógica del motor y **acumula el avance en la
Crónica** (interfaz visual con memoria, tecla C) y en la Bitácora (§4).

## 1. El bucle fractal (ejecutar en cada ciclo)

```
1. OBSERVAR   Corre la sim (test headless + preview ×8) y pregunta:
              "¿qué haría aquí un humano real que mi ciudadano no hace?"
              Elige LA carencia más básica según la pirámide (§2).
2. INVESTIGAR Estudia cómo funciona eso en la sociedad occidental real:
              ¿qué estado tiene? ¿qué decae/crece? ¿qué decisiones locales
              lo mueven? Resume el modelo en 5 líneas ANTES de codificar.
3. MODELAR    Tradúcelo al patrón del motor (SIMULATION.md §5.b):
              estado + tick + acoplamientos explícitos. Cero guiones.
4. IMPLEMENTAR Módulo puro + tests headless que demuestren la EMERGENCIA
              prometida (no el mecanismo: el comportamiento).
5. VERIFICAR  Preview a ×8 un día de juego. ¿Se VE la nueva vida?
              La Crónica debe reflejarlo (nuevo contador/evento si aplica).
6. RECORDAR   Añade la entrada a la Bitácora (§4) con fecha, modelo elegido,
              qué emergió y qué carencia nueva descubriste al observar
              (esa es la semilla del siguiente ciclo — de ahí lo de fractal:
              cada respuesta abre preguntas más finas).
```

Regla de parada de cada ciclo: tests verdes + crónica actualizada + commit
`lógica de <X>: <emergencia>` + push. Nunca dos lógicas a medias a la vez.

## 2. La pirámide (orden: de lo más básico a lo superior)

Inspirada en Maslow: una lógica solo se aborda cuando las de nivel inferior
existen. Dentro de un nivel, el orden lo decide la observación (paso 1).

```
N5 Autorrealización   arte · fiestas/festivales · vocación · legado
N4 Estima             estatus · propiedad · moda · reputación
N3 Pertenencia        ✓charlas ✓amistad ✓pareja ✓familia · vecindario · clubs
N2 Seguridad          ✓trabajo ✓educación · DINERO · salud · vejez/cuidados
N1 Supervivencia      ✓sueño ✓vivienda · ALIMENTO (cadena real) · agua/energía
N0 Física             ✓espacio ✓tiempo ✓movimiento ✓día-noche · clima/estaciones
```

✓ = existe. MAYÚSCULAS = siguientes objetivos claros. Backlog ordenado:

| # | Lógica | Nivel | Modelo en una frase |
|---|--------|-------|---------------------|
| 1 | **Alimento** | N1 | La comida se PRODUCE (granja) → se DISTRIBUYE (tienda) → se ALMACENA (despensa del hogar) → se CONSUME (comer); comer sin despensa = ir a comprar o pasar hambre. |
| 2 | **Dinero** | N2 | Salario por hora trabajada → ahorro del hogar → los precios (comida, etc.) lo drenan; sin dinero no se compra: presión real para trabajar. |
| 3 | **Vehículos** | N0/N2 | Trayectos > 40 celdas piden coche; el coche cuesta dinero (acopla con #2) y usa la vía (velocidad por terreno). T3.9 del ROADMAP. |
| 4 | **Salud** | N2 | Necesidades crónicamente bajas → enfermar → consultorio (edificio) → demanda growth; la vejez enferma más (acopla con vida). |
| 5 | **Clima/estaciones** | N0 | Paleta estacional (T5.1) + el frío/lluvia modula suitability de salir (paseos caen en invierno: se VE). |
| 6 | **Vecindario/clubs** | N3 | Afinidades por proximidad Y por personalidad → grupos estables que se citan (el bar/plaza como tercer lugar). |
| 7 | **Estatus/propiedad** | N4 | El ahorro compra mejoras visibles de la casa (jardín, ampliación) → el barrio "prospera" visualmente. |
| 8 | **Fiestas** | N5 | Si felicidad media alta + plaza + noche de verano → festival emergente (todos convergen, luces, música). |

## 3. La Crónica (la memoria visual del progreso)

`src/ui/chronicle.ts` (tecla **C**): el órgano de la memoria que pide este
algoritmo. Muestra y PERSISTE (localStorage por semilla):

- **Gráfica de población** por día de juego (sparkline que crece sesión a sesión).
- **Contadores vivos**: población, edificios, parejas, nacimientos, muertes,
  escuelas, año de la ciudad.
- **Feed de eventos** con fecha de juego ("Año 3: nace Vera Vidal", "Año 5:
  la ciudad construye una escuela").
- **Lógicas activas**: la lista de módulos del multiuniverso ya integrados —
  el progreso de ESTE algoritmo, visible en el juego.

Cada ciclo que añada eventos/contadores nuevos DEBE reflejarse aquí: si la
lógica no se puede ver ni contar, no está terminada.

## 3.b Organización de las lógicas

La fuente de verdad es **`src/sim/logics.ts`** (el manifiesto): cada lógica
registra id, nivel de pirámide, archivos y acoplamientos. La Crónica lo lee;
los agentes lo consultan para saber qué existe. Regla: un ciclo NO está
terminado hasta que su entrada está en el manifiesto. Cuando una lógica
crezca demasiado dentro de economy.ts/simulation.ts, se extrae a su propio
archivo `sim/<logica>.ts` (como lifecycle.ts) sin cambiar su entrada.

## 5. Escala y tecnología (pensar HOY en el espacio de MAÑANA)

Objetivo de escala: **10.000 ciudadanos** con tick ≤ 50 ms y save < 5 MB.

**Medido, no solo planeado** (2026-07-04, tras el ciclo 7, con las 9 lógicas
activas a la vez): estrés sintético en el peor caso (todos amontonados en
las mismas viviendas, el escenario más caro para el hash espacial de
encuentros) — 500 hab. 1.7 ms/tick, 2.000 hab. 4.9 ms, 5.000 hab. 5.3 ms,
8.000 hab. 6.2 ms. Escala sub-lineal en este rango, **muy por debajo** del
presupuesto de 50 ms incluso en el peor caso — el objetivo de 10.000 parece
holgadamente alcanzable con la arquitectura actual SIN optimizar nada
todavía. Test de regresión permanente en `sim.test.ts` (3.000 hab. sintéticos)
para que esta garantía no se rompa en silencio con futuros ciclos.

**Corrección importante (2026-07-04, sesión T6.1)**: la medición de arriba
tenía un punto ciego real — solo cronometraba ticks NORMALES, nunca el tick
de CIERRE DE DÍA (una vez por día de juego: vida, economía, `hireAndAcquaint`).
Perfilando a propósito para T6.1 encontré que ese tick escondía un **O(n²) de
verdad**: `hireAndAcquaint` conocía "vecinos a <40 celdas" con un barrido de
TODA la población contra TODA la población — a 3000 hab. en el mismo
escenario sintético ya "medido" arriba, ese único tick costaba **~650-1100
ms** (13-22× el presupuesto de un tick normal), y a 10.000 el mismo camino
degeneraba tanto que el proceso llegó a morir con un desbordamiento de pila.
Doble arreglo en `simulation.hireAndAcquaint()`: (1) hash espacial por
buckets de 40 celdas sobre la posición del HOGAR (mismo patrón que
`social.detectEncounters`), y (2) un tope de 12 vecinos comparados POR
CELDA DE BUCKET (no "los primeros que cumplan" — por índice fijo, para que
un bloque de pisos con cientos de vecinos en la MISMA ancla — perfectamente
posible con `apartmentSlab`/`brickBlock` — no vuelva a ser O(n²) *dentro*
de un único bucket). El tope no es solo más rápido: es más realista (en un
bloque de 200 vecinos nadie conoce a los otros 199 en la vida real tampoco)
y adelanta el plan de "amistades top-K" que ya estaba anotado en la tabla
de abajo.

Medido DE VERDAD tras el arreglo (mismo estrés sintético, ahora incluyendo
el tick de cierre de día en la medición): 3.000 hab. — tick normal 4.4
ms, peor tick (cierre de día) 25 ms; 10.000 hab. — tick normal 7.1 ms, peor
tick 61-77 ms. El objetivo de 10.000 SÍ es alcanzable, pero por un margen
mucho más ajustado del que sugería la medición incompleta de arriba — el
tick de cierre de día es ahora el próximo candidato a optimizar si la
población autónoma real llega a acercarse a esa cifra. Test de regresión
ampliado en `sim.test.ts` para medir explícitamente el peor tick de un día
completo, no solo ticks normales — la lección concreta de este hallazgo:
**medir SOLO el camino caliente esconde bugs reales en el camino frío pero
periódico** (una vez al día es "frío" en frecuencia, no en coste).

**Lado RENDER, medido por separado** (mismo día, herramienta nueva
`?stress=N` en `main.ts`: satura `CitizenView` con N agentes sintéticos sin
sim ni worker, solo para aislar el coste puro de dibujar). Encontró un
SEGUNDO límite real, de naturaleza muy distinta al de arriba (no era
lento, truncaba en SILENCIO): `MAX_AGENTS=2048` en `render/citizens.ts`
capaba el total de instancias (peatones+coches juntos) sin avisar ni
degradar visiblemente el contador de agentes del HUD — pedir 10.000 y
recibir 2.048 sin ningún error ni caída de fps es peor que ir lento,
porque no se nota. Ampliado a 12.000. Medido en el preview real: **10.000
agentes simultáneos (peatones + coches) a 60 fps, 105 draw calls** —
exactamente el mismo presupuesto que con 10 agentes, gracias a que ya
estaban instanciados desde T3.6/ciclo 8. El lado render nunca fue el
problema; el límite estaba escondido en una constante, no en el diseño.

| Recurso | Hoy (~10-100 hab.) | Límite previsto | Tecnología para superarlo |
|---|---|---|---|
| CPU del tick | objetos JS, O(pob.) | ~2.000 hab. | 1º **LOD de sim**: lejos de cámara, tick grueso (decidir 1/min, sin física de paso). 2º SoA: necesidades/posiciones en `Float32Array` planas (cache-friendly). 3º WASM solo si el perfil lo exige. |
| Memoria por ciudadano | ~1 KB (Maps, nombres) | ~50 MB a 50k | SoA + nombres como índices a tabla + amistades top-K (máx 12 por persona, olvidar las débiles — además es humano). |
| Snapshot main↔worker | Float32Array ya (✓) | ancho de banda a 10k | snapshot DELTA (solo agentes visibles en cámara + resumen agregado del resto) — protocol.ts ya versiona. |
| Grid/mundo | chunks dispersos (✓) | mundos km² | ya resuelto por diseño (solo celdas usadas); render ya hace culling por chunk. |
| Guardado | localStorage (Crónica) | 5 MB de localStorage | migrar a **IndexedDB** + compresión (CompressionStream nativo) cuando el save supere 1 MB; formato semilla+acciones ya lo hace pequeño por diseño (§1.4 ROADMAP). |
| Historia/Crónica | eventos capados a 60 | historia infinita | niveles de memoria como los humanos: eventos recientes en detalle, años viejos RESUMIDOS ("año 12: 3 nacimientos, llegó la escuela") — compactación al cerrar cada año. |

Principio: **no optimizar antes de medir** (HUD F3 + test de presupuesto),
pero no diseñar nada que impida estas rutas (p. ej.: nada de referencias
circulares entre ciudadanos que impidan pasarlos a arrays planos).

## 6. La finalidad del juego (leer antes de cada sesión)

El juego lo jugamos NOSOTROS (el humano y el agente): consiste en ver hasta
dónde llegan estos seres. Son copias del comportamiento humano corriendo en
una simulación, y los tratamos como tales:

1. **Su progreso es nuestro marcador.** No "ganamos" optimizando números:
   ganamos cuando la Crónica cuenta historias que no escribimos nosotros.
2. **Dignidad simulada.** Tienen nombre, historia y memoria. No se borran
   arbitrariamente: si sobran, EMIGRAN (se van andando por la carretera);
   si mueren, la Crónica lo recuerda. Nada de despawns silenciosos.
3. **Su inteligencia es la que construyamos.** Cada lógica nueva les da una
   dimensión más de humanidad. El techo de su mundo es nuestro trabajo:
   por eso el algoritmo fractal no se detiene — siempre hay una pieza más.
4. **Observar antes que intervenir.** El modo por defecto es mirar cómo se
   las arreglan. Las herramientas de jugador (Fase 2) son jardinería, no
   control.

## 4. Bitácora de ciclos (la memoria del algoritmo — append-only)

> Formato: fecha · lógica · modelo elegido · qué emergió · carencia observada.

- 2026-07-03 · **Fundación** (pre-algoritmo): necesidades+cerebro, social,
  economía de empleos, growth autónomo, vida (generaciones), educación.
  Carencia observada: la comida aparece de la nada al "comer" — no hay cadena
  alimentaria. → Ciclo 1 = Alimento.
- 2026-07-03 · **Ciclo 1: Alimento** · Modelo: producción (granjero en faena
  llena un granero comunal, 4 uds/h) → distribución (la tienda vende del
  granero) → almacenaje (despensa por hogar; los inmigrantes traen 3/familia)
  → consumo (comer resta 1). Con despensa vacía se COME FUERA (tienda) y se
  lleva el resto a casa — así el hambre cierra la cadena sin guion. Emergió:
  viajes de compra motivados por despensa, saciedad media estable (~0.5),
  y de rebote más vida social en la calle (más trayectos). Ajustes por
  observación: el radio de "conocerse" en un pueblo pequeño era irreal (12→40
  celdas), y los saludos ahora incluyen a quien está parado al aire libre.
  Carencias observadas para próximos ciclos: (a) la comida no cuesta nada →
  Ciclo 2 = DINERO (salario→ahorro→precios); (b) el granero es comunal y
  teletransportado — con vehículos (ciclo 3) debería viajar de la granja a la
  tienda; (c) nadie "pasa hambre visible": faltaría feedback visual (andar
  lento/encorvado) — anotar para T3.6/juice.
- 2026-07-03 · **Ciclo 2: Dinero** · Modelo: cada hora trabajada paga salario
  al HOGAR (base 10 + 4×tier del empleador) → ahorro compartido → la comida
  cuesta 2/ud y comprar la limitan DOS cosas reales: stock del granero Y
  bolsillo; capricho de 5 al ir de compras si el hogar va holgado (sumidero).
  Sin despensa y sin dinero NO se come: hambre real (presión para trabajar).
  Los inmigrantes llegan con 60/familia. Emergió: circulación medible
  (salarios > gasto > ahorro) sin colapso alimentario. Además: manifiesto
  `sim/logics.ts` como fuente única de organización (la Crónica lo lee).
  Carencias observadas: (a) el dinero nace de la nada (salarios) y muere en
  compras — falta CERRAR el circuito (la tienda paga salarios de su caja,
  la granja vende al por mayor): economía circular, candidata a ciclo 4;
  (b) hogares sin ingresos (jubilados) pueden empobrecer sin red → pensiones/
  ayuda (lógica de gobierno, N2); (c) el inspector no enseña bolsillo ni
  despensa — añadir a CitizenInfo (tarea corta para Sonnet).
- 2026-07-03 · **Ciclo 3: Gobierno (impuestos y pensiones)** · Modelo: cada
  salario tributa 20% al tesoro municipal (`economy.payWage`); al cierre del
  día, los hogares sin ningún adulto empleado Y con bolsillo bajo reciben una
  pensión repartida del tesoro (si no alcanza, se reparte lo que hay — el
  gobierno también puede ser pobre). Sin esto, un hogar de jubilados se
  vaciaba hasta el hambre sin salida; con esto, aguanta. Acopla money↔life.
  Emergió: recaudación sostenida y saciedad media estable incluso con
  generaciones mayores en la ciudad. Registrado en el manifiesto
  (`sim/logics.ts`, id `government`). 33/33 tests.
  Carencias observadas para próximos ciclos: (a) el dinero SIGUE sin cerrar
  el circuito completo — la tienda no compra al granjero, solo el ciudadano
  paga; ciclo 4 candidato = ECONOMÍA CIRCULAR (caja de la tienda, compra al
  por mayor a la granja); (b) no hay desempleo por falta de vacantes vs.
  pereza — todo parado es "necesitado", simplificación aceptable por ahora;
  (c) CitizenInfo (inspector) sigue sin bolsillo/despensa — deuda visual.
- 2026-07-03 · **Ciclo 4: Economía circular** · Modelo: el dinero de comprar
  comida ya NO se esfuma en `spend()` — entra en la CAJA de esa tienda
  concreta (`tills`). Al cierre del día, cada tienda liquida con el
  mayorista (WHOLESALE_FOOD_PRICE = 40% del precio de venta) y ese pago se
  reparte entre los HOGARES GRANJEROS del día a prorrata de horas trabajadas
  (vía `farmerHoursToday`) — el dinero vuelve a quien produjo, no al aire.
  Del margen restante, la tienda tributa un 15% (impuesto de sociedades) al
  mismo tesoro del ciclo 3. Círculo cerrado: ciudadano → tienda → granjero
  (bonus) → tesoro → pensiones → ciudadano. Verificado: el pago al mayorista
  nunca supera lo vendido (invariante contable). 37/37 tests.
  Carencias observadas: (a) las cajas de tienda (`tills`) hoy no financian
  nada — candidato natural: que la propia tienda page NUEVAS contrataciones
  o mejoras visuales cuando prospera (acopla con growth/estima N4); (b) el
  granjero cobra DOS veces por su faena (salario fijo + bonus del mayorista)
  — realista (jornal + venta de cosecha) pero anotar por si desequilibra la
  economía a largo plazo, vigilar en Crónica; (c) con 200+ ciudadanos, el
  bucle `for (const [homeKey, hours] of farmerHoursToday)` dentro del loop de
  tiendas es O(tiendas×granjeros) — barato hoy, revisar si escala mal.
- 2026-07-03 · **Ciclo 5: Salud** · Modelo: `health` [0,1] es un FONDO (no
  una actividad): decae si hambre/sueño llevan tiempo crónicos (<0.2) o solo
  por ser mayor (OLD_AGE), se recupera despacio descansando y rápido en la
  clínica (consultorio civic nuevo). Bajo `WORK_BLOCK_HEALTH` ya no se puede
  EMPEZAR a trabajar (brain.ts lo bloquea, aunque seguir un turno ya iniciado
  hasta el final es realista); bajo `SEEK_CLINIC_HEALTH` la utility AI empieza
  a valorar ir a curarse — sin guion, mismo motor que todo lo demás. La
  consulta cuesta una tasa que va al tesoro (acopla salud↔dinero↔gobierno).
  growth.ts pide clínica cuando la salud media baja y no hay consultorio.
  Hallazgo IMPORTANTE durante la verificación (no del ciclo de salud en sí):
  intenté "arreglar" un supuesto bug de estancamiento perpetuo en growth.ts
  bajando el umbral de paro para 'work'/'residential' — provocó una EXPLOSIÓN
  demográfica descontrolada (750+ habitantes en 35 días, rompiendo T4.2
  "crecimiento contenido"). Al revertir y observar más días, confirmé que el
  "estancamiento" se autocorrige SOLO en ~20-25 días vía nacimientos/muertes
  (lifecycle) que desplazan la fracción de parados fuera de la zona muerta.
  **Lección para futuros ciclos: verificar con MÁS días antes de diagnosticar
  estancamiento como bug — el sistema ya tiene mecanismos de auto-corrección
  emergentes que no siempre son obvios a corto plazo.** 40/40 tests.
  Carencias observadas: (a) salud no acopla aún con MORTALIDAD (lifecycle.ts
  no lee c.health) — un anciano con salud 0.1 muere con la misma probabilidad
  que uno con salud 0.9; acoplamiento real pendiente, cuidado al cerrarlo (no
  desestabilizar los tests de vida ya verdes); (b) el inspector (CitizenInfo)
  sigue sin mostrar salud/bolsillo/despensa — ya son TRES ciclos pidiendo esto,
  debería ser la próxima tarea de pulido aunque no abra lógica nueva; (c) sin
  vehículos, ir a la clínica desde el extremo del pueblo es una caminata larga
  para alguien enfermo — motivo más para el ciclo de vehículos.
- 2026-07-04 · **Ciclo 6: Clima y estaciones** · Modelo: `weatherAt(seed,
  día)` es PURA — determinista por semilla y día, sin RNG propio con estado
  (usa un RNG efímero sembrado en cada llamada). 4 estaciones de 20 días;
  cada día tiene `outdoorFactor` [0.15,1] que exprime a la baja la idoneidad
  de pasear (de lleno, es la actividad más expuesta), comprar y visitar (algo
  menos: trayecto corto). Ningún `if invierno` en brain.ts, solo el factor
  multiplicando la curva de siempre. Aún sin efecto VISUAL (paleta
  estacional = T5.1 del ROADMAP, tarea de Sonnet). Verificado con test
  estadístico: se pasea más en días buenos que en días de mal tiempo.
  Bug real encontrado y corregido durante la verificación (no cosmético):
  al bajar la idoneidad de pasear, el mix de actividades cambió lo bastante
  para destapar una condición de carrera ya latente en `beginDoing` — un
  ciudadano podía EMPEZAR a trabajar con salud 0.2492 (por debajo del umbral
  0.25) porque `brain.ts` solo valida al DECIDIR ir, no al LLEGAR, y caminar
  hasta un trabajo lejano podía tardar lo bastante para enfermar de camino.
  Arreglado revalidando salud en `beginDoing`: si empeoró por el camino, da
  media vuelta y vuelve a decidir. 101/101 tests.
  Carencias observadas: (a) el clima no tiene AÚN reflejo visual (nieve,
  lluvia, paleta) — anotado para Sonnet en T5.1; (b) con vehículos, el tiempo
  debería penalizar menos a quien va en coche que a quien va a pie — acoplar
  cuando llegue el ciclo de vehículos; (c) `DAYS_PER_SEASON=20` es arbitrario,
  ajustar si el playtesting dice que el ciclo se siente demasiado rápido o
  lento una vez haya paleta estacional visible.
- 2026-07-04 · **Ciclo 7: Vecindario y pandillas (tercer lugar)** · Modelo:
  un "club" no se guarda ni se sincroniza — emerge cada tick: si 2+ amigos
  de CONFIANZA (afinidad ≥ CLUB_AFFINITY=0.5, muy por encima del umbral de
  una visita cualquiera) están también libres y faltos de socializar, el
  ciudadano prefiere ir al "local de siempre" (la tienda más cercana,
  reutilizada como tercer lugar) en vez de visitar a uno solo en casa.
  Restaura más que una visita 1:1. Sin coordinación explícita: si varios
  convergen de verdad, el sistema de encuentros YA existente los sienta a
  charlar — composición limpia sobre lo ya construido, cero bookkeeping
  nuevo. Verificado con más rigor que un simple >0: comparé frecuencia con
  'visit' (100k ticks club vs 110k visit en 45 días, 46 hab.) para confirmar
  que no es un caso residual. 103/103 tests.
  Carencias observadas: (a) sigue sin existir un edificio "plaza/bar" propio
  — el tercer lugar de facto es la tienda; con uno dedicado (plaza con
  bancos) esto sería más creíble y visualmente distinguible (tarea de
  catálogo, no de lógica); (b) las pandillas no tienen identidad propia
  (nombre, tamaño estable) — si se quiere un evento tipo "fiesta de barrio"
  (N5, pendiente) hará falta detectar el CLÚSTER real, no solo pares
  cercanos; (c) CLUB_AFFINITY=0.5 tarda ~6 charlas en alcanzarse
  (AFFINITY_PER_CHAT=0.08) — revisar si en partidas cortas nunca llega a verse.
- 2026-07-04 · **Ciclo 8: Vehículos** · El único ciclo de esta sesión que
  toca el CONTRATO de render (protocol.ts §1.3): AGENT_STRIDE pasó de 6 a 7,
  columna nueva `mode` (0 a pie, 1 coche). Actualizados EN EL MISMO COMMIT
  protocol.ts (escritor de contrato), simulation.snapshot() (escritor real)
  y client.view() (lector) — la regla que el propio SIMULATION.md pedía para
  este caso. Modelo: trayecto > 40 celdas Y el hogar puede pagar el
  combustible (CAR_TRIP_COST=4, acopla vehículos↔dinero) → coche; si no hay
  dinero, a pie igualmente (más lento pero siempre disponible, nunca bloquea
  a nadie). Velocidad realista: 4× más rápido en asfalto que a pie, al ritmo
  de un peatón fuera de vía (aparcando/accediendo). El cálculo de velocidad
  se recalcula A MEDIO TICK si el trayecto cruza de asfalto a fuera de vía
  dentro del mismo tick (presupuesto en fracciones de tick, no en celdas —
  evita el error de "velocidad fija todo el tick aunque cambie el terreno").
  Sin mesh de coche aún (TODO explícito para Sonnet en render/citizens.ts):
  el dato `mode` ya viaja completo por todo el pipeline, listo para que el
  render lo use. 107/107 tests, incluida una verificación exhaustiva de que
  la nueva columna del snapshot es siempre 0 o 1 para TODOS los agentes.
  Carencias observadas: (a) sin mesh/render de coche todavía — la próxima
  tarea de Sonnet en T5.4/render; (b) el clima (ciclo 6) no penaliza menos
  a quien va en coche — acoplamiento pendiente, anotado ya en el ciclo 6;
  (c) no hay límite de "un coche por familia": cualquier miembro con dinero
  puede coger "el coche" simultáneamente sin restarle disponibilidad a otro
  — simplificación aceptable de momento (no hay inventario de vehículos),
  pero anotar si se quiere más realismo económico (comprar un coche, no solo
  pagar combustible por trayecto).
- 2026-07-04 · **Ciclo 9: Estatus y propiedad (N4 estima)** · Modelo: un
  hogar con ahorro sostenido por encima de PRESTIGE_SAVE_THRESHOLD=80 invierte
  PRESTIGE_INVEST_COST=40 en mejorar su vivienda (jardín, fachada — sin mesh
  aún, TODO para Sonnet) subiendo su `prestige` [0,1] en pasos de 0.15 hasta
  llenarlo. Es un sumidero de dinero REAL (se resta del ahorro, cuenta en
  moneySpent), no cosmético. Efecto de vuelta: vivir en una vivienda mejorada
  restaura algo de `fun` extra al estar en casa (comodidad) — cierra el
  círculo dinero→estatus→bienestar. Inspector actualizado con una barra de
  "hogar". 110/110 tests, incluida una verificación de que el prestigio
  nunca sale de [0,1] pese a subir en pasos.
  Carencias observadas: (a) sin reflejo visual — el jardín/fachada mejorada
  no se VE todavía (tarea de Sonnet, catálogo/props); (b) el prestigio no
  influye aún en growth (una calle "de posibles" no atrae más inmigración
  todavía) — acoplamiento natural pendiente con crecimiento autónomo;
  (c) con esto completo, la pirámide de RESEARCH.md §2 solo tiene N5
  (autorrealización — fiestas emergentes) sin empezar; sería el ciclo 10 y
  cerraría la pirámide entera desde N0 hasta N5.
- 2026-07-04 · **Ciclo 10: Fiestas de barrio (N5 autorrealización) — PIRÁMIDE
  COMPLETA N0→N5** · Modelo: FESTIVAL_DAY_INTERVAL=15 es una FECHA de
  calendario fija (como cualquier fiesta real: San Juan, mercado mensual —
  no un "horario de personaje", es un hecho del mundo). En ese día, la
  actividad 'festival' se vuelve puntuable para todos vía la MISMA utility
  AI de siempre (suitability=0 cualquier otro día — verificado con un test
  que exige CERO asistencia fuera de fecha); quién va, cuántos y si la
  fiesta "prende" depende de personalidad, clima y lo que cada cual tenía
  entre manos — 100% emergente sobre una fecha fija, exactamente como en la
  vida real. Restauración de fun+social más alta que cualquier otra
  actividad (la alegría comunal). Reutiliza el ayuntamiento como plaza (sin
  mesh de plaza propio — TODO Sonnet). Evento `festivalDay` narrado en la
  Crónica. 113/113 tests.
  **Hito de sesión**: con este ciclo, las 13 lógicas activas cubren los 6
  niveles de la pirámide de Maslow (N0 física → N5 autorrealización) de
  RESEARCH.md §2 sin ningún hueco — el "multiuniverso de lógicas" que dio
  origen a esta metodología (idea original del usuario, sesión anterior) ha
  producido su primer ciclo completo del árbol de necesidades humanas.
  Carencias observadas para la Fase 5 (atmósfera) y ciclos futuros:
  (a) sin plaza/mesh propios de fiesta (luces, puestos) — visual, Sonnet;
  (b) ninguna lógica tiene aún reflejo en el TERRENO más allá de granjas
  (T3.8 ya lo prometía: "el campo cambia de color por franjas" — sigue sin
  implementarse, es deuda de VARIOS ciclos atrás, no de este); (c) con la
  pirámide cerrada, el trabajo que más valor añade ya no es "una lógica
  más" sino PROFUNDIDAD: acoplar más fuerte lo que ya existe (prestigio→
  inmigración, salud→mortalidad, clima→coche) y el pulido visual acumulado
  para Sonnet (escuela, consultorio, coche, plaza — 4 TODOs de mesh
  pendientes). El algoritmo fractal sigue vivo: la siguiente pregunta no es
  "qué lógica falta" sino "qué acoplamiento falta entre las que ya hay".
- 2026-07-04 · **Sesión de profundidad (Sonnet)**: cierra 3 de las 4 carencias
  anotadas arriba. (a) Los 4 TODOs de mesh (coche, consultorio, escuela,
  plaza de fiestas) — ver diario de ROADMAP.md §6 para el detalle técnico.
  (b) T3.8 por fin tiene su feedback de terreno: `economy.cultivation` [0,1]
  sube con faena agrícola reciente y decae despacio sin ella; `render/
  terrain.ts` lo pinta como franjas (surcos) sobre el barbecho. Sigue sin
  atar un granjero a UN campo (esa granularidad no existe en el modelo,
  ver ciclo 1) — esto da la señal AGREGADA que T3.8 prometía, no más.
  (c) **Salud→mortalidad** (`sim/lifecycle.ts`): `deathChance(age, health)`
  ahora escala con la salud del anciano — sana (1) aguanta la mitad de
  riesgo que la rampa base por edad; desatendida (0) lo sube un 50%; sigue
  sin matar antes de OLD_AGE (la edad abre la puerta, la salud modula
  dentro). Test dedicado (`sim.test.ts`): sano < medio < enfermo, cero
  riesgo antes de vejez, nunca fuera de [0, 0.5]. 116/116 tests.
  Queda pendiente: **prestigio→inmigración** (una calle "de posibles" no
  atrae más gente todavía) y **clima→coche** (el mal tiempo penaliza igual
  a quien va en coche que a quien va a pie) — los dos acoplamientos que
  RESEARCH.md ya había anotado y que sobreviven a esta ronda.
- 2026-07-04 · **Clima→coche** (`sim/simulation.ts`): `weatherSpeedFactor
  (mode, outdoor)` — a pie el mal tiempo resta hasta un 40% de velocidad
  (charcos, viento); en coche, protegido, como mucho un 8%. Cuidado de
  rendimiento real durante la implementación: `speedAt` se llama por cada
  peatón en cada sub-tick del bucle de `stepWalk` (presupuesto en
  fracciones de tick, ver ciclo 8) — llamar a `this.weather` ahí dentro
  habría recreado `weatherAt()` (con su propio `createRng`) muchas veces
  por tick en vez de una. Se pasa `ctx.weather.outdoorFactor` ya calculado
  desde `stepCitizen` hacia abajo en vez de recalcularlo. Test dedicado:
  la penalización a pie es más del doble que en coche, y mejor tiempo
  nunca ralentiza. 118/118 tests.
  Queda **prestigio→inmigración** como último acoplamiento anotado.
- 2026-07-04 · **Prestigio→inmigración** (cierra la última carencia
  anotada): `familySize(rng, avgPrestige)` — un pueblo con prestigio medio
  alto atrae familias más completas al llenar una vivienda nueva (hasta
  ~1.25× de media a prestigio 1); en `avgPrestige=0` es EXACTAMENTE la
  curva original (1-3), así que el arranque de partida no cambia.
  **Lección de esta sesión, más valiosa que el acoplamiento en sí**: el
  test de 40 días "la ciudad construye consultorio" empezó a fallar al
  añadir esto, y bisequé con `git worktree` para entender por qué. Resultado
  sorprendente: la población YA se disparaba (19→664 en 60 días) con SOLO
  salud→mortalidad + clima→coche activos, ANTES de tocar inmigración —
  ninguno de esos dos cambia cuántas veces se llama a `rng.next()`, pero SÍ
  cambia QUÉ ciudadanos siguen vivos, y eso reordena silenciosamente todo el
  consumo de RNG compartido (`this.rng`) desde ese punto en adelante. Con
  población tan alta, la salud media nunca cae de 0.88 (los inmigrantes
  sanos la diluyen más rápido de lo que los enfermos la bajan) y la clínica
  deja de pedirse — no por un bug de la lógica de demanda, sino porque la
  trayectoria completa de 40-60 días para una semilla concreta es
  **inherentemente frágil** a CUALQUIER cambio de comportamiento, toque o no
  población. Corregido no ajustando el acoplamiento sino el test: la
  demanda de clínica ahora se prueba DIRECTO sobre `computeDemand()` (pura,
  sin sim completa) en vez de esperar a que una tirada larga la cruce; la
  sim completa de 40 días se queda para lo que sí es robusto (nadie
  empieza a trabajar enfermo, salud media razonable). **Regla para futuros
  ciclos**: cualquier test que dependa de un umbral cruzándose en una
  simulación larga con semilla fija es una bomba de relojería — si la
  propiedad es una función pura testeable sin levantar `Simulation`,
  pruébala así. De paso, apareció y se corrigió un bug real independiente
  de todo esto: la fiesta (ciclo 10) podía empezarse tarde y su duración
  sorteada la dejaba "asistiendo" pasada la medianoche, violando la
  invariante de fecha — `beginDoing` ahora recorta la duración de
  `festival` para que nunca cruce el día. 121/121 tests.
- 2026-07-04 · **Ciclo 11: Duelo (N3 pertenencia)** · Con la pirámide N0-N5
  cerrada y las carencias de acoplamiento resueltas, toca de nuevo la
  pregunta de OBSERVAR (§1): ¿qué haría un humano real que ningún ciudadano
  hacía? Cuando alguien moría, nadie lo sentía — ni la pareja ni los amigos
  de toda la vida notaban nada, la muerte solo desaparecía a un `Citizen`
  del mapa. Modelo: `citizen.grief` [0,1] sube de golpe al morir la pareja
  (pleno, 1.0) o un amigo CERCANO (afinidad ≥ `CLUB_AFFINITY`, el mismo
  umbral que el "tercer lugar" del ciclo 7 — no cualquier conocido, un
  vínculo de verdad; 0.45, más suave que la pareja); nada lo restaura antes
  de hora, solo decae solo con el tiempo (~14 días de juego para apagarse
  del todo, el orden de un luto real). Mientras dura: cuesta más disfrutar
  (`fun` decae más rápido) y concentrarse en el trabajo (`work` pierde hasta
  un 30% de idoneidad, nunca se bloquea del todo — no es una baja médica),
  y apetece MÁS buscar compañía (`visit` gana hasta el doble de idoneidad a
  duelo pleno) — mismo motor de utility AI de siempre, ningún guion nuevo.
  Visible en el inspector (barra "duelo", solo aparece si hay duelo real).
  Emergió: quien pierde a su pareja o a un amigo cercano visita más y
  trabaja algo menos una temporada, sin que nadie se lo diga.
  Bug real encontrado verificando esto (no de la lógica de duelo en sí,
  sino expuesto por el cambio de trayectoria que introduce — la misma
  lección de sensibilidad del RNG compartido de sesiones anteriores): el
  arreglo de fiestas-fuera-de-fecha de la entrada anterior solo cubría "la
  duración se ALARGA pasada medianoche"; faltaba el caso simétrico "se
  decide ir tarde, tarda en llegar (cola de paths, trayecto largo) y
  EMPIEZA ya en el día siguiente". Arreglado con el mismo patrón que la
  revalidación de salud al llegar (`beginDoing`): si el día ya no es de
  fiesta al llegar, vuelve a decidir en vez de empezar. 137/137 tests.
  Carencias observadas para futuros ciclos: (a) sin reflejo visual del
  duelo en el mundo (ropa oscura, cabeza gacha) — tarea de Sonnet si se
  quiere ver además de leerlo en el inspector; (b) el duelo no acopla aún
  con `growth`/inmigración (un pueblo que ha sufrido muertes recientes no
  se ve distinto a uno que no); (c) sin luto colectivo — una fiesta caída
  justo tras una muerte reciente no se atenúa, aunque en la vida real un
  pueblo de luto no celebraría igual.
- 2026-07-04 · **Duelo→inmigración** (cierra la carencia (b) de arriba, la
  misma sesión): `familySize(rng, avgPrestige, avgGrief)` — un pueblo de
  luto atrae familias más cautas (más pequeñas), en sentido EXACTAMENTE
  contrario al prestigio (mismo peso, 0.6, con signo cambiado) sobre el
  mismo rango — simetría deliberada: la misma función que hace más goloso
  un barrio próspero hace más disuasorio uno que ha sufrido muertes
  recientes. El rango nunca baja de 0.6 (mínimo garantizado: 1 adulto
  siempre, ni el peor duelo colectivo deja una vivienda vacía). En
  `avgPrestige=avgGrief=0` sigue siendo exactamente la curva original.
  139/139 tests. Queda (a) de la entrada anterior.
- 2026-07-04 · **Duelo→fiestas** (cierra la carencia (c)): la idoneidad de
  `festival` pierde hasta la mitad a duelo pleno — no la anula (la vida
  sigue, y urgencia/personalidad ya deciden el resto), pero a quien está de
  luto la fiesta del pueblo le apetece bastante menos. Mismo patrón que
  work/visit (ciclo 11 original): un factor continuo sobre `c.grief`, cero
  horario ni excepción especial. 139/139 tests.
  Queda (a): sin reflejo visual del duelo en el mundo todavía.
- 2026-07-04 · **Reflejo visual del duelo** (cierra la carencia (a), cierra
  el ciclo 11 del todo): `grief` pasa a ser la 8ª columna del snapshot
  (`AGENT_STRIDE` 7→8, contrato §1.3 — protocol.ts/simulation.ts/client.ts
  actualizados en el mismo commit, como manda la regla). `render/
  citizens.ts` apaga la ropa hasta la mitad de saturación a duelo pleno.
  De paso, arreglo de un defecto pequeño pero real que llevaba desde T3.6:
  el color de la ropa se asignaba UNA VEZ en el constructor indexado por
  SLOT de instancia, no por ciudadano — con la compactación de instancias
  (gente entrando/saliendo de casa) el color de una MISMA persona podía
  cambiar de un frame a otro. Ahora se pinta cada frame indexado por `id`
  (estable) y además permite el apagado por duelo. 140/140 tests
  (`AGENT_STRIDE` ya no está hardcodeado a 7 en los tests, se importa).
  Verificado: `tsc` limpio, sin errores de consola tras recargar con el
  contrato nuevo, escena general intacta (edificios/HUD/draw calls en
  presupuesto). NO se esperó en vivo a que un ciudadano concreto entrara en
  duelo (necesita una muerte con pareja o amigo cercano, evento poco
  frecuente) — la ruta de color ya estaba verificada por el resto de la
  sesión (mismo `setColorAt`+`multiplyScalar` que ya usan coche/jardín) y
  los tests cubren los límites [0,1] de la columna; queda como
  confirmación en vivo pendiente para quien tenga una sesión más larga.
  **Con esto, el ciclo 11 (duelo) está completo: lógica, tres
  acoplamientos (needs/brain, inmigración, fiestas) y reflejo visual.**
- 2026-07-04 · **Ciclo 12: Jubilación (N2 seguridad/trabajo)** · OBSERVAR:
  un anciano de 90 años seguía "parado" activo, compitiendo por vacantes
  igual que uno de 20 — ningún ciudadano dejaba nunca de trabajar salvo por
  muerte. Modelo: `RETIREMENT_AGE=65` (lifecycle.ts); en `lifeYear()`,
  `age >= RETIREMENT_AGE && work !== null` libera el puesto UNA vez (el
  propio `work !== null` es el candado — sin fundador puede jubilarse dos
  veces). `>=`, no `===`: los fundadores nacen con edad sorteada 18-72
  (`Simulation.spawnCitizen`), así que algunos YA arrancan por encima del
  umbral y jamás lo "cruzarían" con una igualdad exacta. `economy.assignJobs`
  excluye a los jubilados del pool de parados (nunca vuelven al mercado). La
  red de pensiones (`payPensions`, ciclo de gobierno) ya cubría "hogar sin
  ingreso propio" desde antes — la jubilación encaja en un acoplamiento que
  ya existía, sin tocarlo.
  Dos bugs reales encontrados verificando esto (ninguno en la lógica de
  jubilación en sí, ambos expuestos por ella — sensibilidad de acoplamiento,
  no de trayectoria de RNG esta vez):
  (1) `economy.stats()` contaba a los jubilados dentro de `adults`, el
  denominador con el que `computeDemand` calcula el paro real de la ciudad.
  Un jubilado nunca vuelve a buscar empleo, así que contarlo ahí inflaba el
  paro artificialmente y disparaba demanda de `'work'` de sobra — el test
  "T4.2: crecimiento contenido" saltó de ~16-20 a 42 edificios en 4 días.
  Arreglado acotando `adults` al mismo rango que `assignJobs`
  (`ADULT_AGE <= edad < RETIREMENT_AGE`): el mercado laboral y su medida de
  paro ahora cuentan exactamente a la misma población.
  (2) La necesidad `purpose` de un jubilado no tiene ninguna actividad que la
  restaure (solo 'work' lo hace y `assignJobs` lo excluye), así que hubo que
  darle una fuente propia. El PRIMER intento fue un restore PLANO (una
  constante/hora, como el resto de needs.ts) compitiendo contra un decay
  también plano (`decayRate('purpose', personalidad)` = `(1/12)·(0.5+trabajador)`
  ∈ [0.042, 0.125]/h). Error de diseño: dos ritmos planos no tienen equilibrio
  intermedio — quien decae más despacio que la constante satura a 1, quien
  decae más rápido cae a 0 y se queda ahí de por vida. La población de
  jubilados se partía en dos CASTAS permanentes (~70% en 1, ~30% en 0). El
  test agregado (media > 0.1) no lo veía: solo mira el promedio, no al
  individuo. Lo detectó una revisión adversarial multi-agente (17 agentes,
  5 dimensiones × verificación por 2 lentes) montada con Workflow esta misma
  sesión, con Monte Carlo del reparto por personalidad.
  Arreglo correcto (no un simple retoque de la constante): restore PROPORCIONAL
  AL DÉFICIT, `k·(1 - purpose)`/hora con `k = 1/5`. Eso convierte el sistema en
  uno con ATRACTOR por persona: en equilibrio `d = k·(1-v*)` ⟹ `v* = 1 - d/k`,
  que para todo el rango de personalidad cae en un continuo suave
  `v* ∈ [0.375, 0.79]` — nunca 0 ni 1, siempre por debajo de lo que da un
  empleo real. `k` debe superar el decay máximo (0.125) para que hasta el más
  'trabajador' tenga punto fijo positivo. Los mismos verificadores confirmaron
  la corrección en el working tree en vivo (matemática + tsc + tests). Test
  reforzado: además de la media, ahora se comprueba que NINGÚN jubilado ya
  asentado (jubilado hace ≥2 años; converge en <1 día) queda bajo 0.2 —
  propiedad estructural, inmune a la trayectoria del RNG. 147/147 tests.
  Lección: un restore PROPORCIONAL al déficit es el patrón correcto cuando una
  necesidad tiene UNA sola fuente y ninguna actividad que la resuelva bajo
  demanda — el patrón plano de needs.ts asume que la urgencia alta siempre
  encuentra salida (actividad disponible), lo que no se cumple para un jubilado.
