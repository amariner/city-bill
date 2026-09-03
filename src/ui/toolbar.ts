/** Toolbar mínima del jugador: selecciona herramientas, no contiene lógica de sim. */
import { PALETTE } from '../palette';
import { SimClient } from '../sim/client';
import { CATALOG_ITEMS, CatalogItem } from '../world/catalog';
import { ToolState } from '../core/tools';
import { ROAD_SPECS } from '../world/roads';
import type { RoadKind, ZoneKind } from '../sim/protocol';
import { css, INK, PANEL_BG, PANEL_BORDER, PANEL_SHADOW, rgba } from './theme';

const STYLE_ID = 'city-bill-toolbar-style';

/** Naturaleza e infraestructura se reservan a la simulación / futuras herramientas. */
function playerPlaceable(item: CatalogItem): boolean {
  return item.role !== 'nature' && item.role !== 'infra';
}

const ROAD_TIERS: Record<RoadKind, number> = { path: 0, rural: 1, street: 2, avenue: 3 };
const ROAD_LABELS: Record<RoadKind, string> = { path: 'sendero', rural: 'vía rural', street: 'calle', avenue: 'avenida' };
const ZONE_LABELS: Record<ZoneKind, string> = { R: 'residencial', C: 'comercial', I: 'industrial', A: 'agrícola', P: 'parque' };

export class Toolbar {
  private root: HTMLDivElement;
  private buildButton: HTMLButtonElement;
  private roadButton: HTMLButtonElement;
  private zoneButton: HTMLButtonElement;
  private bulldozeButton: HTMLButtonElement;
  private menu: HTMLDivElement;
  private roadMenu: HTMLDivElement;
  private zoneMenu: HTMLDivElement;
  private hint: HTMLSpanElement;
  private menuOpen = false;
  private roadMenuOpen = false;
  private zoneMenuOpen = false;
  private catalogSignature = '';
  private roadSignature = '';
  private roadCost: number | null = null;

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
    row.append(this.buildButton, this.roadButton, this.zoneButton, this.bulldozeButton);
    this.root.appendChild(row);

