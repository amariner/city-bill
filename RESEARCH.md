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
- 2026-07-04 · **Ciclo 15: la clínica alarga la vida (MEDIDO) + LECCIÓN de la
  re-ocupación revertida** · Dos cosas, una enviada y una aprendida.
  (1) ENVIADO — cierra la carencia (c) del ciclo 11: el acoplamiento inverso
  salud→vida (curarse REBAJA la mortalidad) existía por construcción pero nunca
  se había MEDIDO. Ahora sí: una jornada de clínica (8 h × CLINIC_RECOVERY) saca
  a un frágil (salud 0.3) fuera de peligro (→1.0), lo que recorta su deathChance
  a los 80 de 0.60 a 0.32; y en cohortes idénticas de 400 frágiles con el MISMO
  RNG, la curada sobrevive MÁS DEL DOBLE que la sin atender. Añadido un flag
  `clinicHealing` (gate sobre una sola línea) que apaga la sanidad — escenario
  "sin sistema de salud", útil para el juego y para el estudio; medí con él la
  A/B en sim completa (con sanidad 10 muertes frágiles vs 14 sin), pero la
  trayectoria diverge demasiado entre runs para un test robusto, así que el test
  MIDE con cohortes controladas (limpio y determinista) y el flag queda como
  herramienta. 139/139 tests.
  (2) LECCIÓN (revertido, como el episodio del ciclo 5) — intenté la
  RE-OCUPACIÓN de vacantes (un pueblo próspero vuelve a llenar las casas que se
  vaciaron): añadí `townAttractiveness` reutilizado + un paso diario que rellena
  1 familia/día en la vivienda con hueco de más prestigio. EXPLOTÓ la población
  (912 hab. en 46 días vs ~80 normales, suite de tests de segundos a >100 s, y
  el test de fiestas roto por solapamiento). Diagnóstico fino: aun ACOTANDO la
  re-ocupación a "vacantes reales por pérdida" (por debajo del máximo histórico
  de ocupación, para no tocar la infra-ocupación del ciclo 12 que estrangula el
  crecimiento), SOLO 3 disparos en 30 días bastaban para pasar de 38 a 228 hab.:
  el sistema de crecimiento es CAÓTICAMENTE SENSIBLE — inyectar 3 familias
  temprano adelanta los desbloqueos de tier y diverge exponencialmente. Revertí
  entero: la re-ocupación, por "correcta" que sea, desestabiliza el crecimiento,
  y su valor es marginal (los NACIMIENTOS ya repueblan las casas). **Lección
  reforzada del ciclo 5: cualquier fuente NUEVA de población, por pequeña que
  parezca, puede volcar el crecimiento — medir población a 46 días ANTES de dar
  por bueno un cambio que toque vivienda/inmigración.** Si algún día se retoma,
  hará falta primero domar la sensibilidad del crecimiento (amortiguar los
  desbloqueos de tier, o hacer el ritmo de growth proporcional-inverso a la
  población) — es un prerrequisito, no un detalle.
  Carencias observadas: (a) la sensibilidad caótica del crecimiento es hoy el
  mayor freno para cualquier lógica que toque población — domarla (growth
  amortiguado) desbloquearía re-ocupación, remesas y migración de retorno de
  golpe; candidato fuerte a un ciclo de "estabilidad del crecimiento"; (b) la
  A/B de sanidad en sim completa pide un modo de EXPERIMENTO reproducible
  (fijar población, variar una sola palanca) que hoy no existe — infra de
  medición, no lógica; (c) sigue intacta la deuda VISUAL acumulada (Sonnet).
- 2026-07-04 · **Ciclo 16: DUELO (nueva lógica N3 — la sombra del vínculo)** ·
  Tras varios ciclos tocando la economía/población (y aprendiendo lo sensible
  que es), un ciclo HONDO y SEGURO que no la roza: cierra el acoplamiento
  vida→necesidades que faltaba. Hasta ahora, cuando moría una pareja el
  superviviente quedaba con `partnerId=null` y seguía como si nada — lo MENOS
  humano posible. Modelo (duelo real en una frase): perder un vínculo íntimo
  deja un peso en el ánimo que apaga la alegría un tiempo y se va pasando; no es
  una herida física, es que "nada te levanta el ánimo" unos días. Traducción al
  motor: `grief` [0,1] (nuevo campo puro del ciudadano) SALTA al perder a la
  pareja (0.85) o a un amigo íntimo (0.35, afinidad ≥ 0.55), por MUERTE (ciclo
  3) o EMIGRACIÓN (ciclo 14) — el pueblo pena por quien se va, no solo por quien
  muere; `griefTick` lo hace decaer en ~10 días y, mientras dura, DRENA la
  diversión (a pleno duelo la alegría se escurre a 1/14 por hora: por eso a un
  doliente no le levanta nada) y algo la vida social. Deliberadamente NO toca la
  salud ni la mortalidad: el duelo pesa en el ánimo, no mata — así no perturba
  la dinámica demográfica (ya de por sí caóticamente sensible, lección de los
  ciclos 5/15). Emergió, y se VE: en 40 días de seed 42, los dolientes tienen
  una diversión media de 0.62 frente a 0.79 del resto de la ciudad — una brecha
  clara y observable, con decenas de dolientes activos a la vez según van
  pasando muertes y marchas. Reflejo en el INSPECTOR (la ventana de la
  autonomía, T3.10): una barra "duelo" que solo aparece cuando pesa — un
  doliente es reconocible de un vistazo. Nueva entrada en el manifiesto (`grief`,
  N3, acopla life+social+needs; `life.couples` += `grief`). Contrato del
  inspector ampliado (protocol.ts CitizenInfoMsg += grief), replicado en el
  mismo commit. 146/146 tests.
  Carencias observadas para próximos ciclos: (a) el duelo hoy solo APAGA; en la
  realidad también une (los dolientes se arriman, se consuelan) — un
  acoplamiento duelo→social donde dos que penan se buscan sería precioso y muy
  humano; (b) no hay duelo por los HIJOS ni por los padres (solo pareja y
  amigos íntimos) — la familia extensa no se modela como vínculo aparte todavía;
  (c) la Crónica podría narrar la viudez de un fundador como un hito emocional
  ("año 22: muere Vera, Tomás queda solo") — memoria afectiva, no solo
  contadores; (d) el duelo es puro ánimo: si algún día se quisiera el "morir de
  pena" (duelo→salud) habría que medir con MUCHO cuidado su efecto demográfico.
