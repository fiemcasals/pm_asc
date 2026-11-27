// HU-19 RF-10 — qué conversación del chat está mirando la persona en este momento. La pantalla del chat lo fija mientras está abierta y lo suelta
// al cerrarse; los avisos del navegador lo consultan para no avisar de lo que ya se está viendo.

let conversacionAbierta: string | null = null;

/** La pantalla del chat dice qué conversación tiene abierta (`null` cuando se cierra). */
export function fijarConversacionVista(sala: string | null): void {
  conversacionAbierta = sala;
}

/** La conversación que la pantalla del chat tiene abierta, o `null` si el chat no está en pantalla. */
export function conversacionVista(): string | null {
  return conversacionAbierta;
}
