/** Los formularios y los atajos del navegador conservan sus teclas. */
export function ignoreGameKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  return !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}
