/** Toolbar mínima del jugador: selecciona herramientas, no contiene lógica de sim. */
import { PALETTE } from '../palette';
import { SimClient } from '../sim/client';
import type { CatalogItemData } from '../world/catalogData';
import { BUILD_CATEGORIES, type BuildCategory, buildCategory, playerCatalog, buildAvailability, buildingBenefit, money } from './buildCatalog';
import { ToolState } from '../core/tools';
import { ignoreGameKey } from '../core/keyboard';
import { ROAD_SPECS } from '../world/roads';
import type { RoadKind, ZoneKind } from '../sim/protocol';
import { css, INK, PANEL_BG, PANEL_BORDER, PANEL_SHADOW, rgba } from './theme';

const STYLE_ID = 'city-bill-toolbar-style';

const ROAD_TIERS: Record<RoadKind, number> = { path: 0, rural: 1, street: 2, avenue: 3 };
const ROAD_LABELS: Record<RoadKind, string> = { path: 'sendero', rural: 'vía rural', street: 'calle', avenue: 'avenida' };
const ZONE_LABELS: Record<ZoneKind, string> = { R: 'residencial', C: 'comercial', I: 'industrial', A: 'agrícola', P: 'parque' };
const DEMAND_KEYS = ['R', 'C', 'I'] as const;
type DemandKey = (typeof DEMAND_KEYS)[number];
const DEMAND_COLORS: Record<DemandKey, number> = { R: PALETTE.zoneR, C: PALETTE.zoneC, I: PALETTE.zoneI };

export class Toolbar {
  private root: HTMLDivElement;
  private buildButton: HTMLButtonElement;
  private roadButton: HTMLButtonElement;
  private zoneButton: HTMLButtonElement;
  private bulldozeButton: HTMLButtonElement;
  private busButton: HTMLButtonElement;
  private districtButton: HTMLButtonElement;
  private menu: HTMLDivElement;
  private roadMenu: HTMLDivElement;
  private zoneMenu: HTMLDivElement;
  private hint: HTMLSpanElement;
  private demandBars: Record<DemandKey, { fill: HTMLDivElement; value: HTMLSpanElement }>;
  private menuOpen = false;
  private roadMenuOpen = false;
  private zoneMenuOpen = false;
  private catalogSignature = '';
  private roadSignature = '';
  private roadCost: number | null = null;
  private category: BuildCategory = 'services';
  private catalogCards = new Map<string, { item: CatalogItemData; button: HTMLButtonElement; status: HTMLSpanElement }>();
  private catalogMoneySignature = '';

