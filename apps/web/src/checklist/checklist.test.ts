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


import {
  claveFotoAnomalia,
  evaluarEstadoSolapa,
  type FotosPorEquipo,
} from './checklist.logic';
import {
  MAX_FOTO_BYTES,
  calcularTamanoBase64Bytes,
  comprimirDataUrlHastaTope,
  type FotoAnomalia,
} from './fotos';

describe('Fotos por anomalía (HU-17 RF-05)', () => {
  it('falla crítica sin foto bloquea la solapa; falla común sin foto permite completarla', () => {
    const hidraulico = obtenerChecklistParaTipo('hidraulico');
    const fosa = hidraulico.solapas.find((s) => s.id === 'fosa')!;
    const items = fosa.subgrupos.flatMap((g) => g.items);

    const respuestasFallaComun = Object.fromEntries(
      items.map((it) =>
        it.id === 'amortiguadores_fosa' ? [it.id, 'deteriorados'] : [it.id, it.opciones[0].id],
      ),
    );
    expect(esSolapaCompleta(fosa, respuestasFallaComun, {}, 'en_uso')).toBe(true);

    const respuestasCritica = {
      ...respuestasFallaComun,
      stop_fosa: 'deficiente_inexistente',
    };
    const estadoSinFoto = evaluarEstadoSolapa(fosa, respuestasCritica, {}, 'en_uso');
    expect(estadoSinFoto.completa).toBe(false);
    expect(estadoSinFoto.faltanFotosObligatorias).toEqual(['stop_fosa']);

    const fotos: FotosPorEquipo = {
      [claveFotoAnomalia('fosa', 'stop_fosa')]: {
        id: 'f-1',
        maquinaId: 'demo-m2',
        referenciaAgc: 'M2',
        solapaId: 'fosa',
        itemId: 'stop_fosa',
        itemEtiqueta: 'Stop de fosa',
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        sizeBytes: 18400,
        tomadaEn: '2026-11-12T15:30:00.000Z',
      },
    };
    const estadoConFoto = evaluarEstadoSolapa(fosa, respuestasCritica, fotos, 'en_uso');
    expect(estadoConFoto.completa).toBe(true);
    expect(estadoConFoto.faltanFotosObligatorias).toEqual([]);
  });

  it('comprime progresivamente una imagen por debajo de 500 KB conservando metadatos', () => {
    const paso = comprimirDataUrlHastaTope((escala, calidad) => {
      const largoBase64 = Math.round(900_000 * escala * calidad);
      return `data:image/jpeg;base64,${'A'.repeat(largoBase64)}`;
    }, MAX_FOTO_BYTES);

    expect(paso.sizeBytes).toBeLessThanOrEqual(MAX_FOTO_BYTES);
    expect(calcularTamanoBase64Bytes(paso.dataUrl)).toBe(paso.sizeBytes);

    const registro: FotoAnomalia = {
      id: 'foto-meta-1',
      maquinaId: 'maq-1',
      referenciaAgc: 'M1',
      solapaId: 'cabina',
      itemId: 'boton_pare',
      itemEtiqueta: 'Botón de pare',
      dataUrl: paso.dataUrl,
      sizeBytes: paso.sizeBytes,
      tomadaEn: new Date('2026-11-12T15:00:00.000Z').toISOString(),
    };
    expect(registro.maquinaId).toBe('maq-1');
    expect(registro.solapaId).toBe('cabina');
    expect(registro.itemId).toBe('boton_pare');
    expect(registro.tomadaEn).toBe('2026-11-12T15:00:00.000Z');
  });
});
