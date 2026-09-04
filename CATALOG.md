# CATALOG — Listado de construcciones

Catálogo completo de lo construible. Cada entrada define: tamaño en celdas de rejilla
(1 celda = 2×2 m), tier de desbloqueo, rol en la simulación y notas visuales.
Los colores SIEMPRE salen de `src/palette.ts` (ampliándola si hace falta, nunca hardcodeando).

**La fuente de verdad de lo implementado es `src/world/catalogData.ts`** (25 ítems; el
worker de sim importa ese archivo y `catalog.ts` le añade los `build()` de mesh). Este
documento es el catálogo de DISEÑO: ✅ = en el código, con su `id` real; sin marca =
pendiente de modelar. *Sincronizado con el código el 2026-09-03 (H4.5): footprints,
tiers, servicios y empleos de los ✅ son los del código.*

Tiers: **T0** disponible desde el inicio · **T1** aldea (pop 20) · **T2** pueblo (pop 100)
· **T3** villa (pop 400) · **T4** ciudad (pop 1500, estética Zlín).

Economía H3.1: las obras que coloca el jugador tienen `cost` y `playerPlaceable` en
`catalogData.ts`; el crecimiento autónomo no las carga. Los edificios públicos activos
pueden tener `upkeepPerDay` (escuela 60, consultorio 40, ayuntamiento 80, comisaría y
bomberos 50, parque 8, plaza 10, zona de juegos 6). Las vías
se cobran por celda al construir y mantienen estos costes: camino 3, rural 8, calle 14,
avenida 24; su mantenimiento diario es 0.5, 1, 2 y 3 respectivamente. Los importes
son deliberadamente legibles y el ledger del tesoro se conserva en el guardado.

## Infraestructura

> Hoy las vías existen como TERRENO (`road`/`path`, con márgenes y arbolado automáticos
> — T4.4), no como ítems de catálogo. Esta tabla es diseño para la construcción manual
> (Fase 2, **POST-MVP**) y para el tren (T5.2, **POST-MVP**).

| Ítem | Celdas | Tier | Rol sim | Notas visuales |
|---|---|---|---|---|
| Camino de tierra | 1 ancho | T0 | Peatones, velocidad baja | Color `path`, sin margen |
| Carretera rural | 2 ancho | T0 | Coches + peatones | Color `road`, margen verde + arbolado automático |
| Calle de pueblo | 2 ancho | T2 | Coches + aceras | Aceras claras, farolas low-poly |
| Avenida | 3 ancho | T3 | Doble sentido, mediana | Mediana verde con cipreses |
| Plaza | 4×4 | T2 | ✅ `plaza` · servicio `park` | Pavimento claro, bancos, fuente |
| Puente | 2 ancho | T3 | Cruza agua | Vigas facetadas |
| Vía de tren | 1 ancho | T4 | ✅ Circuito ferroviario | Balasto gris, vía exclusiva no peatonal |
| Estación de tren | 3×6 | T4 | ✅ `station` · 3 empleos | Andén + marquesina, referencia Zlín |
| Poste eléctrico | 1×1 | T1 | Decorativo en carreteras | Poste en T con cables catenaria |

## Residencial
| Ítem | Celdas | Tier | Capacidad | Estado / notas visuales |
|---|---|---|---|---|
| Casa de campo | 5×4 | T0 | 1 familia | ✅ `farmhouse` — blanca, porche, chimenea |
| Casita de pueblo | 3×3 | T1 | 1 familia | ✅ `cottage` — variantes de tamaño |
| Adosados | 8×3 | T2 | 4 familias | ✅ `row-houses` — fila con tejado teja, muros alternos blanco/crema |
| Bloque panelák | 10×4 | T3 | 18 familias | ✅ `apartment-slab` — losa de hormigón claro, ventanas mixtas, caja de escalera |
| Bloque Zlín | 7×5 | T4 | 24 familias | ✅ `brick-block` — ladrillo rojizo `brick`, retícula de ventanas crema, tejado plano oscuro |
| Casa con jardín | 3×3 | T2 | 3 familias | ✅ `town-house` — upgrade de la casita, porche y jardín |
| Bloque bajo | 4×3 | T3 | 8 familias | ✅ `low-block` — tres plantas, huella compacta para upgrade |
| Torre residencial | 4×4 | T4 | 40 familias | 8-10 plantas, coronación blanca — base aprovechable de `office` |