  constructor(private sim: SimClient, private tools: ToolState) {
    this.injectStyle();
    this.root = document.createElement('div');
    this.root.className = 'cb-toolbar';

    const row = document.createElement('div');
    row.className = 'cb-toolbar-row';
    this.buildButton = this.actionButton('⌂ construir', 'B · elegir edificio', () => this.toggleMenu());
    this.roadButton = this.actionButton('═ carretera', 'R · elegir vía', () => this.toggleRoadMenu());
    this.zoneButton = this.actionButton('▦ zonas', 'Z · elegir zona', () => this.toggleZoneMenu());
    this.bulldozeButton = this.actionButton('× demoler', 'X · demoler edificio', () => {
      this.menuOpen = false;
      this.menu.style.display = 'none';
      this.roadMenuOpen = false;
      this.roadMenu.style.display = 'none';
      this.zoneMenuOpen = false;
      this.zoneMenu.style.display = 'none';
      this.tools.set({ kind: 'bulldoze' });
      this.update();
    });
    this.busButton = this.actionButton('↝ buses', 'L · dibujar línea de bus', () => {
      this.menuOpen = false;
      this.menu.style.display = 'none';
      this.roadMenuOpen = false;
      this.roadMenu.style.display = 'none';
      this.zoneMenuOpen = false;
      this.zoneMenu.style.display = 'none';
      this.tools.set({ kind: 'busLine', stops: [] });
      this.update();
    });
    this.districtButton = this.actionButton('▤ distritos', 'U · pintar y gobernar distritos', () => {
      this.menuOpen = false;
      this.menu.style.display = 'none';
      this.roadMenuOpen = false;
      this.roadMenu.style.display = 'none';
      this.zoneMenuOpen = false;
      this.zoneMenu.style.display = 'none';
      this.tools.set({ kind: 'district', district: 1, from: null, erase: false });
      this.update();
    });
    row.append(this.buildButton, this.roadButton, this.zoneButton, this.bulldozeButton, this.busButton, this.districtButton);
    this.root.appendChild(row);

    const demand = document.createElement('div');
    demand.className = 'cb-demand';
    const demandTitle = document.createElement('div');
    demandTitle.className = 'cb-demand-title';
    demandTitle.textContent = 'demanda';
    demand.appendChild(demandTitle);
    this.demandBars = {} as Record<DemandKey, { fill: HTMLDivElement; value: HTMLSpanElement }>;
    for (const key of DEMAND_KEYS) {
      const line = document.createElement('div');
      line.className = 'cb-demand-row';
      const label = document.createElement('span');
      label.className = 'cb-demand-label';
      label.textContent = key;
      const track = document.createElement('div');
      track.className = 'cb-demand-track';
      const fill = document.createElement('div');
      fill.className = 'cb-demand-fill';
      fill.style.background = rgba(DEMAND_COLORS[key], 0.9);
      track.appendChild(fill);
      const value = document.createElement('span');
      value.className = 'cb-demand-value';
      value.textContent = '0%';
      line.append(label, track, value);
      demand.appendChild(line);
      this.demandBars[key] = { fill, value };
    }
    this.root.appendChild(demand);

    this.menu = document.createElement('div');
    this.menu.className = 'cb-toolbar-menu cb-build-menu';
    this.menu.setAttribute('aria-label', 'Catálogo de construcción');
    this.menu.style.display = 'none';
    this.root.appendChild(this.menu);

    this.roadMenu = document.createElement('div');
    this.roadMenu.className = 'cb-toolbar-menu cb-road-menu';
    this.roadMenu.style.display = 'none';
    this.root.appendChild(this.roadMenu);

    this.zoneMenu = document.createElement('div');
    this.zoneMenu.className = 'cb-toolbar-menu cb-zone-menu';
    this.zoneMenu.style.display = 'none';
    this.root.appendChild(this.zoneMenu);

    const footer = document.createElement('div');
    footer.className = 'cb-toolbar-footer';
    this.hint = document.createElement('span');
    footer.appendChild(this.hint);
    this.root.appendChild(footer);
    document.body.appendChild(this.root);
    this.rebuildZoneMenu();
    tools.onMenuRequest = (menu) => {
      if (menu === 'build') this.toggleMenu();
      else if (menu === 'road') this.toggleRoadMenu();
      else this.toggleZoneMenu();
    };
    window.addEventListener('keydown', (event) => {
      if (ignoreGameKey(event) || event.key !== 'Escape') return;
      this.menuOpen = this.roadMenuOpen = this.zoneMenuOpen = false;
      this.menu.style.display = this.roadMenu.style.display = this.zoneMenu.style.display = 'none';
    });
    this.update();
  }

  /** Actualiza desbloqueos y estado activo; la firma evita reconstruir el menú cada frame. */
  update(): void {
    const tier = this.sim.city?.tier ?? 1;
    const available = playerCatalog();
    const roads = (Object.keys(ROAD_SPECS) as RoadKind[]).filter((road) => ROAD_TIERS[road] <= tier);
    const signature = this.category;
    if (signature !== this.catalogSignature) {
      this.catalogSignature = signature;
      this.rebuildMenu(playerCatalog(this.category));
    }
    this.updateCatalogAvailability();
    const roadSignature = `${tier}:${roads.join(',')}:rail=${tier >= 4}`;
    if (roadSignature !== this.roadSignature) {
      this.roadSignature = roadSignature;
      this.rebuildRoadMenu(roads);
    }

    const demand = this.sim.city?.demand;
    for (const key of DEMAND_KEYS) {
      const value = demand?.[key] ?? 0;
      const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
      this.demandBars[key].fill.style.width = `${pct}%`;
      this.demandBars[key].value.textContent = `${pct}%`;
    }

    const active = this.tools.active;
    this.buildButton.classList.toggle('cb-tool-active', active.kind === 'place');
    this.roadButton.classList.toggle('cb-tool-active', active.kind === 'road' || active.kind === 'rail');
    this.zoneButton.classList.toggle('cb-tool-active', active.kind === 'zone');
    this.bulldozeButton.classList.toggle('cb-tool-active', active.kind === 'bulldoze');
    this.busButton.classList.toggle('cb-tool-active', active.kind === 'busLine');
    this.districtButton.classList.toggle('cb-tool-active', active.kind === 'district');
    this.hint.textContent = active.kind === 'place'
      ? `${available.find((item) => item.id === active.id)?.name ?? active.id} · Tab gira · Esc cancela`
      : active.kind === 'road'
        ? `${ROAD_LABELS[active.road]} · ${active.from ? 'elige destino' : 'clic y arrastra'}${this.roadCost !== null && active.from ? ` · coste ${this.roadCost}` : ''} · Esc cancela`
        : active.kind === 'rail'
          ? `ferrocarril · ${active.from ? 'elige destino' : 'clic y arrastra'} · circuito cerrado + estación para activar el tren · Esc cancela`
        : active.kind === 'zone'
          ? `${ZONE_LABELS[active.zone]} · ${active.erase ? 'Shift: borrar' : 'clic y arrastra'} · Esc cancela`
        : active.kind === 'busLine'
          ? `bus · ${active.stops.length} parada${active.stops.length === 1 ? '' : 's'} · Enter cierra · clic derecho deshace · Esc cancela`
        : active.kind === 'district'
          ? `D${active.district} · ${active.erase ? 'borrar' : 'pintar'} · clic y arrastra · Esc cancela`
        : active.kind === 'bulldoze' ? 'demoler · Esc cancela' : 'B construir · R vías · X demoler';
  }