- 2026-07-04 · **Ciclo 17: CONSUELO (grief→social) — cierra el bucle del duelo** ·
  Cierra la carencia (a) del ciclo 16 ("el duelo hoy solo APAGA; también une").
  Modelo (real en una frase): el duelo se lleva mucho mejor acompañado — la
  compañía consuela y acorta la pena. Traducción al motor: la mitad "buscar
  gente" YA existía por composición limpia sobre el ciclo 16 (el duelo drena
  `social` → sube la urgencia → el doliente puntúa más alto visitar/charlar/club,
  sin ninguna regla nueva); faltaba la mitad "la gente consuela": `consoleGrief`
  alivia el duelo ~4× más rápido que el paso del tiempo a solas, y se llama
  cuando el ciudadano está EN COMPAÑÍA de verdad (charlando, o en una actividad
  de mucha restauración social: visita/club/fiesta). Bucle cerrado: pena →
  buscar compañía → consuelo → recuperación. Emergió (verificado): acompañado un
  par de horas al día se supera el duelo en ~7 días frente a ~9 a solas, y sigue
  durando días (no se ignora). Sin RNG, sin tocar población. Durante la
  verificación destapé (y ARREGLÉ) una fragilidad LATENTE del test del ciclo 10:
  medía "fiestas fuera de fecha" contando ticks de 'doing', que se disparaba con
  el solapamiento benigno de una fiesta del día 15 que se alarga pasada la
  medianoche (159 ticks, pero 0 INICIOS fuera de fecha — la puerta de decisión
  intacta). Reescrito para medir el invariante REAL (nadie EMPIEZA una fiesta
  off-date), ahora robusto ante el solapamiento para todos los ciclos futuros.
  149/149 tests.
  Carencias observadas: (a) el consuelo hoy no distingue de QUIÉN viene — que
  consolara MÁS un amigo íntimo (o alguien que también pena) que un desconocido
  cerraría un matiz precioso (duelo compartido); (b) siguen las carencias (b)(c)
  del ciclo 16 (duelo por hijos/padres; memoria afectiva en la Crónica); (c) con
  el duelo y su consuelo, la esfera social (N3) está muy rica — el siguiente
  valor emocional podría subir a N4/N5 (una PÉRDIDA que cambia la vocación, o un
  legado) o, por fin, bajar a domar la sensibilidad del crecimiento para
  reabrir las lógicas de población.
