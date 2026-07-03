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
