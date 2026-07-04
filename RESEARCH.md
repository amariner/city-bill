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
- 2026-07-04 · **Ciclo 11: salud→mortalidad (PROFUNDIDAD, no lógica nueva)** ·
  Primer ciclo del algoritmo tras cerrar la pirámide: cierra el acoplamiento
  que la bitácora del ciclo 5 dejó anotado a propósito ("salud no acopla aún
  con MORTALIDAD"). Modelo (epidemiología real en una frase): el riesgo de
  morir tiene una LÍNEA BASE por edad, la FRAGILIDAD (mala salud) la MULTIPLICA
  y una ENFERMEDAD crítica mata por sí sola incluso al joven. Traducción al
  motor: `deathChance(age, health)` = base_edad × (1 + 2·(1−salud)) + riesgo_
  enfermedad(salud<0.2), tope 0.6. Con salud plena equivale EXACTAMENTE a la
  curva de edad de siempre → el acoplamiento solo "muerde" a quien está frágil,
  sin desestabilizar los tests de vida ya verdes. Emergió (verificado con
  cohortes sintéticas idénticas salvo la salud, mismo RNG: las frágiles pierden
  ~4× más miembros en un año) y a escala de ciudad: de 45 muertes en 60 días,
  24 fueron de personas frágiles (salud<0.5) pese a ser minoría. Efecto de
  segundo orden NO buscado pero fascinante: al MORIR los frágiles, la salud
  media de los VIVOS ya no baja, así que el disparador REACTIVO de la clínica
  (ciclo 5, avgHealth<0.88) dejó de saltar → hubo que hacerlo también PROACTIVO
  por tamaño de población (infraestructura pública, growth.ts): la clínica pasa
  a existir para PREVENIR esas muertes, cerrando el bucle salud↔vida↔growth.
  Reflejo en la Crónica: el evento de muerte lleva la salud y se narra "muere X
  (n años) por enfermedad" cuando un no-anciano cae frágil. Registrado como
  acoplamiento en el manifiesto (`life.couples` += `health`). 118/118 tests.
  Carencias observadas para próximos ciclos: (a) sin una clínica CERCANA, un
  frágil del extremo del pueblo no llega a curarse a tiempo — acopla con
  vehículos/distancia (¿ambulancia? ¿varias clínicas por distrito?); (b) la
  mortalidad no distingue aún CAUSA médica (accidente vs enfermedad crónica vs
  vejez) — hoy todo es "fragilidad"; (c) el acoplamiento inverso —que la
  clínica REDUZCA de verdad la mortalidad medible— existe por construcción
  (curar sube salud → baja deathChance) pero no está MEDIDO en un test de
  "ciudad con clínica vive más que sin ella": candidato natural a ciclo 12
  junto con los otros dos acoplamientos pendientes (prestigio→inmigración,
  clima→coche).
- 2026-07-04 · **Ciclo 12: prestigio→inmigración (PROFUNDIDAD, avanza T4.3)** ·
  Cierra el acoplamiento que anotó el ciclo 9 ("el prestigio no influye aún en
  growth") y hace avanzar T4.3 ("familias llegan si hay felicidad"). Modelo
  (migración real en una frase): la gente se muda a donde hay prosperidad y
  buena reputación, no a un pueblo con paro, hambre y enfermedad — la población
  es una CONSECUENCIA de la calidad de vida, no un caudal fijo. Traducción al
  motor: `townAttractiveness({employment, avgHealth, avgFood, avgPrestige})` →
  [0.5,1]; al abrir una vivienda nueva, las familias que la ocupan escalan con
  la atractividad (`round(capacidad × atractividad)`) en vez de llenarse por
  decreto. Base alta (0.45) a propósito: el prestigio se GANA con el tiempo
  (empieza en 0), así que un pueblo joven sano y con empleo aún llena casi de
  lleno (0.90) — el arranque NO se asfixia, la lección del ciclo 5 (no romper
  el crecimiento contenido) respetada. Emergió, y se VE en la ocupación de
  viviendas, que antes era 100% por construcción y ahora VARÍA con la salud del
  pueblo: en 60 días, seed 42 (próspero) llena al 81%, seed 7 (en apuros) se
  queda al 44% — sus bloques nacen medio vacíos porque atraen menos gente. El
  efecto es mayor en los paneláks (cap 18-24): un bloque en un pueblo con paro
  puede nacer con 5-6 familias menos. Registrado el acoplamiento en el
  manifiesto (`growth.couples` += `status`, `status.couples` += `growth`).
  123/123 tests, sin colapso demográfico (seed 42 sigue creciendo a 201 hab.).
  Carencias observadas para próximos ciclos: (a) las plazas VACÍAS de una casa
  infra-ocupada no se rellenan si el pueblo mejora después — la inmigración solo
  ocurre al COLOCAR, no hay "re-ocupación de vacantes" cuando sube la
  atractividad; candidato a un ciclo de migración interna/re-ocupación; (b)
  falta la mitad emigrante de T4.3 ("se van si no"): hoy un pueblo en apuros
  atrae menos, pero NADIE se marcha andando por la carretera (la salida digna
  que pide RESEARCH.md §6.2) — un buen ciclo 13 sería la EMIGRACIÓN por
  infelicidad sostenida; (c) la atractividad es global a la ciudad, no por
  BARRIO — con distritos, una calle de prestigio podría atraer mientras otra se
  vacía (segregación emergente, delicado pero muy humano).
- 2026-07-04 · **Ciclo 13: clima→coche (PROFUNDIDAD)** · Salda una deuda
  anotada DOS veces (ciclos 6 y 8: "el clima debería penalizar menos a quien va
  en coche"). Modelo (vida real en una frase): el mal tiempo disuade de salir
  porque te MOJAS/PASAS FRÍO andando; si haces el recado en coche vas
  resguardado, así que el tiempo pesa mucho menos — pero un PASEO se moja igual,
  porque su sentido ES estar fuera. Traducción al motor: `shelteredWeather(ctx,
  c)` eleva el `outdoorFactor` percibido hacia 1 (recupera el 60% del castigo)
  SOLO si el hogar puede motorizar sus recados (ahorro ≥ ~2 trayectos de
  combustible), y SOLO se aplica a las actividades de TRAYECTO utilitario
  (comprar, visitar, club); el paseo sigue con el factor crudo. Sin ningún `if
  invierno`: mismo factor continuo de siempre, solo suavizado por acceso al
  coche. Emergió (verificado): con mal tiempo, un hogar con coche puntúa más
  alto ir de compras que uno sin coche; con buen tiempo son idénticos (no hay
  castigo que esquivar); el paseo no cambia con el coche. Cierra el triángulo
  clima↔dinero↔vehículos (el coche, que ya costaba dinero, ahora también
  COMPRA comodidad frente al tiempo). Registrado en el manifiesto
  (`weather.couples` += `vehicles`, y viceversa). 126/126 tests.
  Carencias observadas: (a) el resguardo es binario (tienes coche o no); en la
  realidad depende de CUÁNTO del trayecto es a pie (aparcar lejos, el último
  tramo) — se podría afinar con la longitud real del path como en ciclo 8, pero
  hoy brain.ts puntúa ANTES de conocer la ruta; (b) el clima aún no tiene
  reflejo VISUAL (nieve/lluvia/paleta estacional, T5.1 — sigue siendo la deuda
  visual más antigua, para Sonnet); (c) con los tres acoplamientos "fáciles"
  cerrados (salud→mortalidad, prestigio→inmigración, clima→coche), el siguiente
  salto de PROFUNDIDAD más valioso es la EMIGRACIÓN digna por infelicidad
  sostenida (§6.2: quien sobra se VA andando, no se despawnea) — cierra T4.3 por
  completo y es el candidato fuerte a ciclo 14.
- 2026-07-04 · **Ciclo 14: emigración digna (cierra T4.3, honra §6.2)** · La
  otra mitad de la migración, y la pieza que faltaba para que la población sea
  consecuencia por AMBOS lados (llega si el pueblo atrae — ciclo 12; se va si no
  puede sostener a su gente). Modelo (migración real): quien no puede ganarse la
  vida donde está, tras AGUANTAR unos años, se marcha a otra ciudad — y lo hace
  ANTES de morirse de hambre, no después; emigrar es huir de la miseria, no su
  desenlace. Traducción al motor: cada cierre de año, un hogar con adultos en
  edad de trabajar, NINGUNO empleado y sin colchón de ahorro (`householdHardship`,
  puro) acumula 1 de presión; un año bueno la alivia 2 (histéresis: la esperanza
  vuelve antes que se pierde). Al llegar a 3 años de penuria SOSTENIDA, la
  familia entera se marca `leaving`: caminan a la SALIDA del pueblo (la celda de
  carretera más lejana del centro, `WorldIndex.townExit`) usando el mismo
  pathfinding de siempre, y al llegar se despawnean con un evento narrado
  ("X se marcha a otra ciudad") — NUNCA en silencio (§6.2). Guardrails: un
  caserío (≤12 hab.) no se despuebla solo; una familia por día como mucho; corre
  DESPUÉS de las pensiones (ciclo 3), que son la última bala — solo emigra quien
  la red no alcanza a salvar. DESCUBRIMIENTO clave durante la verificación: la
  emigración casi nunca se dispara SOLA porque la ciudad autónoma es RESILIENTE
  — el crecimiento (growth) construye empleos para el excedente y las pensiones
  cubren el bache; solo cuando AMBAS redes se agotan (sin suelo/growth Y sin
  tesoro) la penuria se sostiene lo bastante. Es la lectura correcta: emigrar es
  la EXCEPCIÓN, no la rotación — la válvula está cerrada en un pueblo sano
  (test: 0 emigrados en 30 días de seed 42) y se abre solo en el colapso (test
  integrado: un hogar condenado a paro+pobreza con el tesoro a 0 vacía sus
  miembros por emigración narrada hacia el año 3). Sin RNG (determinista); sin
  tocar el contrato de protocol.ts (los que se van caminan como cualquiera y se
  desvanecen en el borde, como al entrar en un edificio). Crónica con contador
  `emigrados` propio. Registrado en el manifiesto (`growth` ahora "demanda→
  construcción + emigración", `growth.couples` += `money`). 136/136 tests.
  Carencias observadas para próximos ciclos: (a) los que se marchan se
  DESVANECEN en el borde en vez de recorrer la carretera hasta salir de cámara
  — el walk existe pero el despawn es al llegar al nodo más lejano, no "fuera
  del mapa"; pulido visual menor; (b) emigra la familia entera de golpe; en la
  realidad a veces se va UN miembro a probar suerte y manda dinero a casa
  (remesas) — dimensión más fina, candidata futura; (c) no hay memoria de los
  que se fueron (¿vuelven si el pueblo prospera? ¿la Crónica recuerda el éxodo
  de un mal año como un hito?) — la Crónica podría contar "el año 14, tres
  familias se marcharon" como una cicatriz de la ciudad; (d) con inmigración
  (12) y emigración (14) cerradas, T4.3 está COMPLETA — el siguiente valor está
  en la re-ocupación de vacantes (que un pueblo que mejora vuelva a llenar las
  casas medio vacías) y en el reflejo VISUAL acumulado (la deuda de Sonnet:
  nieve/estaciones, meshes de clínica/escuela/coche/plaza/jardín de prestigio).