  private rebuildMenu(items: CatalogItemData[]): void {
    this.menu.replaceChildren();
    this.catalogCards.clear();
    this.catalogMoneySignature = '';
    const title = document.createElement('div');
    title.className = 'cb-toolbar-title';
    title.textContent = 'Construir en tu ciudad';
    this.menu.appendChild(title);
    const categories = document.createElement('div');
    categories.className = 'cb-build-categories';
    for (const [category, label] of BUILD_CATEGORIES) {
      const tab = document.createElement('button');
      tab.textContent = label;
      tab.setAttribute('aria-pressed', String(category === this.category));
      tab.onclick = () => {
        this.category = category;
        this.update();
        this.menu.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
      };
      categories.appendChild(tab);
    }
    this.menu.appendChild(categories);
    const cards = document.createElement('div');
    cards.className = 'cb-build-cards';
    this.menu.appendChild(cards);
    for (const item of items) {
      const button = document.createElement('button');
      button.className = 'cb-building-option cb-build-card';
      button.title = `${item.name} · ${item.w * 2}×${item.d * 2} m`;
      const name = document.createElement('strong');
      name.textContent = item.name;
      const cost = document.createElement('span');
      cost.className = 'cb-build-cost';
      cost.textContent = money(item.cost ?? 0);
      const upkeep = document.createElement('span');
      upkeep.textContent = `${money(item.upkeepPerDay ?? 0)} / día de mantenimiento`;
      const benefit = document.createElement('span');
      benefit.textContent = buildingBenefit(item);
      const status = document.createElement('span');
      status.className = 'cb-build-status';
      button.append(name, cost, upkeep, benefit, status);
      this.catalogCards.set(item.id, { item, button, status });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.tools.set({ kind: 'place', id: item.id, rot: 0 });
        this.menuOpen = false;
        this.menu.style.display = 'none';
        this.update();
      });
      cards.appendChild(button);
    }
  }

  private updateCatalogAvailability(): void {
    const city = this.sim.city;
    const signature = `${city?.tier}|${Math.floor(city?.treasury ?? 0)}|${city?.bankrupt}`;
    if (signature === this.catalogMoneySignature) return;
    this.catalogMoneySignature = signature;
    for (const { item, button, status } of this.catalogCards.values()) {
      const reason = city ? buildAvailability(item, city.tier, city.treasury, city.bankrupt) : 'Cargando presupuesto…';
      button.disabled = reason !== null;
      status.textContent = reason ?? 'Seleccionar ubicación →';
    }
  }

  private rebuildRoadMenu(roads: RoadKind[]): void {
    this.roadMenu.replaceChildren();
    const title = document.createElement('div');
    title.className = 'cb-toolbar-title';
    title.textContent = 'vías disponibles';
    this.roadMenu.appendChild(title);
    for (const road of roads) {
      const button = document.createElement('button');
      button.className = 'cb-building-option cb-road-option';
      button.textContent = `${ROAD_LABELS[road]} · ${ROAD_SPECS[road].costPerCell}/celda`;
      button.title = `${ROAD_LABELS[road]} · capacidad ${ROAD_SPECS[road].capacity}`;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.tools.set({ kind: 'road', road, from: null });
        this.roadMenuOpen = false;
        this.roadMenu.style.display = 'none';
        this.update();
      });
      this.roadMenu.appendChild(button);
    }
    if ((this.sim.city?.tier ?? 1) >= 4) {
      const rail = document.createElement('button');
      rail.className = 'cb-building-option cb-road-option';
      rail.textContent = 'ferrocarril · circuito cerrado';
      rail.title = 'Traza una vía ferroviaria; una estación activa el tren';
      rail.addEventListener('click', (event) => {
        event.stopPropagation();
        this.tools.set({ kind: 'rail', from: null });
        this.roadMenuOpen = false;
        this.roadMenu.style.display = 'none';
        this.update();
      });
      this.roadMenu.appendChild(rail);
    }
  }

  private rebuildZoneMenu(): void {
    this.zoneMenu.replaceChildren();
    const title = document.createElement('div');
    title.className = 'cb-toolbar-title';
    title.textContent = 'zonas disponibles';
    this.zoneMenu.appendChild(title);
    for (const zone of ['R', 'C', 'I', 'A', 'P'] as ZoneKind[]) {
      const button = document.createElement('button');
      button.className = 'cb-building-option cb-zone-option';
      button.textContent = `${zone} · ${ZONE_LABELS[zone]}`;
      button.title = 'Arrastra para pintar · mantén Shift para borrar';
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.tools.set({ kind: 'zone', zone, from: null, erase: false });
        this.zoneMenuOpen = false;
        this.zoneMenu.style.display = 'none';
        this.update();
      });
      this.zoneMenu.appendChild(button);
    }
  }

  /** Abre la ficha recomendada sin gastar dinero ni colocar todavía. */
  showBuilding(itemId: string): void {
    const item = playerCatalog().find((entry) => entry.id === itemId);
    if (!item) return;
    this.category = buildCategory(item);
    this.menuOpen = false;
    this.toggleMenu();
    const card = this.catalogCards.get(itemId)?.button;
    card?.scrollIntoView({ block: 'nearest' });
    card?.focus({ preventScroll: true });
  }

  /** Recibe el coste calculado por el mismo preview que usará el worker. */
  setRoadCost(cost: number | null): void {
    if (this.roadCost === cost) return;
    this.roadCost = cost;
    this.update();
  }

  private toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    this.menu.style.display = this.menuOpen ? 'flex' : 'none';
    this.roadMenuOpen = false;
    this.roadMenu.style.display = 'none';
    this.zoneMenuOpen = false;
    this.zoneMenu.style.display = 'none';
    if (this.menuOpen && this.tools.active.kind === 'place') this.tools.cancel();
    if (this.menuOpen && (this.tools.active.kind === 'road' || this.tools.active.kind === 'rail')) this.tools.cancel();
    if (this.menuOpen && this.tools.active.kind === 'zone') this.tools.cancel();
    if (this.menuOpen && this.tools.active.kind === 'busLine') this.tools.cancel();
    if (this.menuOpen && this.tools.active.kind === 'district') this.tools.cancel();
    this.update();
  }

  private toggleRoadMenu(): void {
    this.roadMenuOpen = !this.roadMenuOpen;
    this.roadMenu.style.display = this.roadMenuOpen ? 'grid' : 'none';
    this.menuOpen = false;
    this.menu.style.display = 'none';
    this.zoneMenuOpen = false;
    this.zoneMenu.style.display = 'none';
    if (this.roadMenuOpen && (this.tools.active.kind === 'place' || this.tools.active.kind === 'road' || this.tools.active.kind === 'rail')) this.tools.cancel();
    if (this.roadMenuOpen && this.tools.active.kind === 'zone') this.tools.cancel();
    if (this.roadMenuOpen && this.tools.active.kind === 'busLine') this.tools.cancel();
    if (this.roadMenuOpen && this.tools.active.kind === 'district') this.tools.cancel();
    this.update();
  }

  private toggleZoneMenu(): void {
    this.zoneMenuOpen = !this.zoneMenuOpen;
    this.zoneMenu.style.display = this.zoneMenuOpen ? 'grid' : 'none';
    this.menuOpen = false;
    this.menu.style.display = 'none';
    this.roadMenuOpen = false;
    this.roadMenu.style.display = 'none';
    if (this.zoneMenuOpen && (this.tools.active.kind === 'place' || this.tools.active.kind === 'road' || this.tools.active.kind === 'rail' || this.tools.active.kind === 'zone' || this.tools.active.kind === 'busLine' || this.tools.active.kind === 'district')) this.tools.cancel();
    this.update();
  }

  private actionButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'cb-tool-button';
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.cb-toolbar{position:fixed;left:50%;bottom:12px;z-index:12;transform:translateX(-50%);
  display:flex;flex-direction:column;align-items:center;gap:5px;min-width:280px;width:max-content;max-width:calc(100vw - 24px);
  color:${INK};font:12px/1.2 ui-monospace,monospace;user-select:none}
