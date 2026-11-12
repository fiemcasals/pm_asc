import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_VERSION,
  obtenerChecklistParaTipo,
  obtenerFallasCriticasDefinidas,
} from './checklist.config';
import { contarRespondidosSolapa, esSolapaCompleta } from './checklist.logic';

describe('Checklist genérico por solapas (HU-17 RF-04)', () => {
  it('dibuja las 5 solapas desde el motor versionado y adapta ítems según tracción vs hidráulico', () => {
    const traccion = obtenerChecklistParaTipo('traccion');
    const hidraulico = obtenerChecklistParaTipo('hidraulico');

    expect(traccion.version).toBe(CHECKLIST_VERSION);
    expect(traccion.solapas.map((s) => s.nombre)).toEqual([
      'Sala de Máquinas',
      'Cabina',
      'Accesos',
      'Caja',
      'Fosa',
    ]);

    const itemsH = hidraulico.solapas.flatMap((s) => s.subgrupos.flatMap((g) => g.items.map((i) => i.id)));
    expect(itemsH).toContain('aceite_batea');
    expect(itemsH).not.toContain('cables_traccion');
    expect(obtenerFallasCriticasDefinidas()).toHaveLength(14);
  });

  it('marca tilde en una solapa solo cuando todos sus ítems aplicables están respondidos', () => {
    const hidraulico = obtenerChecklistParaTipo('hidraulico');
    const fosa = hidraulico.solapas.find((s) => s.id === 'fosa')!;
    const itemsFosa = fosa.subgrupos.flatMap((g) => g.items);
    expect(itemsFosa.length).toBeGreaterThan(1);

    expect(esSolapaCompleta(fosa, {})).toBe(false);
    expect(contarRespondidosSolapa(fosa, { [itemsFosa[0].id]: itemsFosa[0].opciones[0].id })).toEqual({
      respondidos: 1,
      total: itemsFosa.length,
    });
    expect(
      esSolapaCompleta(fosa, { [itemsFosa[0].id]: itemsFosa[0].opciones[0].id }),
    ).toBe(false);

    const respuestasCompletas = Object.fromEntries(
      itemsFosa.map((it) => [it.id, it.opciones[0].id]),
    );
    expect(esSolapaCompleta(fosa, respuestasCompletas)).toBe(true);
  });
});

