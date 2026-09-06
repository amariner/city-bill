import { ignoreGameKey } from '../core/keyboard';
/** Panel de presupuesto del alcalde (H3.4). Solo presenta `CityStats.budget`
 * y envía acciones fiscales/financieras al worker; no duplica estado de la sim. */
import { PALETTE } from '../palette';
import { LOAN_TIERS } from '../sim/economy';
import { SimClient } from '../sim/client';
import { CityStats, PublicAutobuildPolicy, TaxSector } from '../sim/protocol';
import { css, INK, PANEL_BG, PANEL_BORDER, PANEL_SHADOW, rgba } from './theme';

const ALERT = css(PALETTE.signRed);
const WARN = css(PALETTE.signYellow);
const OK = css(PALETTE.grass);
const TAXES: Array<{ sector: TaxSector; label: string }> = [
  { sector: 'R', label: 'renta' },
  { sector: 'C', label: 'sociedades' },
  { sector: 'I', label: 'actividad' },
];
const BREAKDOWN: Array<[keyof CityStats['budget']['breakdown'], string]> = [
  ['taxR', 'impuesto R'],
  ['taxC', 'impuesto C'],
  ['taxI', 'impuesto I'],
  ['rent', 'alquiler'],
  ['goods', 'IVA bienes'],
  ['lifestyle', 'coste de vida'],
  ['wages', 'nómina pública'],
  ['pensions', 'pensiones'],
  ['upkeep', 'mantenimiento'],
  ['interest', 'intereses'],
  ['build', 'obras'],
  ['dividend', 'dividendos'],
];

function money(value: number): string {
  return `${Math.round(value).toLocaleString('es-ES')} €`;
}

export class BudgetPanel {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private toggle: HTMLButtonElement;
  private treasury: HTMLSpanElement;
  private debt: HTMLSpanElement;
  private flow: HTMLSpanElement;
  private upkeep: HTMLSpanElement;
  private loans: HTMLDivElement;
  private spark: SVGPolylineElement;
  private breakdown = new Map<keyof CityStats['budget']['breakdown'], HTMLSpanElement>();
  private inputs = new Map<TaxSector, HTMLInputElement>();
  private taxValues = new Map<TaxSector, HTMLSpanElement>();
  private editing = new Set<TaxSector>();
  private loanButtons = new Map<0 | 1 | 2, HTMLButtonElement>();
  private autobuildButtons = new Map<PublicAutobuildPolicy, HTMLButtonElement>();
  private open = false;
  private last = '';

  constructor(private sim: SimClient) {
    this.injectStyle();
    this.root = document.createElement('div');
    this.root.className = 'cb-budget-root';

    this.toggle = document.createElement('button');
    this.toggle.className = 'cb-budget-toggle';
    this.toggle.textContent = 'T · presupuesto';
    this.toggle.title = 'Abrir presupuesto municipal';
    this.toggle.addEventListener('click', () => this.setOpen(!this.open));
    this.root.appendChild(this.toggle);

    this.panel = document.createElement('div');
    this.panel.className = 'cb-budget-panel';
    this.panel.style.display = 'none';
    this.root.appendChild(this.panel);

    const header = document.createElement('div');
    header.className = 'cb-budget-header';
    const title = document.createElement('span');
    title.textContent = 'presupuesto municipal';
    const close = document.createElement('button');
    close.className = 'cb-budget-close';
    close.textContent = '×';
    close.title = 'Cerrar presupuesto';
    close.addEventListener('click', () => this.setOpen(false));
    header.append(title, close);
    this.panel.appendChild(header);

    const summary = document.createElement('div');
    summary.className = 'cb-budget-summary';
    this.treasury = this.value(summary, 'tesoro');
    this.debt = this.value(summary, 'deuda');
    this.panel.appendChild(summary);

    const flow = document.createElement('div');
    flow.className = 'cb-budget-flow';
    this.flow = this.value(flow, 'flujo diario');
    this.upkeep = this.value(flow, 'mantenimiento previsto');
    this.panel.appendChild(flow);

    this.section('tipos fiscales');
    for (const { sector, label } of TAXES) {
      const row = document.createElement('label');
      row.className = 'cb-budget-tax';
      const name = document.createElement('span');
      name.textContent = `${sector} · ${label}`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '50';
      input.step = '1';
      input.addEventListener('focus', () => this.editing.add(sector));
      input.addEventListener('input', () => {
        const value = this.taxValues.get(sector);
        if (value) value.textContent = `${input.value}%`;
      });
      input.addEventListener('change', () => {
        this.sim.act({ kind: 'setTax', sector, rate: Number(input.value) / 100 });
      });
      input.addEventListener('blur', () => {
        this.editing.delete(sector);
        this.update(this.sim.city);
      });
      const value = document.createElement('span');
      value.className = 'cb-budget-tax-value';
      row.append(name, input, value);
      this.panel.appendChild(row);
      this.inputs.set(sector, input);
      this.taxValues.set(sector, value);
    }

    this.section('servicios autónomos');
    const autobuildOptions = document.createElement('div');
    autobuildOptions.className = 'cb-budget-policy-options';
    const policies: Array<[PublicAutobuildPolicy, string, string]> = [
      ['off', 'manual', 'La ciudad avisa de las necesidades, pero no construye servicios por su cuenta'],
      ['paid', 'pagados', 'La ciudad construye servicios cuando el tesoro puede pagar la obra'],
    ];
    for (const [policy, label, title] of policies) {
      const button = document.createElement('button');
      button.className = 'cb-budget-loan';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => this.sim.act({ kind: 'setPolicy', policy: 'publicAutobuild', value: policy }));
      autobuildOptions.appendChild(button);
      this.autobuildButtons.set(policy, button);
    }
    this.panel.appendChild(autobuildOptions);