.cb-toolbar-row{display:flex;width:100%;box-sizing:border-box;gap:5px;padding:5px;border-radius:11px;
  background:${PANEL_BG};border:${PANEL_BORDER};box-shadow:${PANEL_SHADOW}}
.cb-tool-button,.cb-building-option{cursor:pointer;color:${INK};font:600 12px/1.2 ui-monospace,monospace;
  background:${rgba(PALETTE.houseWall, 0.55)};border:1px solid ${rgba(PALETTE.treeBlob, 0.2)};
  border-radius:7px;transition:background .15s ease,border-color .15s ease,transform .08s ease}
.cb-tool-button{min-width:105px;padding:7px 9px}
.cb-tool-button:hover,.cb-building-option:hover{background:${rgba(PALETTE.houseWall, 0.85)}}
.cb-tool-button:active,.cb-building-option:active{transform:translateY(1px)}
.cb-tool-button.cb-tool-active{background:${rgba(PALETTE.grass, 0.62)};border-color:${css(PALETTE.ghostOk)};
  box-shadow:inset 0 -2px 0 ${css(PALETTE.ghostOk)}}
.cb-toolbar-menu{order:-1;grid-template-columns:repeat(2,minmax(135px,1fr));gap:4px;padding:7px;
  max-height:250px;overflow:auto;border-radius:10px;background:${PANEL_BG};border:${PANEL_BORDER};box-shadow:${PANEL_SHADOW}}
