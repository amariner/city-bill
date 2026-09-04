/** Panel compacto de gobierno de barrios (H5.5). No contiene reglas: solo
 * traduce clics a PlayerAction y refleja el último CityStats recibido. */
import { PALETTE } from '../palette';
import { DistrictPolicy, DistrictPolicyState } from '../sim/protocol';
import { SimClient } from '../sim/client';
import { ToolState } from '../core/tools';
import { css, INK, PANEL_BG, PANEL_BORDER, PANEL_SHADOW, rgba } from './theme';

const STYLE_ID = 'city-bill-district-panel-style';

export class DistrictPanel {
  private readonly root: HTMLDivElement;
  private readonly districtButtons: HTMLButtonElement[] = [];
  private readonly policyButtons = new Map<Exclude<DistrictPolicy, 'taxDelta'>, HTMLButtonElement>();
  private readonly taxButtons = new Map<number, HTMLButtonElement>();
  private selectedDistrict = 1;
  private open = false;
  private last = '';

  constructor(private sim: SimClient, private tools: ToolState) {
    this.injectStyle();
    this.root = document.createElement('div');
    this.root.className = 'cb-district-panel';
    this.root.style.display = 'none';

    const title = document.createElement('div');
    title.className = 'cb-district-title';
    title.textContent = 'distritos · gobierno local';
    this.root.appendChild(title);

    const districts = document.createElement('div');
    districts.className = 'cb-district-row';
    for (let i = 1; i <= 4; i++) {
      const button = document.createElement('button');
      button.className = 'cb-district-choice';
      button.textContent = `D${i}`;
      button.title = `Seleccionar distrito ${i} y pintar con clic-arrastre`;
      button.addEventListener('click', () => {
        this.selectedDistrict = i;
        this.tools.set({ kind: 'district', district: i, from: null, erase: false });
        this.update();
      });
      districts.appendChild(button);
      this.districtButtons.push(button);
    }
    this.root.appendChild(districts);

    const policyTitle = document.createElement('div');
    policyTitle.className = 'cb-district-subtitle';
    policyTitle.textContent = 'políticas del distrito seleccionado';
    this.root.appendChild(policyTitle);
    for (const [policy, label] of [
      ['noIndustry', 'sin industria'],
      ['parksPriority', 'parques primero'],
      ['speed30', 'velocidad 30'],
    ] as Array<[Exclude<DistrictPolicy, 'taxDelta'>, string]>) {
      const button = document.createElement('button');
      button.className = 'cb-district-policy';
      button.addEventListener('click', () => {
        const state = this.policyState();
        this.sim.act({ kind: 'district', op: 'policy', district: this.selectedDistrict, policy, value: !state[policy] });
      });
      button.textContent = label;
      this.root.appendChild(button);
      this.policyButtons.set(policy, button);
    }

    const taxTitle = document.createElement('div');
    taxTitle.className = 'cb-district-subtitle';
    taxTitle.textContent = 'ajuste fiscal del barrio';
    this.root.appendChild(taxTitle);
    const taxRow = document.createElement('div');
    taxRow.className = 'cb-district-row';
    for (const delta of [-0.1, 0, 0.1]) {
      const button = document.createElement('button');
      button.className = 'cb-district-choice cb-tax-choice';
      button.textContent = `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`;
      button.addEventListener('click', () => {
        this.sim.act({ kind: 'district', op: 'policy', district: this.selectedDistrict, policy: 'taxDelta', value: delta });
      });
      taxRow.appendChild(button);
      this.taxButtons.set(delta, button);
    }
    this.root.appendChild(taxRow);

    const help = document.createElement('div');
    help.className = 'cb-district-help';
    help.textContent = 'D · pintar · Shift borra';
    this.root.appendChild(help);
    document.body.appendChild(this.root);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.style.display = open ? 'block' : 'none';
    if (open) this.update();
  }

  update(): void {
    if (!this.open) return;
    const policy = this.policyState();
    const sig = `${this.selectedDistrict}|${policy.taxDelta}|${policy.noIndustry}|${policy.parksPriority}|${policy.speed30}|${this.sim.city?.districts ?? 0}`;
    if (sig === this.last) return;
    this.last = sig;
    for (let i = 0; i < this.districtButtons.length; i++) {
      this.districtButtons[i].classList.toggle('cb-district-selected', i + 1 === this.selectedDistrict);
    }
    for (const [key, button] of this.policyButtons) {
      const active = policy[key];
      button.classList.toggle('cb-district-policy-on', active);
      button.textContent = `${active ? '✓ ' : ''}${policyLabel(key)}`;
    }
    for (const [delta, button] of this.taxButtons) button.classList.toggle('cb-district-selected', Math.abs(policy.taxDelta - delta) < 1e-6);
  }

  private policyState(): DistrictPolicyState {
    return this.sim.city?.districtPolicies.find(([district]) => district === this.selectedDistrict)?.[1]
      ?? { taxDelta: 0, noIndustry: false, parksPriority: false, speed30: false };
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.cb-district-panel{position:fixed;right:14px;top:86px;z-index:13;width:190px;padding:10px;border-radius:10px;
  color:${INK};font:11px/1.25 ui-monospace,monospace;background:${PANEL_BG};border:${PANEL_BORDER};box-shadow:${PANEL_SHADOW};user-select:none}
.cb-district-title{font-size:10px;letter-spacing:.07em;text-transform:uppercase;opacity:.7;margin-bottom:7px}
.cb-district-subtitle{font-size:9px;letter-spacing:.04em;text-transform:uppercase;opacity:.55;margin:8px 0 4px}
.cb-district-row{display:flex;gap:4px}
.cb-district-choice,.cb-district-policy{cursor:pointer;color:${INK};font:600 10px/1.2 ui-monospace,monospace;background:${rgba(PALETTE.houseWall, .52)};
  border:1px solid ${rgba(PALETTE.treeBlob, .18)};border-radius:6px;padding:5px 6px}
.cb-district-choice{flex:1}.cb-tax-choice{padding:5px 4px}
.cb-district-policy{display:block;width:100%;text-align:left;margin:3px 0}
.cb-district-choice:hover,.cb-district-policy:hover{background:${rgba(PALETTE.houseWall, .85)}}
.cb-district-selected{background:${rgba(PALETTE.grass, .65)}!important;border-color:${css(PALETTE.ghostOk)}!important}
.cb-district-policy-on{background:${rgba(PALETTE.zoneP, .6)};border-color:${css(PALETTE.selectRing)}}
.cb-district-help{font-size:9px;opacity:.52;margin-top:8px}
`;
    document.head.appendChild(style);
  }
}

function policyLabel(policy: Exclude<DistrictPolicy, 'taxDelta'>): string {
  if (policy === 'noIndustry') return 'sin industria';
  if (policy === 'parksPriority') return 'parques primero';
  return 'velocidad 30';
}