    this.section('préstamos');
    const loanOptions = document.createElement('div');
    loanOptions.className = 'cb-budget-loan-options';
    for (let tier = 0 as 0 | 1 | 2; tier <= 2; tier = (tier + 1) as 0 | 1 | 2) {
      const spec = LOAN_TIERS[tier];
      const button = document.createElement('button');
      button.className = 'cb-budget-loan';
      button.textContent = `T${tier + 1} · ${money(spec.amount)}`;
      button.title = `${spec.termDays} días · ${(spec.interestRate * 100).toFixed(1)}% diario`;
      button.addEventListener('click', () => this.sim.act({ kind: 'loan', tier }));
      loanOptions.appendChild(button);
      this.loanButtons.set(tier, button);
    }
    this.panel.appendChild(loanOptions);
    this.loans = document.createElement('div');
    this.loans.className = 'cb-budget-loans';
    this.panel.appendChild(this.loans);

    this.section('acumulado');
    const breakdown = document.createElement('div');
    breakdown.className = 'cb-budget-breakdown';
    for (const [key, label] of BREAKDOWN) {
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('span');
      value.textContent = '0 €';
      breakdown.append(name, value);
      this.breakdown.set(key, value);
    }
    this.panel.appendChild(breakdown);

    this.section('tesoro · últimos 30 días');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 260 48');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.className.baseVal = 'cb-budget-spark';
    this.spark = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    this.spark.setAttribute('fill', 'none');
    this.spark.setAttribute('stroke-linecap', 'round');
    this.spark.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(this.spark);
    this.panel.appendChild(svg);

