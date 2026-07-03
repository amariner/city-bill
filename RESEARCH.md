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
