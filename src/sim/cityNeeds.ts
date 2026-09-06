/** Consejo municipal derivado de la misma demanda que mueve las obras. Sin RNG ni escrituras. */
import { computeDemands, itemForDemand, type DemandInput, type DemandKind } from '../world/growth';
import { catalogData } from '../world/catalogData';
import type { CityNeed, GrowthPolicy, PublicAutobuildPolicy } from './protocol';

export interface CityNeedsContext {
  treasury: number;
  bankrupt: boolean;
  publicAutobuild: PublicAutobuildPolicy;
  growthPolicy: GrowthPolicy;
  autonomousGrowth: boolean;
  abandoned: Array<[number, number]>;
}

type NeedKind = Exclude<DemandKind, null>;
const TITLES: Record<NeedKind, string> = {
  residential: 'Más viviendas', commerce: 'Más comercios', work: 'Oportunidades de empleo',
  school: 'Plazas escolares', clinic: 'Atención sanitaria', police: 'Cobertura policial',
  fire: 'Protección contra incendios', park: 'Espacios verdes',
};

function reason(kind: NeedKind, d: DemandInput): string {
  switch (kind) {
    case 'school': return `${d.children} niños en edad escolar y ${d.studentSlots} plazas disponibles.`;
    case 'clinic': return `Sin consultorio activo para ${d.totalPopulation} habitantes.`;
    case 'police': return `${Math.round((d.policeCoverage ?? 1) * 100)}% de las viviendas con cobertura policial.`;
    case 'fire': return `${Math.round((d.fireCoverage ?? 1) * 100)}% de las viviendas con cobertura de bomberos.`;
    case 'park': return `Ánimo al ${Math.round((d.avgHappiness ?? 0) * 100)}%; ${Math.round((d.parkCoverage ?? 1) * 100)}% de viviendas cerca de un parque.`;
    case 'work': return `${d.population - d.employed} ${d.population - d.employed === 1 ? 'adulto' : 'adultos'} sin empleo; ${Math.max(0, d.jobs - d.employed)} puestos libres.`;
    case 'residential': return 'Sin plazas familiares libres con acceso a una vía y con demanda de nuevos hogares.';
    case 'commerce': return d.shops === 0 ? `${d.population} adultos y ningún comercio activo.` : `${d.shops} comercios con prosperidad alta para ${d.population} adultos.`;
  }
}

export function cityNeeds(d: DemandInput, context: CityNeedsContext): CityNeed[] {
  const needs: CityNeed[] = [];
  if (context.bankrupt) needs.push({
    id: 'budget', title: 'Recuperar la tesorería', reason: 'La quiebra suspende las nuevas construcciones.',
    status: 'Revisa ingresos, gastos y deuda en el presupuesto municipal.',
    actionLabel: 'Revisar presupuesto', action: { kind: 'budget' },
  });
  if (context.abandoned.length) needs.push({
    id: 'access', title: 'Reconectar edificios',
    reason: `${context.abandoned.length} edificios cerrados por falta de acceso a una vía.`,
    status: 'Acerca una vía a su entrada para que puedan volver a funcionar.',
    actionLabel: 'Localizar y trazar vía', action: { kind: 'road', cell: [...context.abandoned[0]] },
  });
  for (const kind of computeDemands(d)) {
    if (needs.length >= 3) break;
    const item = catalogData(itemForDemand(kind, d.tier, Math.max(0, d.population - d.employed)));
    if (!item) continue;
    const publicService = ['school', 'clinic', 'police', 'fire', 'park'].includes(kind);
    const cost = item.cost ?? 0;
    const blockedByMoney = context.bankrupt || context.treasury < cost;
    const autonomous = context.autonomousGrowth && (!publicService || context.publicAutobuild === 'paid');
    let status = autonomous
      ? 'Crecimiento autónomo activo: la ciudad buscará una parcela adecuada.'
      : 'Puedes colocarlo desde el catálogo de construcción.';
    if (!publicService && context.growthPolicy === 'zonesOnly' && context.autonomousGrowth) {
      status = 'El crecimiento requiere una zona compatible junto a una vía; también puedes construir manualmente.';
    }
    if (publicService && context.publicAutobuild === 'off') status = 'Servicios automáticos desactivados: el alcalde decide dónde construir.';
    if (blockedByMoney) {
      status = context.bankrupt ? 'La quiebra impide la colocación manual.'
        : `Faltan ${Math.ceil(cost - context.treasury)} € para colocarlo manualmente.`;
      if (!publicService && autonomous) status += ' El crecimiento privado autónomo no cobra la obra.';
    }
    if (item.tier > d.tier) status = `Se desbloquea en nivel ${item.tier}; puedes consultar su ficha.`;
    needs.push({
      id: kind, title: TITLES[kind], reason: reason(kind, d), status,
      actionLabel: blockedByMoney && item.tier <= d.tier ? 'Revisar presupuesto' : `Ver ${item.name}`,
      action: blockedByMoney && item.tier <= d.tier ? { kind: 'budget' } : { kind: 'build', itemId: item.id },
    });
  }
  return needs;
}
