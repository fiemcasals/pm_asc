import { describe, expect, it } from 'vitest';
import {
  claveFotoObligatoria,
  etiquetasDeFaltantes,
  FOTOS_OBLIGATORIAS,
  fotosObligatoriasDelTipo,
  fotosObligatoriasFaltantes,
  fotosParaElInforme,
  nuevaFotoObligatoria,
} from './fotosObligatorias';

// HU-17 RF-11: qué fotos se sacan en cada equipo aunque no haya fallas.
const IMAGEN = { dataUrl: 'data:image/jpeg;base64,/9j/AAAA', sizeBytes: 12_345 };
const EQUIPO = { maquinaId: 'maq-1', referenciaAgc: 'M1' };

describe('fotosObligatoriasDelTipo (criterio 1)', () => {
  it('tracción y montavehículos llevan el frente y los cables; el hidráulico, sólo el frente', () => {
    expect(fotosObligatoriasDelTipo('traccion')).toEqual(['frente', 'cables']);
    expect(fotosObligatoriasDelTipo('montavehiculos')).toEqual(['frente', 'cables']);
    expect(fotosObligatoriasDelTipo('hidraulico')).toEqual(['frente']);
  });
});

describe('claveFotoObligatoria', () => {
  it('usa claves reservadas que no chocan con las de las fotos de anomalía (solapa:ítem)', () => {
    expect(claveFotoObligatoria('frente')).toBe('obligatoria:frente');
    expect(claveFotoObligatoria('cables')).toBe('obligatoria:cables');
  });
});

describe('nuevaFotoObligatoria (criterio 2)', () => {
  it('guarda el equipo, el nombre de la foto, el tamaño y la hora en que se tomó, con el formato de una foto de anomalía', () => {
    const ahora = new Date('2026-11-23T15:30:00.000Z');

    const foto = nuevaFotoObligatoria('frente', EQUIPO, IMAGEN, ahora);

    expect(foto).toMatchObject({
      maquinaId: 'maq-1',
      referenciaAgc: 'M1',
      itemId: 'obligatoria:frente',
      itemEtiqueta: 'Frente de cabina y botonera',
      solapaId: 'cabina',
      dataUrl: IMAGEN.dataUrl,
      sizeBytes: 12_345,
      tomadaEn: '2026-11-23T15:30:00.000Z',
    });
    expect(foto.id).toMatch(/^foto-/);
  });

  it('la de cables queda en la solapa de la sala de máquinas, donde está el ítem de los cables', () => {
    expect(nuevaFotoObligatoria('cables', EQUIPO, IMAGEN).solapaId).toBe('sala_maquinas');
    expect(FOTOS_OBLIGATORIAS.cables.etiqueta).toBe('Cables de tracción');
  });
});

describe('fotosObligatoriasFaltantes (criterios 3 y 4)', () => {
  const frente = nuevaFotoObligatoria('frente', EQUIPO, IMAGEN);
  const cables = nuevaFotoObligatoria('cables', EQUIPO, IMAGEN);

  it('un equipo en uso sin fotos las debe todas, según su tipo', () => {
    expect(fotosObligatoriasFaltantes('traccion', 'en_uso', {})).toEqual(['frente', 'cables']);
    expect(fotosObligatoriasFaltantes('hidraulico', 'en_uso', {})).toEqual(['frente']);
  });

  it('con las fotos de su tipo no debe ninguna', () => {
    expect(fotosObligatoriasFaltantes('traccion', 'en_uso', { 'obligatoria:frente': frente, 'obligatoria:cables': cables })).toEqual([]);
    expect(fotosObligatoriasFaltantes('hidraulico', 'en_uso', { 'obligatoria:frente': frente })).toEqual([]);
  });

  it('una foto sin imagen no cuenta', () => {
    expect(fotosObligatoriasFaltantes('hidraulico', 'en_uso', { 'obligatoria:frente': { ...frente, dataUrl: '' } })).toEqual(['frente']);
  });

  it('un equipo fuera de servicio no debe ninguna', () => {
    expect(fotosObligatoriasFaltantes('traccion', 'fuera_de_servicio', {})).toEqual([]);
  });
});

describe('fotosParaElInforme (criterio 4)', () => {
  const fotos = {
    'obligatoria:frente': nuevaFotoObligatoria('frente', EQUIPO, IMAGEN),
    'obligatoria:cables': nuevaFotoObligatoria('cables', EQUIPO, IMAGEN),
    'cabina:puerta': { ...nuevaFotoObligatoria('frente', EQUIPO, IMAGEN), itemId: 'puerta' },
  };

  it('un hidráulico no manda la de cables aunque se haya sacado antes de cambiar el tipo; lo demás queda igual', () => {
    expect(Object.keys(fotosParaElInforme('hidraulico', fotos)).sort()).toEqual(['cabina:puerta', 'obligatoria:frente']);
  });

  it('tracción y montavehículos mandan todo', () => {
    expect(fotosParaElInforme('traccion', fotos)).toBe(fotos);
    expect(fotosParaElInforme('montavehiculos', fotos)).toBe(fotos);
  });
});

describe('etiquetasDeFaltantes', () => {
  it('arma la frase con las fotos que faltan', () => {
    expect(etiquetasDeFaltantes(['frente'])).toBe('frente de cabina y botonera');
    expect(etiquetasDeFaltantes(['frente', 'cables'])).toBe('frente de cabina y botonera y cables de tracción');
  });
});