.cb-toolbar-title{grid-column:1/-1;font-size:9px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;padding:1px 3px 3px}
.cb-building-option{padding:6px 7px;text-align:left;font-size:10px;white-space:nowrap}
.cb-build-menu{display:flex;flex-direction:column;width:420px;max-width:calc(100vw - 40px);max-height:none;box-sizing:border-box;gap:10px;padding:14px}
.cb-build-menu .cb-toolbar-title{font:600 14px/1.3 system-ui,sans-serif;opacity:1;letter-spacing:0;text-transform:none}
.cb-build-categories{display:flex;gap:4px;flex-wrap:wrap}
.cb-build-categories button{flex:1;padding:7px 8px;font:12px system-ui,sans-serif;border:${PANEL_BORDER};border-radius:6px;background:transparent;color:${INK};cursor:pointer}
.cb-build-categories button[aria-pressed=true]{background:${rgba(PALETTE.grass,0.45)};font-weight:600}
.cb-build-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:min(330px,40vh);overflow-y:auto}
.cb-build-card{display:flex;flex-direction:column;gap:5px;padding:12px;white-space:normal;font:11px/1.35 system-ui,sans-serif}
.cb-build-card strong{font-size:13px}.cb-build-cost{font-size:16px;font-weight:650}
.cb-build-status{margin-top:auto;padding-top:5px;font-size:11px;font-weight:600;color:${css(PALETTE.treeBlob)}}
.cb-build-card:disabled{cursor:default;background:${rgba(PALETTE.houseWall,0.35)}}
.cb-build-card:disabled .cb-build-status{color:${css(PALETTE.signRed)}}
.cb-building-option:focus-visible,.cb-tool-button:focus-visible,.cb-build-categories button:focus-visible{outline:2px solid ${css(PALETTE.selectRing)};outline-offset:2px}
.cb-toolbar-footer{padding:3px 9px;border-radius:7px;background:${rgba(PALETTE.houseWall, 0.82)};
  border:1px solid ${rgba(PALETTE.treeBlob, 0.12)};font-size:10px;opacity:.82}
.cb-demand{width:100%;box-sizing:border-box;padding:5px 9px 6px;border-radius:8px;background:${rgba(PALETTE.houseWall, 0.82)};
  border:1px solid ${rgba(PALETTE.treeBlob, 0.12)};font-size:10px}
.cb-demand-title{font-size:9px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;margin-bottom:3px}
.cb-demand-row{display:grid;grid-template-columns:12px 1fr 28px;align-items:center;gap:5px;height:9px}
.cb-demand-label{font-weight:700;opacity:.75}
.cb-demand-track{height:4px;overflow:hidden;border-radius:3px;background:${rgba(PALETTE.treeBlob, 0.1)}}
.cb-demand-fill{height:100%;width:0;border-radius:3px;transition:width .2s ease}
.cb-demand-value{text-align:right;font-size:9px;opacity:.7}
@media(max-width:560px){.cb-toolbar{width:calc(100vw - 24px);min-width:0}.cb-tool-button{min-width:0;padding:7px 5px;font-size:10px}.cb-toolbar-menu{grid-template-columns:1fr 1fr}}
`;
    document.head.appendChild(style);
  }
}
