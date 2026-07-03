# CATALOG — Listado de construcciones

Catálogo completo de lo construible. Cada entrada define: tamaño en celdas de rejilla
(1 celda = 2×2 m), tier de desbloqueo, rol en la simulación y notas visuales.
Los colores SIEMPRE salen de `src/palette.ts` (ampliándola si hace falta, nunca hardcodeando).

Tiers: **T0** disponible desde el inicio · **T1** aldea (pop 20) · **T2** pueblo (pop 100)
· **T3** villa (pop 400) · **T4** ciudad (pop 1500, estética Zlín).

## Infraestructura
| Ítem | Celdas | Tier | Rol sim | Notas visuales |
|---|---|---|---|---|
| Camino de tierra | 1 ancho | T0 | Peatones, velocidad baja | Color `path`, sin margen |
| Carretera rural | 2 ancho | T0 | Coches + peatones | Color `road`, margen verde + arbolado automático |
| Calle de pueblo | 2 ancho | T2 | Coches + aceras | Aceras claras, farolas low-poly |
| Avenida | 3 ancho | T3 | Doble sentido, mediana | Mediana verde con cipreses |
| Plaza | 4×4 | T2 | Punto social (ocio) | Pavimento claro, bancos, fuente |
| Puente | 2 ancho | T3 | Cruza agua | Vigas facetadas |
| Vía de tren | 2 ancho | T4 | Tren decorativo/logístico | Balasto gris, traviesas |
| Estación de tren | 3×6 | T4 | Hito, atrae comercio | Andén + marquesina, referencia Zlín |
| Poste eléctrico | 1×1 | T1 | Decorativo en carreteras | Como la referencia rural: poste en T con cables catenaria |

## Residencial
| Ítem | Celdas | Tier | Capacidad | Notas visuales |
|---|---|---|---|---|
| Casa de campo | 4×3 | T0 | 1 familia (2-5) | Blanca, porche, chimenea — ya implementada (`farmhouse`) |
| Casita de pueblo | 3×2 | T1 | 1 familia (2-4) | Ya implementada (`cottage`), 3 variantes de tamaño |
| Casa adosada | 2×2 ×fila | T2 | 1 familia c/u | Ya modelada (`rowHouses`): filas de 3-5, tejado teja, muros alternos blanco/crema |
| Casa con jardín | 3×3 | T2 | 1 familia | Jardín trasero con árbol propio |
| Bloque bajo | 4×3 | T3 | 8 familias | 3 plantas, balcones facetados |
| Bloque panelák | 10×4 | T3 | 18 familias | Ya modelado (`apartmentSlab`): losa de hormigón claro, ventanas mixtas, caja de escalera |
| Bloque Zlín | 5×4 | T4 | 24 familias | Ya modelado (`brickBlock`): ladrillo rojizo `brick`, retícula de ventanas crema encendidas, tejado plano oscuro |
| Torre residencial | 4×4 | T4 | 40 familias | 8-10 plantas, coronación blanca — base ya modelada (`officeBlock` variante) |

## Trabajo y servicios
| Ítem | Celdas | Tier | Empleos | Notas visuales |
|---|---|---|---|---|
| Granero | 3×4 | T0 | 2 | Ya implementado (`barn`) |
| Cobertizo | 1×1 | T0 | 0 | Ya implementado (`shed`) |
| Silo | 1×1 | T1 | 1 | Cilindro crema con cúpula |
| Campo de cultivo activo | 4×4+ | T0 | 2/parcela | Pasa de beige (barbecho) a franjas verdes al trabajarse |
| Tienda de pueblo | 3×2 | T1 | 3 | Ya implementada (`shop`), toldo rojizo |
| Mercado | 4×3 | T2 | 6 | Puestos con toldos de la paleta de acentos |
| Supermercado | 9×6 | T3 | 12 | Ya modelado (`supermarket`): caja blanca, franja `signRed`, rótulo `signYellow`, muelle de carga |
| Parking en altura | 8×5 | T3 | 2 | Ya modelado (`parkingGarage`): losas abiertas, antepechos y núcleo de escalera |
| Escuela | 5×4 | T2 | 8 | Blanca, patio con árboles, campanario pequeño |
| Iglesia / ermita | 3×4 | T1 | 1 | Blanca, torre con tejado a cuatro aguas |
| Ayuntamiento | 8×5 | T3 | 10 | Ya modelado (`civic`): pórtico de columnas, tejado a cuatro aguas teja y torre central |
| Clínica | 4×3 | T3 | 8 | Blanca con cruz `barnWall` |
| Café | 2×2 | T2 | 3 | Terraza con sillas, punto social fuerte |
| Oficinas | 5×5 | T4 | 30 | Ya modelada (`officeBlock`): torre gris con franjas verticales de vidrio y coronación clara |
| Fábrica de ladrillo | 8×6 | T4 | 40 | Ya modelada (`factory`): nave de ladrillo, dientes de sierra con vidrio, chimenea alta con banda |
| Almacén ferroviario | 4×6 | T4 | 12 | Junto a vía, portones grandes |

## Naturaleza y decoración
| Ítem | Celdas | Tier | Rol sim | Notas visuales |
|---|---|---|---|---|
| Árbol de copa (blob) | 1×1 | T0 | +felicidad radio 6 | Ya implementado, 2 tonos |
| Ciprés | 1×1 | T0 | +felicidad radio 4 | Ya implementado |
| Arboleda | 3×3 | T0 | +felicidad radio 10 | 5-9 árboles con RNG |
| Estanque | 3×3 | T0 | +felicidad radio 8 | Ya implementado, orilla irregular |
| Parque | 4×4 | T2 | Punto de ocio | Césped a franjas + senderos + banco |
| Huerto vecinal | 2×2 | T1 | Punto de ocio/comida | Bancales en franjas verdes |
| Valla blanca | 1 lineal | T1 | Decorativo | Postes + travesaño, muy low-poly |
| Fuente | 1×1 | T2 | +felicidad plaza | Pila circular `pond` |

## Unidades móviles (no se construyen: aparecen solas)
| Ítem | Tier | Comportamiento |
|---|---|---|
| Ciudadano | T0 | Ver Fase 3 del ROADMAP: necesidades, horario, trabajo, social |
| Coche | T2 | Ruta casa↔trabajo por carreteras, colores apagados de la paleta |
| Camión | T3 | Granja/fábrica → mercado/almacén |
| Tractor | T1 | Recorre campos activos en franjas |
| Tren | T4 | Circuito fijo por la vía, 3-5 vagones, silbido lejano |
| Pájaros | T0 | Bandada ocasional, puro ambiente |
