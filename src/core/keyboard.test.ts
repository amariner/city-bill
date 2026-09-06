const assert = {
  equal(a: unknown, b: unknown, message: string) { if (a !== b) throw new Error(message); },
};
import { ToolState } from './tools';
import { Input } from './input';

// Ejecuta los manejadores reales con una superficie mínima: sin renderer ni navegador.
const handlers = new Map<string, Array<(event: KeyboardEvent) => void>>();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  addEventListener(name: string, fn: (event: KeyboardEvent) => void) {
    const list = handlers.get(name) ?? [];
    list.push(fn); handlers.set(name, list);
  },
} });
try {
  const tools = new ToolState({ act: () => 1 });
  const input = new Input({ addEventListener() {} } as unknown as HTMLElement);
  function key(name: string, overrides: Record<string, unknown> = {}, type = 'keydown'): void {
    const event = { key: name, defaultPrevented: false, preventDefault(this: { defaultPrevented: boolean }) { this.defaultPrevented = true; },
      stopImmediatePropagation() {}, ...overrides } as unknown as KeyboardEvent;
    for (const fn of handlers.get(type) ?? []) fn(event);
  }
  key('d');
  assert.equal(tools.active.kind, 'none', 'D no cambia de herramienta');
  assert.equal(input.keyboardPan().x, 1, 'D conserva el desplazamiento de cámara');
  key('d', {}, 'keyup');
  key('u');
  assert.equal(tools.active.kind, 'district', 'U abre distritos');
  tools.cancel();
  key('b', { ctrlKey: true });
  assert.equal(tools.active.kind, 'none', 'Ctrl+B pertenece al navegador');
  const field = { closest: () => ({}) };
  key('b', { target: field });
  key('ArrowRight', { target: field });
  assert.equal(tools.active.kind, 'none', 'escribir B no construye');
  assert.equal(input.keyboardPan().x, 0, 'ajustar un slider no mueve la cámara');
  key('q', { target: field });
  assert.equal(input.consumeRotate(), 0, 'escribir Q no rota la cámara');
  key('u', { repeat: true });
  assert.equal(tools.active.kind, 'none', 'no se reinicia una herramienta por repetición');
  const menus: string[] = [];
  tools.onMenuRequest = (menu) => menus.push(menu);
  for (const k of ['b', 'r', 'z']) key(k);
  assert.equal(menus.join(','), 'build,road,zone', 'los atajos ofrecen la misma elección que la toolbar');
  assert.equal(tools.active.kind, 'none', 'abrir un menú no selecciona un edificio por sorpresa');
  console.log('keyboard.test: 10 passed, 0 failed');
} finally {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
}