    document.body.appendChild(this.root);
    window.addEventListener('keydown', (event) => {
      if (ignoreGameKey(event) || event.repeat) return;
      if (event.key.toLowerCase() !== 't') return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'BUTTON') return;
      this.setOpen(!this.open);
    });
  }

  update(city: CityStats | null): void {
    if (!city || !city.budget) return;
    const budget = city.budget;
    const sig = [
      city.treasury | 0,
      city.debt | 0,
      city.bankrupt ? 1 : 0,
      Math.round(budget.incomeToday),
      Math.round(budget.expenseToday),
      budget.history.length,
      budget.loans.map((loan) => `${loan.id}:${Math.round(loan.balance)}`).join(','),
      ...TAXES.map(({ sector }) => city.taxRates[sector]),
      city.publicAutobuild,
      ...BREAKDOWN.map(([key]) => Math.round(budget.breakdown[key])),
    ].join('|');
    if (sig === this.last) return;
    this.last = sig;

    this.treasury.textContent = money(city.treasury);
    this.treasury.style.color = city.bankrupt ? ALERT : city.debt > 0 ? WARN : OK;
    this.debt.textContent = city.debt > 0 ? money(city.debt) : 'sin deuda';
    this.debt.style.color = city.debt > 0 ? WARN : OK;
    this.flow.textContent = `+${money(budget.incomeToday)} / −${money(budget.expenseToday)}`;
    this.upkeep.textContent = money(budget.upkeepPerDay);

    for (const { sector } of TAXES) {
      if (this.editing.has(sector)) continue;
      const input = this.inputs.get(sector)!;
      const rate = Math.round(city.taxRates[sector] * 100);
      input.value = String(rate);
      this.taxValues.get(sector)!.textContent = `${rate}%`;
    }
    for (const [policy, button] of this.autobuildButtons) {
      const active = city.publicAutobuild === policy;
      button.classList.toggle('cb-budget-loan-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const [key, value] of this.breakdown) value.textContent = money(budget.breakdown[key]);

    const activeTiers = new Set(budget.loans.map((loan) => loan.tier));
    for (const [tier, button] of this.loanButtons) {
      button.disabled = activeTiers.has(tier);
      button.classList.toggle('cb-budget-loan-active', activeTiers.has(tier));
    }
    this.loans.replaceChildren();
    for (const loan of budget.loans) {
      const row = document.createElement('div');
      row.className = 'cb-budget-loan-row';
      const text = document.createElement('span');
      text.textContent = `T${loan.tier + 1} · ${money(loan.balance)} · ${loan.daysRemaining}d`;
      const repay = document.createElement('button');
      repay.textContent = 'cancelar';
      repay.disabled = city.treasury < loan.balance;
      repay.addEventListener('click', () => this.sim.act({ kind: 'repayLoan', id: loan.id }));
      row.append(text, repay);
      this.loans.appendChild(row);
    }

    const currentDay = budget.history.length > 0 ? budget.history[budget.history.length - 1].day + 1 : 0;
    const points = [...budget.history, { day: currentDay, treasury: city.treasury }].slice(-30);
    const min = Math.min(...points.map((point) => point.treasury), 0);
    const max = Math.max(...points.map((point) => point.treasury), 1);
    const span = Math.max(1, max - min);
    const width = Math.max(1, points.length - 1);
    this.spark.setAttribute('stroke', city.bankrupt ? ALERT : city.debt > 0 ? WARN : css(PALETTE.grass));
    this.spark.setAttribute('points', points.map((point, index) => `${(index / width) * 260},${44 - ((point.treasury - min) / span) * 40}`).join(' '));
  }

  private value(parent: HTMLElement, label: string): HTMLSpanElement {
    const row = document.createElement('div');
    row.className = 'cb-budget-value';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('span');
    value.textContent = '—';
    row.append(name, value);
    parent.appendChild(row);
    return value;
  }

  private section(label: string): void {
    const heading = document.createElement('div');
    heading.className = 'cb-budget-section';
    heading.textContent = label;
    this.panel.appendChild(heading);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.panel.style.display = open ? 'block' : 'none';
    this.toggle.classList.toggle('cb-budget-toggle-active', open);
    if (open) this.update(this.sim.city);
  }

  private injectStyle(): void {
    if (document.getElementById('city-bill-budget-style')) return;
    const style = document.createElement('style');
    style.id = 'city-bill-budget-style';
    style.textContent = `
.cb-budget-root{position:fixed;right:12px;top:12px;z-index:22;color:${INK};font:11px/1.25 ui-monospace,monospace;user-select:none}
.cb-budget-toggle,.cb-budget-panel{background:${PANEL_BG};border:${PANEL_BORDER};box-shadow:${PANEL_SHADOW};border-radius:9px}
.cb-budget-toggle{cursor:pointer;padding:6px 10px;color:${INK};font:10px ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;opacity:.78}
.cb-budget-toggle:hover,.cb-budget-toggle-active{opacity:1;background:${rgba(PALETTE.houseWall,.98)}}
.cb-budget-panel{width:286px;margin-top:6px;padding:10px;box-sizing:border-box;max-height:calc(100vh - 70px);overflow:auto}
.cb-budget-header{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.cb-budget-close{cursor:pointer;border:0;background:transparent;color:${INK};font-size:17px;line-height:1;padding:0 2px;opacity:.6}
.cb-budget-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
.cb-budget-value{display:flex;flex-direction:column;gap:2px;padding:5px 7px;border-radius:7px;background:${rgba(PALETTE.treeBlob,.045)}}
.cb-budget-value span:first-child{font-size:9px;opacity:.55;text-transform:uppercase}.cb-budget-value span:last-child{font-weight:700}
.cb-budget-flow{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
.cb-budget-section{margin:11px 0 5px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;opacity:.5;font-weight:700}
.cb-budget-tax{display:grid;grid-template-columns:82px 1fr 34px;align-items:center;gap:7px;height:24px}
.cb-budget-tax input{width:100%;accent-color:${css(PALETTE.grass)};cursor:pointer}.cb-budget-tax-value{text-align:right;font-weight:700}
.cb-budget-loan-options{display:flex;gap:5px}.cb-budget-loan{flex:1;cursor:pointer;padding:5px 2px;color:${INK};font:10px ui-monospace,monospace;background:transparent;border:1px solid ${rgba(PALETTE.treeBlob,.18)};border-radius:6px}
.cb-budget-policy-options{display:flex;gap:5px}.cb-budget-policy-options .cb-budget-loan{text-transform:uppercase}
.cb-budget-loan:hover:not(:disabled){background:${rgba(PALETTE.grass,.16)}}.cb-budget-loan:disabled{cursor:default;opacity:.42}.cb-budget-loan-active{border-color:${WARN}}
.cb-budget-loans{display:grid;gap:3px;margin-top:5px}.cb-budget-loan-row{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:10px}
.cb-budget-loan-row button{cursor:pointer;padding:2px 5px;color:${INK};font:9px ui-monospace,monospace;background:transparent;border:1px solid ${rgba(PALETTE.treeBlob,.17)};border-radius:5px}.cb-budget-loan-row button:disabled{opacity:.4;cursor:default}
.cb-budget-breakdown{display:grid;grid-template-columns:1fr auto;gap:3px 8px;font-size:10px}.cb-budget-breakdown span:nth-child(odd){opacity:.62}.cb-budget-breakdown span:nth-child(even){text-align:right}
.cb-budget-spark{display:block;width:100%;height:48px;margin-top:2px;border-radius:6px;background:${rgba(PALETTE.treeBlob,.045)};overflow:visible}
`;
    document.head.appendChild(style);
  }
}