    this.menu = document.createElement('div');
    this.menu.className = 'cb-toolbar-menu';
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
    this.update();
  }

  /** Actualiza desbloqueos y estado activo; la firma evita reconstruir el menú cada frame. */
  update(): void {
    const tier = this.sim.city?.tier ?? 1;
    const available = CATALOG_ITEMS.filter((item) => playerPlaceable(item) && item.tier <= tier);
    const roads = (Object.keys(ROAD_SPECS) as RoadKind[]).filter((road) => ROAD_TIERS[road] <= tier);
    const signature = `${tier}:${available.map((item) => item.id).join(',')}`;
    if (signature !== this.catalogSignature) {
      this.catalogSignature = signature;
      this.rebuildMenu(available);
    }
    const roadSignature = `${tier}:${roads.join(',')}`;
    if (roadSignature !== this.roadSignature) {
      this.roadSignature = roadSignature;
      this.rebuildRoadMenu(roads);
    }

    const active = this.tools.active;
    this.buildButton.classList.toggle('cb-tool-active', active.kind === 'place');
    this.roadButton.classList.toggle('cb-tool-active', active.kind === 'road');
    this.zoneButton.classList.toggle('cb-tool-active', active.kind === 'zone');
    this.bulldozeButton.classList.toggle('cb-tool-active', active.kind === 'bulldoze');
    this.hint.textContent = active.kind === 'place'
      ? `${available.find((item) => item.id === active.id)?.name ?? active.id} · Tab gira · Esc cancela`
      : active.kind === 'road'
        ? `${ROAD_LABELS[active.road]} · ${active.from ? 'elige destino' : 'clic y arrastra'}${this.roadCost !== null && active.from ? ` · coste ${this.roadCost}` : ''} · Esc cancela`
        : active.kind === 'zone'
          ? `${ZONE_LABELS[active.zone]} · ${active.erase ? 'Shift: borrar' : 'clic y arrastra'} · Esc cancela`
        : active.kind === 'bulldoze' ? 'demoler · Esc cancela' : 'B construir · R vías · X demoler';
  }

  private rebuildMenu(items: CatalogItem[]): void {
    this.menu.replaceChildren();
    const title = document.createElement('div');
    title.className = 'cb-toolbar-title';
    title.textContent = 'edificios disponibles';
    this.menu.appendChild(title);
    for (const item of items) {
      const button = document.createElement('button');
      button.className = 'cb-building-option';
      button.textContent = `${item.name} · T${item.tier}`;
      button.title = `${item.name} · ${item.w}×${item.d} celdas`;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.tools.set({ kind: 'place', id: item.id, rot: 0 });
        this.menuOpen = false;
        this.menu.style.display = 'none';
        this.update();
      });
      this.menu.appendChild(button);
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

  /** Recibe el coste calculado por el mismo preview que usará el worker. */
  setRoadCost(cost: number | null): void {
    if (this.roadCost === cost) return;
    this.roadCost = cost;
    this.update();
  }

  private toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    this.menu.style.display = this.menuOpen ? 'grid' : 'none';
    this.roadMenuOpen = false;
    this.roadMenu.style.display = 'none';
    this.zoneMenuOpen = false;
    this.zoneMenu.style.display = 'none';
    if (this.menuOpen && this.tools.active.kind === 'place') this.tools.cancel();
    if (this.menuOpen && this.tools.active.kind === 'road') this.tools.cancel();
    if (this.menuOpen && this.tools.active.kind === 'zone') this.tools.cancel();
    this.update();
  }

  private toggleRoadMenu(): void {
    this.roadMenuOpen = !this.roadMenuOpen;
    this.roadMenu.style.display = this.roadMenuOpen ? 'grid' : 'none';
    this.menuOpen = false;
    this.menu.style.display = 'none';
    this.zoneMenuOpen = false;
    this.zoneMenu.style.display = 'none';
    if (this.roadMenuOpen && (this.tools.active.kind === 'place' || this.tools.active.kind === 'road')) this.tools.cancel();
    if (this.roadMenuOpen && this.tools.active.kind === 'zone') this.tools.cancel();
    this.update();
  }

  private toggleZoneMenu(): void {
    this.zoneMenuOpen = !this.zoneMenuOpen;
    this.zoneMenu.style.display = this.zoneMenuOpen ? 'grid' : 'none';
    this.menuOpen = false;
    this.menu.style.display = 'none';
    this.roadMenuOpen = false;
    this.roadMenu.style.display = 'none';
    if (this.zoneMenuOpen && (this.tools.active.kind === 'place' || this.tools.active.kind === 'road' || this.tools.active.kind === 'zone')) this.tools.cancel();
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
  display:flex;flex-direction:column;align-items:center;gap:5px;min-width:280px;
  color:${INK};font:12px/1.2 ui-monospace,monospace;user-select:none}
.cb-toolbar-row{display:flex;gap:5px;padding:5px;border-radius:11px;
  background:${PANEL_BG};border:${PANEL_BORDER};box-shadow:${PANEL_SHADOW}}
.cb-tool-button,.cb-building-option{cursor:pointer;color:${INK};font:600 12px/1.2 ui-monospace,monospace;
  background:${rgba(PALETTE.houseWall, 0.55)};border:1px solid ${rgba(PALETTE.treeBlob, 0.2)};
  border-radius:7px;transition:background .15s ease,border-color .15s ease,transform .08s ease}
.cb-tool-button{min-width:105px;padding:7px 9px}
.cb-tool-button:hover,.cb-building-option:hover{background:${rgba(PALETTE.houseWall, 0.85)}}
.cb-tool-button:active,.cb-building-option:active{transform:translateY(1px)}
.cb-tool-button.cb-tool-active{background:${rgba(PALETTE.grass, 0.62)};border-color:${css(PALETTE.ghostOk)};
  box-shadow:inset 0 -2px 0 ${css(PALETTE.ghostOk)}}
.cb-toolbar-menu{grid-template-columns:repeat(2,minmax(135px,1fr));gap:4px;padding:7px;
  max-height:250px;overflow:auto;border-radius:10px;background:${PANEL_BG};border:${PANEL_BORDER};box-shadow:${PANEL_SHADOW}}
.cb-toolbar-title{grid-column:1/-1;font-size:9px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;padding:1px 3px 3px}
.cb-building-option{padding:6px 7px;text-align:left;font-size:10px;white-space:nowrap}
.cb-toolbar-footer{padding:3px 9px;border-radius:7px;background:${rgba(PALETTE.houseWall, 0.82)};
  border:1px solid ${rgba(PALETTE.treeBlob, 0.12)};font-size:10px;opacity:.82}
@media(max-width:560px){.cb-toolbar{min-width:calc(100vw - 24px)}.cb-toolbar-menu{grid-template-columns:1fr 1fr}}
`;
    document.head.appendChild(style);
  }
}