## Trabajo y servicios
| Ítem | Celdas | Tier | Empleos | Estado / notas visuales |
|---|---|---|---|---|
| Granero | 4×5 | T0 | 2 | ✅ `barn` |
| Cobertizo | 2×2 | T0 | 0 | ✅ `shed` |
| Tienda | 4×3 | T1 | 3 | ✅ `shop` — toldo rojizo |
| Supermercado | 9×6 | T3 | 12 | ✅ `supermarket` — caja blanca, franja `signRed`, rótulo `signYellow`, muelle de carga |
| Parking en altura | 8×5 | T3 | 2 | ✅ `parking` — losas abiertas, antepechos y núcleo de escalera |
| Ayuntamiento | 8×5 | T3 | 10 | ✅ `civic` — pórtico de columnas, tejado teja a cuatro aguas, torre central |
| Escuela | 6×4 | T1 | 2 (+24 alumnos) | ✅ `school` — blanca, patio con árboles, campanario pequeño; servicio `education` |
| Consultorio | 4×3 | T1 | 2 | ✅ `clinic` — blanco con cruz `barnWall`; servicio `health` |
| Comisaría | 4×4 | T2 | 2 | ✅ `police` — edificio bajo con franja acristalada; servicio `police` |
| Parque de bomberos | 4×4 | T2 | 2 | ✅ `fire-station` — nave roja con torre y portones; servicio `fire` |
| Oficinas | 5×5 | T4 | 30 | ✅ `office` — torre gris con franjas verticales de vidrio, coronación clara |
| Fábrica | 8×6 | T4 | 40 | ✅ `factory` — nave de ladrillo, dientes de sierra con vidrio, chimenea alta |
| Silo | 1×1 | T1 | 1 | Cilindro crema con cúpula |
| Campo de cultivo | — | T0 | — | Existe como TERRENO: barbecho → franjas verdes al trabajarse (T3.8), sin ítem de catálogo |
| Mercado | 4×3 | T2 | 6 | Puestos con toldos de la paleta de acentos |
| Iglesia / ermita | 3×4 | T1 | 1 | Blanca, torre con tejado a cuatro aguas |
| Café | 2×2 | T2 | 3 | Terraza con sillas, punto social fuerte |
| Almacén ferroviario | 4×6 | T4 | 12 | Junto a vía, portones grandes (con el tren, **POST-MVP**) |

## Naturaleza y decoración
| Ítem | Celdas | Tier | Rol sim | Estado / notas visuales |
|---|---|---|---|---|
| Árbol de copa (blob) | 1×1 | T0 | `amenity: 1` | ✅ `tree-blob` — 2 tonos |
| Ciprés | 1×1 | T0 | `amenity: 1` | ✅ `tree-cypress` |
| Estanque | 3×3 | T0 | +felicidad radio 8 | En el mundo semilla como agua con orilla irregular; sin ítem de catálogo |
| Arboleda | 3×3 | T0 | +felicidad radio 10 | 5-9 árboles con RNG |
| Parque | 4×4 | T1 | ✅ `park` · servicio `park` | Césped a franjas + senderos + bancos |
| Plaza | 4×4 | T2 | ✅ `plaza` · servicio `park` | Pavimento claro, bancos y fuente |
| Zona de juegos | 2×2 | T1 | ✅ `playground` · servicio `park` | Arena, columpio y tobogán |
| Huerto vecinal | 2×2 | T1 | Punto de ocio/comida | Bancales en franjas verdes |
| Valla blanca | 1 lineal | T1 | Decorativo | Postes + travesaño, muy low-poly |
| Fuente | 1×1 | T2 | +felicidad plaza | Pila circular `pond` |

## Unidades móviles (no se construyen: aparecen solas)
| Ítem | Tier | Estado / comportamiento |
|---|---|---|
| Ciudadano | T0 | ✅ Peatones instanciados con interpolación y bobbing (T3.6); necesidades, utility-AI, social — Fase 3 |
| Coche | T2 | ✅ Trayectos > 40 celdas por el grafo vial, aparca cerca del destino (T3.9) |
| Pájaros | T0 | ✅ Bandada del anochecer (T5.4), puro ambiente |
| Tractor | T1 | Pendiente — residuo de T3.9, **POST-MVP** (recorte 2026-08-14) |
| Camión | T3 | Pendiente — granja/fábrica → mercado/almacén |
| Tren | T4 | ✅ Circuito cerrado + estación activa: 1 locomotora y 3-5 vagones, estado guardable |
