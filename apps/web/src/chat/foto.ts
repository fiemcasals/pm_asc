// HU-19 RF-08 — la foto agrandada del chat: qué teclas la cierran y cuáles abren una foto desde el teclado.

/** ¿Esta tecla cierra la foto agrandada? («Esc» es como la llaman los navegadores viejos). */
export function esTeclaDeCerrar(tecla: string): boolean {
  return tecla === 'Escape' || tecla === 'Esc';
}

/** ¿Esta tecla abre la foto cuando está enfocada? (como un botón: Enter o espacio). */
export function esTeclaDeAbrir(tecla: string): boolean {
  return tecla === 'Enter' || tecla === ' ' || tecla === 'Spacebar';
}