- 2026-07-04 · **Ciclo 18: memoria afectiva de la Crónica (§6.1, la CONDICIÓN DE
  VICTORIA)** · Cierra la carencia (c) de los ciclos 16/17 y apunta al corazón
  del proyecto: "ganamos cuando la Crónica cuenta historias que no escribimos
  nosotros". Hasta ahora la Crónica narraba plano ("muere alguien (76 años)");
  ahora las despedidas llevan CONTEXTO AFECTIVO, y sobre todo la VIUDEZ: quién
  queda sin su pareja — el reverso narrativo del duelo (ciclos 16/17). Modelo:
  el narrador se extrae a una función PURA `chronicleText(name, data)` (antes
  era lógica enredada dentro del onEvent DOM), lo que además la hace TESTEABLE
  headless; el evento de muerte pasa a llevar `partnerName`, y la frase compone
  causa (enfermedad<0.2 y joven / vejez), "una vida larga" (≥85) y
  "— X pierde a su pareja". Emergió, y son historias de verdad: en 45 años de
  seed 42 salen 9 viudeces narradas, p.ej. *"muere Irene Bosch (76 años) — Vera
  Bosch pierde a su pareja"* — nadie escribió esa frase, la produjo el cruce de
  vida+parejas+mortalidad, y Vera además entra en duelo (ciclo 16) que se ve en
  su inspector. Refactor limpio (contadores en onEvent, narración en la función
  pura); build OK, 156/156 tests.
  Carencias observadas: (a) la Crónica narra las despedidas pero aún no los
  REENCUENTROS ni los hitos de una vida (primer empleo, boda con nombre, la
  llegada de un nieto) — un "diario de vida" por ciudadano notable haría la
  memoria aún más rica; (b) los eventos viejos siguen capados a 60 sin
  RESUMIRSE por año (RESEARCH §5 lo pedía: "año 12: 3 nacimientos, llegó la
  escuela") — compactación afectiva pendiente; (c) sigue en pie la disyuntiva
  del ciclo 17: subir a N4/N5 (legado/vocación) o domar el crecimiento.
- 2026-07-04 · **Ciclo 19: duelo compartido (consuelo por intimidad)** · Cierra
  la carencia (a) del ciclo 17 ("el consuelo no distingue de QUIÉN viene").
  Modelo: no todos consuelan igual — un ÍNTIMO alivia más que un conocido de
  vista, y quien TAMBIÉN pena, aún más (nadie entiende una pérdida como otro
  doliente). Traducción: el consuelo de la charla se mueve de un flat en
  simulation.ts a `consoleGriefBy(c, other)` en `social.advance()` (que ya
  conocía a ambos interlocutores), escalado por intimidad (0.4 conocido … 1.0
  íntimo, vía afinidad) y un bonus ×1.5 si el otro también está de duelo. El
  consuelo de las actividades de grupo (visita/club/fiesta) sigue siendo flat
  (no hay un interlocutor único). Verificado: un íntimo consuela más que un
  desconocido; un codoliente más que un amigo sereno. 159/159 tests.
  Carencias observadas: (a) el duelo compartido podría CREAR vínculo (dos que se
  consuelan estrechan afinidad más rápido — el luto une); (b) siguen las
  disyuntivas del ciclo 18 (memoria de vida / año resumido) y del 17 (N4/N5 vs
  domar crecimiento).
- 2026-07-04 · **Ciclo 20: el luto une (duelo→vínculo)** · Cierra la carencia (a)
  del ciclo 19 y REMATA el clúster del duelo (16-20). Modelo: la pérdida
  compartida forja amistad — dos que se consuelan salen más unidos. Traducción:
  `chatBond(a,b)` (pura) devuelve la afinidad de una charla: la normal
  (AFFINITY_PER_CHAT=0.08), o el doble (GRIEF_BOND_AFFINITY=0.16) si AMBOS penan.
  Verificado. 161/161 tests. **Balance del clúster del duelo (16→20):** una
  pérdida ahora deja duelo (16), que empuja a buscar compañía y se consuela
  (17), más de un íntimo o codoliente (19), y ese consuelo compartido TEJE
  vínculo nuevo (20) — un ciclo emocional humano completo, y la Crónica lo narra
  (18). El árbol social (N3) es hoy de lo más rico del motor.
  Carencias observadas: con el duelo agotado como veta, el mayor valor pendiente
  ya NO está en N3 — está en (a) domar la sensibilidad del crecimiento (reabre
  re-ocupación/remesas/retorno, y robustece el test estrella T4.4 del ROADMAP),
  o (b) una veta emocional nueva en OTRA esfera (p.ej. el TRABAJO: orgullo de
  oficio, jubilación como pérdida de propósito) para no sobre-ajustar el duelo.
- 2026-07-04 · **Ciclo 21: memoria por niveles (Crónica, RESEARCH §5)** · Cambio
  de esfera tras agotar el duelo: cierra la carencia (b) del ciclo 18 y la deuda
  explícita de §5 ("años viejos RESUMIDOS, no borrados"). Antes la Crónica
  capaba a 60 eventos y BORRABA los viejos (perdía la historia); ahora, al pasar
  de año, los años más allá de los 4 recientes se COMPACTAN en una línea-resumen
  ("año 12: 3 nacimientos, 1 muerte, la ciudad construye: school") — como la
  memoria humana: lo reciente en detalle, lo viejo en titulares, PRESERVANDO los
  hitos verbatim. `summarizeYear` y `compactChronicle` son puras e idempotentes
  (un año ya resumido no se re-resume), testeadas headless. Cada evento se
  etiqueta con su tipo (birth/death/emigrated/couple/milestone) para contar sin
  parsear prosa. Nota de descarte: probé la veta "jubilación→propósito" pero la
  medición mostró 0 jubilados a día 40 (la mortalidad del ciclo 11 mantiene
  joven la población) — no es un gap observable, bien descartarlo por medición.
  168/168 tests, build OK.
  Carencias observadas: (a) la compactación reciente-vs-vieja podría tener un
  tercer nivel (décadas MUY viejas → "años 1-10: la fundación", un solo titular)
  para partidas de siglos; (b) el diario de VIDA por ciudadano (primer empleo,
  boda, nietos) sigue pendiente — la memoria hoy es de la CIUDAD, no de las
  personas; (c) sin cambios en la disyuntiva de fondo: domar el crecimiento
  (reabre lógicas de población + robustece T4.4) sigue siendo el mayor salto.
- 2026-07-04 · **Ciclo 22: festivales estacionales (festival↔clima)** · Veta
  cultural, fresca tras el clúster del duelo. `seasonalFestivalName(day)` (pura)
  da identidad a la fiesta según su estación (fiesta de invierno / primavera /
  verbena de verano / fiesta de la cosecha), acoplando dos lógicas ya vivas
  (festival del ciclo 10 + estaciones del 6). El evento `festivalDay` lleva el
  nombre y la Crónica lo narra ("año 8: fiesta de la cosecha" en vez del genérico
  "fiesta mayor"). Cero coste, pura identidad. 177/177 tests.
  Carencia observada: la fiesta estacional podría además ACOPLAR con la lógica
  (la cosecha de otoño rinde más si el granero está lleno; San Juan atrae más en
  buen tiempo — el clima ya lo module) — hoy es solo nombre, un gancho para más.
- 2026-07-04 · **Ciclo 23: el inspector muestra a una PERSONA (§6.2 dignidad)** ·
  Primer paso de la "memoria de las personas" (carencia repetida de 18/21). El
  inspector (T3.10, la ventana para verificar la autonomía) dejaba ver stats
  pero no QUIÉN es cada cual. Ahora `describe()` añade edad, etapa de vida
  (niño/adulto/mayor) y el nombre de la PAREJA — "Vera Bosch · 34 años · adulta ·
  con Tomás". Datos ya presentes en la sim; contrato del inspector ampliado
  (protocol.ts CitizenInfoMsg += age/lifeStage/partnerName) replicado en el mismo
  commit. Testeado headless vía `describe()`. 181/181 tests, build OK.
  Carencia observada: falta la HISTORIA (hitos: nació el año 3, se casó el 21) —
  un diario de vida por persona pediría acumular sus eventos por id (sistema
  aparte); hoy el inspector es una foto del presente, no un relato.
- 2026-07-04 · **Ciclo 24: cosecha abundante (festival↔alimento↔estación)** ·
  Cierra la carencia del ciclo 22 (la fiesta estacional era solo nombre). La
  fiesta de la cosecha (otoño) se narra "abundante" si el granero rebosa
  (>40) el día que cae — un acoplamiento de tres lógicas ya vivas (festival 10 +
  estaciones 6 + alimento 1), sin guion: depende del estado real del granero.
  Testeado (día 60 = fiesta de otoño, granero forzado lleno → nombre abundante).
  182/182 tests.
  **Cierre de sesión (ciclos 11-24, Opus):** 14 ciclos de lógica (uno revertido
  con lección) que profundizan lo existente hasta un tejido social/cultural muy
  rico (mortalidad, migración en ambos sentidos, duelo completo con consuelo y
  vínculo, memoria de ciudad y de personas, cultura estacional) + 4 features de
  render verificadas por screenshot (coche T3.9, luz T1.8→Fase 1, estaciones
  T5.1 con nieve) + semilla persistida (T2.6 parcial). El mayor salto pendiente
  sigue siendo domar el crecimiento para abrir T4.4 (trazado autónomo de vías) —
  merece una sesión enfocada, no la cola de esta.
- 2026-07-04 · **T4.4 — MODO AUTÓNOMO, el test estrella, FUNCIONA end-to-end** ·
  Contra la previsión de "sesión aparte", se cerró el bucle completo. Camino:
  (1) `extendRoad` (núcleo puro, ya testeado); (2) escenario mínimo `seedFarm`
  (una granja + tramo corto) porque el cross del seed normal NUNCA se satura
  (±90 de frente) — sin escenario mínimo, T4.4 no se dispara jamás; (3)
  `maybeExtendRoad`: al fallar `findParcel` con demanda, ramifica/prolonga una
  calle hacia campo abierto. TRAMPAS resueltas por diagnóstico iterativo:
  · la calzada de 3 carriles engaña a la detección de eje por vecinos (±1 y ±2
    dan road en ambos ejes) → uso la TIRADA de carretera (`roadRun`) por eje.
  · ramificar perpendicular se acorrala con los frentes de edificios → estrategia
    doble: primero BRANCH (perpendicular, trama 2D), si no cabe EXTEND (prolongar
    el extremo recto, chequeo estrecho ±1 para punzar entre casas).
  · sin ritmo, extendía en CADA intento fallido → sprawl (225 vías vacías) →
    límite de una calle cada 2 días: los edificios llenan antes de abrir más.
  Emergió y se VE: de 3 edificios, en 40 días, un pueblo con calles autotrazadas
  (test estrella en sim.test: roadsExtended>0, +8 edificios, población>30, vida
  circulando); screenshot de `?scene=farm` confirma la réplica en render.
  Hallazgo reutilizable: el pathfinding lee el grid EN VIVO → vía nueva navegable
  al instante, sin reconstruir grafo. 186/186 tests. Contrato ampliado
  (protocol.ts SimEventMsg += `roadExtended`), replicado en el mismo commit.
  Carencia observada: el crecimiento sale RIBBON (lineal) más que trama densa —
  las ramificaciones perpendiculares mueren contra los frentes; para un pueblo
  tupido harían falta reservar corredores o construir con retranqueo mayor cerca
  de los extremos. Pero el corazón de T4.4 —"de una granja, un pueblo sin
  input"— ya late.
- 2026-07-04 · **Ciclo 25: CONTAGIO (epidemias en oleadas, modelo SIRS)** ·
  Observación: mi sociedad tenía enfermedad CRÓNICA (salud, ciclo 5) pero la
  enfermedad real es AGUDA y CONTAGIOSA y viene en OLEADAS — una carencia de
  realismo evidente. Modelo (epidemiología, SIRS): Susceptible → Infectado (se
  pega en los encuentros cara a cara de social.ts, o brota espontáneo en el frío
  del invierno) → Recuperado con INMUNIDAD temporal → la inmunidad decae en ~una
  estación → susceptible otra vez. `sim/contagion.ts` (puro): `sickenTick`
  (mella salud/energía leve, se cura en ~5 días, deja inmune), `maybeInfect`
  (contagio en charla si el otro es susceptible), `treatSick` (la clínica cura
  antes). Acopla con salud→mortalidad (ciclo 11): las oleadas se ceban en los
  frágiles/ancianos, como en la vida real, pero SUAVE y recuperable (nada de
  espiral de muerte). Ajuste clave por diagnóstico: sin inmunidad, R0 alto daba
  epidemia PERPETUA al 80% (endémica, no oleadas); con inmunidad SIRS emergen
  oleadas de verdad — sube, colectiviza inmunidad, baja, la inmunidad decae y
  vuelve otra ola mayor cuando la población creció y se hizo susceptible (medido:
  ola pequeña día 12, gran ola día 84 con 90 enfermos de 360, 35 muertes en 90
  días sin colapso, pob 441). Observable: evento `epidemic` narrado en la
  Crónica ("una epidemia recorre la ciudad, N enfermos") y barra "enfermo" en el
  inspector. Nueva entrada en el manifiesto (`contagion`, N2, acopla
  health+social). Contratos ampliados (SimEventMsg += `epidemic`, CitizenInfoMsg
  += `sick`), replicados en el mismo commit. 196/196 tests.
  Carencia observada: (a) la enfermedad no distingue TIPOS (resfriado leve vs
  peste grave) — un parámetro de letalidad por cepa daría eventos memorables;
  (b) no hay CUARENTENA ni conducta de evitación (la gente sigue socializando
  igual con enfermos) — un "quedarse en casa si enfermo" bajaría R0 y sería
  realista; (c) la vacuna/clínica podría PREVENIR (inmunizar) además de curar.
- 2026-07-04 · **Ciclo 26: CUARENTENA (contagio→comportamiento, "aplanar la
  curva")** · Cierra la carencia (b) del ciclo 25 y añade la RESPUESTA CONDUCTUAL
  a la enfermedad, clave en epidemias reales. Modelo: (1) un enfermo se recoge en
  casa — `sickStayIn(ctx,c)` baja la idoneidad de salir a socializar/pasear
  proporcional a la enfermedad (utility AI, sin guion); (2) el que se siente
  bastante mal (sick > SICK_ISOLATE=0.5) NO se para a charlar en `social.ts`
  (evita el contacto estrecho), mientras los casos LEVES/incubando (sick entre
  0.15 y 0.5) SÍ propagan — exactamente como en la vida real, donde el contagio
  lo mueven los asintomáticos/leves. La pieza (2) es la que de verdad corta la
  transmisión (las charlas son el vector). Flag `quarantine` (como clinicHealing)
  para medir y para el escenario "sin autoaislamiento". Emergió con fuerza,
  MEDIDO en A/B con la misma semilla: la curva se APLANA de un pico del 83% de la
  ciudad enferma a la vez (sin cuarentena) al 17% (con) — casi 5× más bajo, y muy
  menos gente enferma en total (48 vs 426). Bajado el umbral de narración de la
  epidemia (25%→12%) porque ahora las oleadas aplanadas ya no llegan al 25% pero
  siguen siendo epidemias que contar. Nuevo campo de contexto (`quarantine`) y
  `detectEncounters` recibe el flag. 200/200 tests.
  Carencia observada: (a) la cuarentena hoy es INDIVIDUAL y automática; una
  medida COLECTIVA (el gobierno cierra la plaza/escuela en plena epidemia, como
  el toque de queda) sería un acoplamiento gobierno↔contagio precioso; (b) sigue
  pendiente la vacuna/inmunización preventiva (carencia (c) del ciclo 25); (c) el
  aislamiento tan efectivo (17%) quizá sea demasiado — en la realidad la gente no
  cumple perfecto; un factor de "cumplimiento" por personalidad lo haría más gris
  y humano.
- 2026-07-04 · **Ciclo 27: salud pública (gobierno↔contagio)** · Cierra la
  carencia (a) del ciclo 26: la respuesta COLECTIVA a la epidemia, no solo la
  individual. Cuando la ciudad está en epidemia declarada (`inEpidemic`, el mismo
  estado que ya narra la Crónica), el gobierno SUSPENDE las fiestas — la
  aglomeración es justo lo que no conviene en plena oleada (como cancelar
  eventos en una pandemia). Un `if (ctx.epidemic) return 0` en la suitability de
  la fiesta, con `epidemic` expuesto al contexto desde la sim. Acopla dos lógicas
  ya vivas (gobierno del ciclo 3 + contagio del 25) sin maquinaria nueva. 202/202
  tests. Con esto el contagio (25-27) es un sistema epidemiológico completo:
  oleadas SIRS + respuesta conductual individual (cuarentena) + medida colectiva
  de gobierno.
  Carencia observada: la salud pública podría hacer MÁS (cerrar la escuela,
  campaña de vacunación con coste del tesoro) — pero conviene diversificar de
  esfera: la ECONOMÍA sigue siendo la más plana (solo el alimento se comercia;
  no hay alquiler/vivienda de pago, ni variedad de oficios) — probable próxima
  veta de realismo.
- 2026-07-04 · **Ciclo 28: retorno a la educación (economía — primer paso)** ·
  Empieza a profundizar la esfera más plana. Hasta ahora el salario dependía SOLO
  del tier del empleador; la educación abría empleos de tier alto pero no subía
  la paga. Ahora `payWage` factoriza la CUALIFICACIÓN del trabajador
  (`WAGE_SKILL_BONUS=0.6`): a igual empleo, un plenamente cualificado cobra ~60%
  más que uno sin estudios — desigualdad realista y la educación por fin PAGA
  directamente (refuerza el incentivo a escolarizarse, acopla education↔money).
  Verificado a nivel de mecanismo (unit sobre payWage). No rompió el balance
  monetario (205/205 tests; los tests de dinero/circular/gobierno siguen verdes,
  la subida es proporcional y el 20% de impuesto la absorbe). La correlación
  educación→riqueza a nivel de hogar aún no se ve limpia porque la educación de
  los fundadores es bastante uniforme (0.2-0.9) y promediar por hogar la centra
  — se verá más con generaciones y escuela.
  Carencia observada: la economía sigue pidiendo (a) ALQUILER/vivienda de pago
  (el mayor gasto real de un hogar, hoy inexistente — la vivienda es gratis) y
  (b) VARIEDAD de bienes más allá del alimento. El alquiler es el más realista
  pero el más delicado (puede vaciar bolsillos → emigración): hará falta cuidado
  y medición, como con el crecimiento.
- 2026-07-04 · **Ciclo 29: ALQUILER (economía — la vivienda cuesta)** · Cierra la
  carencia (a) del ciclo 28. Hasta ahora la vivienda era GRATIS y los bolsillos se
  hinchaban (sueldo >> gastos: ahorro ocioso de ~19k agregado a 12 días). Modelo:
  cada hogar ocupado paga alquiler al cierre del día (`RENT_PER_DAY=35` por familia,
  escalado por el tier de la casa, `RENT_TIER_FACTOR=0.5`), ANTES de las pensiones y
  sin desahucio: paga lo que puede (la red cubre a quien no llega). Vive en
  `economy.ts` + `chargeRent()` de `simulation.ts`, con flag `rentEnabled` para el
  A/B. HALLAZGO CLAVE (y tranquilizador dado el riesgo temido de "vaciar bolsillos"):
  el alquiler NO empobrece al pueblo, sube la VELOCIDAD DEL DINERO. A/B misma semilla,
  12 días: el ahorro baja (12,7k vs 19,1k — drena el excedente ocioso), el tesoro sube
  (12,0k vs 5,9k — el alquiler CIRCULA), se pagan casi 4× más pensiones (342 vs 90) y
  —contraintuitivo— la comida media SUBE (0.38 vs 0.33): el dinero que dormía en las
  cuentas ahora fluye tesoro→pensiones→hogares sin ingreso→compra de comida. La
  sociedad sobrevive de sobra (pop 31 vs 29, sin emigración). Acopla money↔government:
  el alquiler financia la propia red que atrapa a quien el alquiler hundiría.
  Lección de verificación (coupling emergente destapado): el alquiler REFILLa el
  tesoro DENTRO del cierre del día, antes de `payPensions`, así que el test de
  emigración (ciclo 14) —que "agotaba la red" poniendo el tesoro a 0 cada tick— dejó
  de funcionar: la pensión rescataba al hogar condenado (pop con jubilado). Arreglado
  poniendo el tesoro en quiebra profunda (−1e6) para agotar la red DE VERDAD: la
  penuria real exige un gobierno insolvente, no uno que el alquiler rellena. 209/209.
  Carencias observadas para próximos ciclos: (a) la POBLACIÓN EXPLOTA sin techo (355
  hab. a día 90 en seed 42, crecimiento exponencial poco realista) — es también la
  razón de que los tests de epidemia deban correr 90/70 días (la oleada solo emerge
  con población grande) y de que la suite tarde ~5 min; una lógica de CAPACIDAD DE
  CARGA (el crecimiento se frena al llenarse el pueblo: techo de vivienda/empleo) sería
  a la vez ganancia de realismo y de velocidad — el siguiente paso natural. (b)
  VARIEDAD de bienes más allá del alimento (bienes duraderos, ocio de pago).
- 2026-07-04 · **Ciclo 30: CAPACIDAD DE CARGA (crecimiento logístico, no caótico)** ·
  Cierra la carencia (a) del ciclo 29 — la más urgente. OBSERVACIÓN dura al medir: el
  crecimiento no solo explotaba (retroalimentación positiva sin freno: casa→familia→
  empleo→prosperidad→más casas), sino que era CAÓTICO — misma sim a día 40, la
  población iba de 22 a 353 hab. SEGÚN LA SEMILLA (×16). Una ciudad cuyo tamaño
  depende 16× del azar invisible no es realista ni medible.
  PRIMER INTENTO FALLIDO (lección valiosa, en la línea del ciclo 15): un damper que
  gateaba la inmigración con `rng.next() < K/(K+pop)`. Pero AÑADIR una tirada de RNG
  en la ruta de crecimiento BARAJA todo el flujo determinista: el resultado fue RUIDO,
  no señal — con cuarentena on la pop saltó a 1318 (¡peor!), con off cayó a 238. En un
  sistema caótico, una intervención que consume RNG espurio solo te muda a OTRA
  trayectoria caótica. Revertido.
  MODELO QUE FUNCIONA — negativa DETERMINISTA y fuerte, denso-dependiente (como la
  demografía real): (a) la inmigración (única puerta de población forastera) se CORTA
  por encima del techo `CARRYING_CAPACITY=120` (en `computeDemand`, puro); (b) la
  NATALIDAD se satura: `fertilityFactor=1−pop/K` escala `BIRTH_CHANCE` en `lifeYear`
  —coste de la vida, vivienda cara, transición demográfica—. Clave para NO caer en el
  ruido: escalar el umbral NO cambia cuántas tiradas de RNG se consumen (una por pareja
  fértil, siempre), así que el efecto es SEÑAL, no baraje. Verificado sobre 8 semillas
  (lo que el caos exige — una sola no vale): la varianza a día 40 se DESPLOMÓ de
  [22–353] (media 171) a [16–84] (media 53); a día 90 TODAS las semillas caen en
  [52–92] (antes 355 en seed 42). Meseta logística estable y CONSISTENTE, con leve
  sobreimpulso transitorio realista (seed 7 roza 137 hacia día 50 y baja a 67) — el
  boom-bust de una población que rebasa su techo. Bonus enorme: con la población
  acotada, la epidemia emerge pronto sobre un pueblo pequeño → re-afiné los tests de
  contagio (ciclo 25 mide la OLEADA CRUDA con cuarentena off, su sentido pre-ciclo-26,
  90→50 días; ciclo 26 A/B 70→50), y la suite pasó de ~293 s a 95 s. 219/219.
  Carencias observadas para próximos ciclos: (a) K es FIJO (un pueblo de ~80-90); para
  tender al sueño de §5 (10.000) habrá que ATARLO A LA BASE ECONÓMICA (empleos/
  servicios/tiers) — la ciudad crece su techo a medida que su infraestructura lo
  sostiene, no de golpe. (b) el sobreimpulso podría suavizarse (taper de inmigración
  gradual, no corte duro) para un boom-bust menos brusco. (c) sigue pendiente la
  VARIEDAD de bienes (carencia (b) del ciclo 29) y la vacuna (ciclo 25).
- 2026-07-04 · **Ciclo 31: BIENES (consumo discrecional que circula)** · Cierra la
  carencia (c) del ciclo 30 / (b) del 29: el segundo bien tras el alimento. El viejo
  "capricho" gastaba 5 fijos que se ESFUMABAN (`spend()` sin destino — un leak).
  Ahora `buyGoods` gasta en durables PROPORCIONAL al excedente del hogar (12% de lo
  que sobra sobre un suelo de 40, topado a 30): el rico consume más → desigualdad y
  sumidero del ahorro ocioso que el alquiler no drena. Y CONSERVADO: el IVA (15%) va
  al tesoro (→ pensiones) y el resto paga la IMPORTACIÓN del bien, que sale del
  pueblo — un sumidero REALISTA.
  HALLAZGO al arreglar el leak (lo importante de este ciclo): destapó un problema más
  hondo. La nómina ACUÑA dinero de la nada (`payWage` no sale de una caja finita), y
  el leak del capricho era, por accidente, el principal SUMIDERO que lo equilibraba.
  Sin él, la masa monetaria crece sin freno (tesoro 20k→69k a día 20→60; el ahorro
  medio trepa). Modelar los bienes como IMPORTACIÓN devuelve un sumidero con sentido,
  pero es modesto: el desequilibrio de fondo (impuesto de renta ≫ pensiones → el
  tesoro atesora; nómina acuñada > sumideros → el ahorro sube) SIGUE ahí. Es la
  carencia grande que deja este ciclo.
  Lección de verificación (caos): `buyGoods` NO consume RNG y aun así el crecimiento
  se movió de [42,78,71] a [35,134,122] (semillas 42/7/500 a día 40) — cambiar los
  saldos altera qué comida se puede pagar → conducta → la trayectoria caótica del
  crecimiento. Reveló que el test de integración del ciclo 30 estaba DEMASIADO
  ajustado (clavaba ≤120 en un día pre-meseta, sensible al sobreimpulso); relajado a
  umbrales GENEROSOS anti-explosión (los números finos, ya validados sobre 8
  semillas, viven aquí en §4, no en el test). 227/227 tests verdes.
  Carencias observadas para próximos ciclos: (a) CIERRE MONETARIO — el gran pendiente:
  que los sueldos salgan de una caja finita (ingresos de la empresa/tienda) y/o que el
  tesoro GASTE (obra pública, pensiones mayores) para que la masa monetaria no crezca
  sin fin. (b) que los bienes HAGAN algo (comfort/estatus — consumo ostentoso que sube
  prestigio, acopla N2→N4) en vez de solo drenar. (c) producir los bienes DENTRO
  (artesanos/taller) para que el dinero se quede en el pueblo en vez de importarse.
- 2026-07-04 · **Ciclo 32: CIERRE MONETARIO (el ahorro deja de trepar sin fin)** ·
  Ataca la carencia (a) —la grande— del ciclo 31. Diagnóstico: la nómina ACUÑA dinero
  (`payWage` no sale de una caja finita), así que sin sumideros que escalen con el
  ingreso el ahorro medio trepaba sin techo (602→1782→2333 en seed 42, hogares
  infinitamente ricos, irreal) y el tesoro atesoraba (24k→147k). Dos frenos realistas,
  del lado del GASTO (evito reestructurar la nómina, que sería un cambio enorme y con
  riesgo de cascada): (1) COSTE DE LA VIDA que escala con la riqueza — `spendLifestyle`
  drena el 14% del ahorro EXCEDENTE sobre un colchón de 90 (lifestyle inflation: quien
  más tiene, más gasta en servicios/ocio/mantenimiento); parte queda en el tesoro
  (servicios locales) y el resto SALE del pueblo (el sumidero que equilibra la
  acuñación). (2) el tesoro no atesora: `payPublicDividend` guarda una reserva prudente
  (300/hab.) y reparte el 25%/día del superávit (obra pública/dividendo) → el dinero
  público circula de vuelta. Verificado: el ahorro medio se ESTABILIZA en meseta
  (~750, oscilando, no los miles crecientes de antes) y el tesoro se frena (147k→37k),
  ambos protegiendo un colchón (nadie se arruina; la comida se mantiene 0.32–0.37). El
  crecimiento sigue acotado (semillas 42/7/500 a día 40 dentro del umbral anti-
  explosión). Conservación verificada en unit (lo drenado = tesoro + sumidero externo;
  el dividendo baja el tesoro justo lo repartido). 239/239 tests verdes.
  MATIZ HONESTO: la masa monetaria TOTAL aún crece con el pueblo (la acuñación de la
  nómina supera a los sumideros), pero eso es realista (una economía en crecimiento
  tiene más dinero); lo que importaba —la riqueza PER CÁPITA acotada y el tesoro sin
  piramidar— sí se logra. El cierre TOTAL (nómina desde caja finita: tiendas pagan de
  su till, el sector público del tesoro) queda como cambio mayor para un ciclo dedicado.
  Carencias observadas para próximos ciclos: (a) cierre monetario TOTAL (nómina finita)
  — el gran pendiente estructural. (b) que los bienes/riqueza HAGAN algo (estatus/
  comfort, N2→N4). (c) producción de bienes DENTRO (artesanos). (d) la vacuna (ciclo 25)
  y atar el techo de población K a la base económica (ciclo 30) para tender a §5.
- 2026-07-04 · **Ciclo 33: VACUNACIÓN (salud pública preventiva)** · Remata el arco
  del contagio (25-27) y cierra su carencia (c): la medida que PREVIENE en vez de
  curar. Pivote de esfera tras cuatro ciclos de economía (29-32), y hacia el nivel más
  fino de contagio. Modelo: en la temporada de brotes (otoño-invierno) el sistema
  sanitario vacuna a los SUSCEPTIBLES (ni enfermos ni ya inmunes), confiriéndoles la
  inmunidad SIN pasar la enfermedad (`VACCINE_IMMUNITY`, decae igual que la natural →
  hay que revacunar cada temporada). Requiere CLÍNICA (infraestructura) y la paga el
  TESORO (`VACCINE_COST_PER_DOSE`, acopla contagio↔gobierno↔salud: un pueblo en quiebra
  no la costea). Cuando bastantes quedan inmunes emerge sola la INMUNIDAD DE REBAÑO —
  el contagio (que en social.ts salta solo a los susceptibles) no encuentra a quién
  saltar y la oleada se apaga. Verificado A/B (misma semilla, sin cuarentena para
  aislar el efecto, 50 días): con vacuna el pico de la oleada cae de 24 a 8 enfermos
  simultáneos y el TOTAL de gente que enferma de 51 a 14 — muchísima menos. El coste lo
  absorbe el tesoro (ciclo 32 le dio sentido: financia la salud pública). Los tests de
  oleada cruda (25) y de cuarentena (26) apagan la vacuna (`vaccination=false`) para
  aislar su mecanismo, como ya hacían con la cuarentena. 243/243 tests verdes.
  Carencias observadas para próximos ciclos: (a) el cierre monetario TOTAL (nómina
  finita) sigue siendo el gran pendiente estructural. (b) los bienes/riqueza aún no
  HACEN nada social (estatus/comfort, N2→N4 — la esfera más fina). (c) la vacuna podría
  tener cobertura desigual (los barrios ricos se vacunan antes — injusticia sanitaria
  real) o dudas/rechazo. (d) subir por fin a N4/N5 (legado, vocación) — la pirámide
  está muy desarrollada en la base y fina en la cúspide.
- 2026-07-05 · **Ciclo 34 (INTENTADO Y REVERTIDO): estatus por consumo (N4)** ·
  Hipótesis: el consumo ostentoso (bienes/vida, ciclos 31/32) confiere PRESTIGIO, y el
  prestigio DECAE (hay que mantenerlo) → la desigualdad económica se vuelve desigualdad
  SOCIAL visible. Implementado (gainPrestige por gasto + decayPrestige diario) y MEDIDO:
  no funciona. HALLAZGO (valioso): TODOS los hogares acaban con prestigio 1.00, sin
  diferenciar. Dos causas encadenadas: (1) el `investInHomes` del ciclo 9 ya maxea el
  prestigio de cualquier hogar con ahorro ≥ 80, y (2) la economía CERRADA (ciclos 29-32:
  nómina + dividendo + pensiones) no deja hogares POBRES — todos superan 80. Sin
  desigualdad económica, ningún estatus atado a la riqueza puede diferenciar: el
  prestigio se satura para todos. El crecimiento sí quedó acotado (max 120 a día 40).
  Revertido el código (economy.ts, simulation.ts); no llegó a tocar tests ni logics.
  LECCIÓN para el futuro N4/N5: la estima significativa NO puede colgar de la riqueza
  mientras la economía sea igualitaria. Dos caminos limpios: (a) introducir DESIGUALDAD
  económica persistente primero (que la haya de verdad, no todos cómodos), o —mejor y
  más humano— (b) que el estatus/la estima nazca de LOGROS NO monetarios que varían de
  forma natural: criar hijos, longevidad, ser pilar del barrio, VOCACIÓN cumplida,
  LEGADO recordado (§6.1). Ese es el siguiente ataque a la cúspide de la pirámide.
- 2026-07-05 · **Ciclo 34 (bis): LEGADO — la vida deja huella (N5)** · Aplica DIRECTO
  la lección del 34-revertido: la estima no cuelga del dinero, nace de LO VIVIDO.
  Primer paso, el más humano y de menor riesgo: la Crónica —la memoria del juego, la
  condición de victoria §6.1— honra al morir los HIJOS que uno crió. Nuevo campo
  `childrenRaised` en el ciudadano (puro RECUERDO: no alimenta ninguna dinámica, así
  que CERO riesgo de caos), que se incrementa en ambos padres a cada nacimiento; al
  morir, el evento lo lleva y el narrador (`chronicleText`) añade "…, deja N hijos"
  (singular/plural). El dato VARÍA de forma natural —justo lo que le faltaba al estatus
  por riqueza—: en seed 42 a 40 días mueren 12 personas, 5 dejando hijos, y la mayor
  huella es de 8 — una matriarca. Así una vida larga y fecunda se distingue de una
  corta, y la Crónica lo cuenta sin guion. Verificado (narrador puro + emergencia
  integrada). 248/248 tests verdes. Sube por fin a N5 (la cúspide era festival sola).
  Carencias observadas para próximos ciclos: (a) el legado podría ampliarse (oficio/
  vocación cumplida, ser pilar del barrio por amistades, longevidad venerada) y hacerse
  VISIBLE en el inspector, no solo en la Crónica. (b) que la huella IMPORTE en vida
  (los mayores con muchos hijos/nietos, respetados) — con cuidado de no acoplar al caos
  del crecimiento. (c) sigue el cierre monetario TOTAL (nómina finita) y la vocación.
- 2026-07-05 · **Ciclo 35: LEGADO PERMANENTE (memoria por niveles, §6.1)** · Profundiza
  el ciclo 34-bis y remata el clúster del legado. La Crónica ya resumía los años viejos
  en una línea (ciclo 21, "memoria como los humanos"), pero eso BORRABA también a los
  pilares del pueblo. Ahora un LEGADO —quien crió una familia grande (`LEGACY_KIDS=4`)
  o alcanzó edad venerable (90)— es un tipo de evento propio (`'legacy'`) que NO se
  compacta: se recuerda POR NOMBRE para siempre, junto al resumen de lo rutinario de su
  año. Así el largo plazo del pueblo conserva a sus matriarcas y patriarcas, que es
  exactamente la condición de victoria (§6.1: ganamos cuando la Crónica cuenta las
  historias que importan y no escribimos nosotros). Puro (clasificador `isLegacyDeath`
  + retención en `compactChronicle`), cero riesgo de sim, headless-testable — sin coste
  de screenshot porque el render no estiliza por tipo (el legado se distingue por
  SOBREVIVIR, no por color). 255/255 tests verdes.
  Carencias observadas para próximos ciclos: (a) hacer el legado y la vida VISIBLES en
  el inspector (requiere plumbing worker→protocolo→UI + screenshot). (b) más formas de
  legado no monetario (oficio/vocación, ser pilar por amistades) y que IMPORTE en vida.
  (c) el gran pendiente estructural sigue siendo el cierre monetario TOTAL (nómina
  finita: tiendas pagan de su caja, el sector público del tesoro).
