/** Menú de entrada de la partida normal (H3.6). Solo decide qué arranque
 * quiere el jugador; la simulación sigue siendo la fuente de verdad. */
import { DAY_GAME_SECONDS } from '../sim/clock';
import { PALETTE } from '../palette';
import { css, INK, PANEL_BORDER, PANEL_SHADOW, rgba } from './theme';

export interface StartMenuOptions {
  seed: number;
  saveBlob: string;
  onContinue: () => void;
  onNewGame: (seed: number) => void;
  onSandbox: (seed: number) => void;
}

/** Lee el día de un save sin acoplar el menú al resto del estado de la sim. */
export function savedDay(saveBlob: string): number {
  try {
    const state = JSON.parse(saveBlob) as { clock?: { time?: unknown } };
    const time = state.clock?.time;
    return typeof time === 'number' && Number.isFinite(time)
      ? Math.max(0, Math.floor(time / DAY_GAME_SECONDS))
      : 0;
  } catch {
    return 0;
  }
}

const STYLE_ID = 'city-bill-start-menu-style';

export class StartMenu {
  readonly root: HTMLDivElement;
  private seedInput: HTMLInputElement;

  constructor(private options: StartMenuOptions) {
    this.injectStyle();
    this.root = document.createElement('div');
    this.root.className = 'sm-overlay';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'menú de partida');

    const card = document.createElement('section');
    card.className = 'sm-card';

    const mark = document.createElement('div');
    mark.className = 'sm-mark';
    mark.innerHTML = '<span class="sm-dot"></span><span>city</span><i>·</i><span>bill</span>';
    card.appendChild(mark);

    const title = document.createElement('h1');
    title.textContent = 'tu pueblo te espera';
    card.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'sm-subtitle';
    subtitle.textContent = `día ${savedDay(options.saveBlob)} · semilla ${options.seed}`;
    card.appendChild(subtitle);

    const continueButton = this.button('continuar partida', 'sm-primary', () => {
      this.options.onContinue();
      this.remove();
    });
    continueButton.setAttribute('data-action', 'continue');
    card.appendChild(continueButton);

    const divider = document.createElement('div');
    divider.className = 'sm-divider';
    divider.textContent = 'o empieza otra historia';
    card.appendChild(divider);

    const seedLabel = document.createElement('label');
    seedLabel.className = 'sm-label';
    seedLabel.textContent = 'semilla';
    this.seedInput = document.createElement('input');
    this.seedInput.type = 'number';
    this.seedInput.min = '0';
    this.seedInput.max = '2147483647';
    this.seedInput.step = '1';
    this.seedInput.value = String(options.seed);
    this.seedInput.setAttribute('aria-label', 'semilla de la nueva partida');
    seedLabel.appendChild(this.seedInput);
    card.appendChild(seedLabel);

    const actions = document.createElement('div');
    actions.className = 'sm-actions';
    const fresh = this.button('nueva partida', 'sm-secondary', () => this.options.onNewGame(this.readSeed()));
    fresh.setAttribute('data-action', 'new-game');
    const sandbox = this.button('sandbox', 'sm-quiet', () => this.options.onSandbox(this.readSeed()));
    sandbox.setAttribute('data-action', 'sandbox');
    actions.append(fresh, sandbox);
    card.appendChild(actions);

    const hint = document.createElement('p');
    hint.className = 'sm-hint';
    hint.textContent = 'Elige una semilla para repetir un pueblo o descubrir uno nuevo.';
    card.appendChild(hint);

    this.root.appendChild(card);
    document.body.appendChild(this.root);
    window.setTimeout(() => continueButton.focus(), 0);
  }

  remove(): void {
    this.root.remove();
  }

  private readSeed(): number {
    const value = Number(this.seedInput.value);
    return Number.isFinite(value) ? Math.max(0, Math.min(0x7fffffff, Math.floor(value))) : this.options.seed;
  }

  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.sm-overlay{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;
  padding:20px;background:${rgba(PALETTE.groundBase,0.72)};backdrop-filter:blur(3px);font:12px/1.35 ui-monospace,monospace;color:${INK}}
.sm-card{width:min(420px,100%);padding:30px 32px 25px;text-align:center;background:${rgba(PALETTE.houseWall,0.97)};
  border:${PANEL_BORDER};border-radius:16px;box-shadow:0 10px 35px ${rgba(PALETTE.treeBlob,0.2)}}
.sm-mark{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:700;letter-spacing:.08em}
.sm-mark i{font-style:normal;opacity:.35}.sm-dot{width:9px;height:9px;border-radius:50%;background:${css(PALETTE.selectRing)};
  box-shadow:0 0 0 4px ${rgba(PALETTE.selectRing,0.18)}}
.sm-card h1{margin:24px 0 7px;font:600 25px/1.1 Georgia,serif;letter-spacing:-.02em;color:${INK}}
.sm-subtitle{margin:0 0 24px;opacity:.58}.sm-primary,.sm-secondary,.sm-quiet{width:100%;cursor:pointer;border-radius:9px;
  font:600 11px ui-monospace,monospace;letter-spacing:.04em;text-transform:uppercase;transition:transform .08s ease,filter .15s ease}
.sm-primary{padding:12px;color:${css(PALETTE.houseWall)};background:${css(PALETTE.treeBlob)};border:1px solid ${css(PALETTE.treeBlob)}}
.sm-primary:hover,.sm-secondary:hover,.sm-quiet:hover{filter:brightness(1.06)}.sm-primary:active,.sm-secondary:active,.sm-quiet:active{transform:translateY(1px)}
.sm-divider{display:flex;align-items:center;gap:10px;margin:21px 0 13px;font-size:10px;opacity:.48}
.sm-divider:before,.sm-divider:after{content:'';height:1px;flex:1;background:${rgba(PALETTE.treeBlob,0.16)}}
.sm-label{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;font-size:10px;opacity:.72}
.sm-label input{width:175px;box-sizing:border-box;padding:8px 9px;color:${INK};background:${rgba(PALETTE.groundBase,0.38)};
  border:1px solid ${rgba(PALETTE.treeBlob,0.2)};border-radius:7px;font:12px ui-monospace,monospace;outline:none}
.sm-label input:focus{border-color:${css(PALETTE.selectRing)};box-shadow:0 0 0 2px ${rgba(PALETTE.selectRing,0.16)}}
.sm-actions{display:flex;gap:8px;margin-top:11px}.sm-secondary,.sm-quiet{padding:10px 8px}
.sm-secondary{color:${INK};background:${rgba(PALETTE.grass,0.45)};border:1px solid ${rgba(PALETTE.treeBlob,0.2)}}
.sm-quiet{color:${INK};background:transparent;border:1px solid ${rgba(PALETTE.treeBlob,0.18)}}
.sm-hint{margin:19px 0 0;font-size:10px;opacity:.46}
@media(max-width:480px){.sm-card{padding:25px 20px 21px}.sm-card h1{font-size:22px}.sm-label input{width:150px}}
`;
    document.head.appendChild(style);
  }
}
