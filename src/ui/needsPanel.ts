import type { CityNeed, CityNeedAction } from '../sim/protocol';
import { PALETTE } from '../palette';
import { css, INK, PANEL_BG, PANEL_BORDER, PANEL_SHADOW } from './theme';

/** Solo muestra los diagnósticos del worker y abre controles; nunca construye por sí mismo. */
export class NeedsPanel {
  private root = document.createElement('details');
  private summary = document.createElement('summary');
  private content = document.createElement('div');
  private empty = document.createElement('p');
  private current: readonly CityNeed[] | null = null;
  private cards = new Map<string, {
    root: HTMLElement; title: HTMLElement; reason: HTMLElement; status: HTMLElement; button: HTMLButtonElement;
  }>();

  constructor(onAction: (action: CityNeedAction) => void) {
    this.root.className = 'cb-needs';
    this.summary.textContent = 'La ciudad necesita';
    this.content.className = 'cb-needs-content';
    this.empty.textContent = 'Sin necesidades prioritarias detectadas por ahora.';
    this.content.appendChild(this.empty);
    this.root.append(this.summary, this.content);
    this.content.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-need]');
      const need = this.current?.find((entry) => entry.id === button?.dataset.need);
      if (!need) return;
      this.root.open = false;
      onAction(need.action);
    });
    const style = document.createElement('style');
    style.textContent = `
.cb-needs{position:fixed;top:78px;left:12px;z-index:21;color:${INK};font:12px/1.45 system-ui,sans-serif}
.cb-needs summary{cursor:pointer;padding:9px 12px;background:${PANEL_BG};border:${PANEL_BORDER};border-radius:10px;box-shadow:${PANEL_SHADOW}}
.cb-needs-content{position:absolute;top:calc(100% + 8px);left:0;width:280px;max-width:calc(100vw - 50px);max-height:calc(100vh - 320px);overflow:auto;
  padding:12px;background:${css(PALETTE.houseWall)};border:${PANEL_BORDER};border-radius:12px;box-shadow:${PANEL_SHADOW}}
.cb-needs article+article{border-top:${PANEL_BORDER};margin-top:12px;padding-top:12px}
.cb-needs h3{font-size:13px;margin:0 0 5px}.cb-needs p{margin:4px 0}.cb-needs-status{font-size:11px;opacity:.75}
.cb-needs button{margin-top:7px;background:${PANEL_BG};color:${INK};border:${PANEL_BORDER};border-radius:6px;padding:6px 9px;cursor:pointer;font:inherit}
.cb-needs button:focus-visible,.cb-needs summary:focus-visible{outline:2px solid ${css(PALETTE.selectRing)};outline-offset:3px}
@media(max-width:430px){.cb-needs{top:112px}.cb-needs summary{font-size:11px;padding:9px 7px}}
`;
    document.head.appendChild(style);
    document.body.appendChild(this.root);
  }

  update(needs: readonly CityNeed[]): void {
    if (this.current === needs) return;
    this.current = needs;
    this.summary.textContent = `La ciudad necesita · ${needs.length}`;
    this.empty.hidden = needs.length > 0;
    for (const [id, card] of this.cards) {
      if (!needs.some((need) => need.id === id)) { card.root.remove(); this.cards.delete(id); }
    }
    needs.forEach((need, index) => {
      let card = this.cards.get(need.id);
      if (!card) {
        card = { root: document.createElement('article'), title: document.createElement('h3'),
          reason: document.createElement('p'), status: document.createElement('p'), button: document.createElement('button') };
        card.status.className = 'cb-needs-status';
        card.button.type = 'button';
        card.button.dataset.need = need.id;
        card.root.append(card.title, card.reason, card.status, card.button);
        this.cards.set(need.id, card);
      }
      card.title.textContent = need.title;
      card.reason.textContent = need.reason;
      card.status.textContent = need.status;
      card.button.textContent = need.actionLabel;
      const at = this.content.children[index + 1] ?? null;
      if (at !== card.root) this.content.insertBefore(card.root, at);
    });
  }
}
