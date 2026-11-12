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

import {
  COMPONENTES_ACCESOS_POR_PISO,
  GRUPOS_COMPONENTES_ACCESOS,
  agregarFallaPiso,
  crearFallaPiso,
  eliminarFallaPiso,
  generarListaPisosEdificio,
  type FallaPisoRegistro,
} from './fallasPiso';

describe('Fallas por piso en Accesos (HU-17 RF-06)', () => {
  it('incluye los tres grupos del cliente y la opción "Espacio entre puertas mayor a 12 cm"', () => {
    expect(GRUPOS_COMPONENTES_ACCESOS.map((g) => g.titulo)).toEqual([
      'Seguridad Crítica',
      'Mecánica de Puerta',
      'Llamadores',
    ]);

    const espacio = COMPONENTES_ACCESOS_POR_PISO.find(
      (c) => c.etiqueta === 'Espacio entre puertas mayor a 12 cm',
    );
    expect(espacio).toBeDefined();
    expect(espacio?.esFallaCritica).toBe(true);
    expect(espacio?.grupoTitulo).toBe('Seguridad Crítica');
  });

  it('permite agregar varias fallas por piso usando la lista del edificio y eliminar una puntual', () => {
    const pisos = generarListaPisosEdificio(4, true);
    expect(pisos).toEqual(['SS', 'PB', '1', '2', '3', '4']);

    const f1 = crearFallaPiso('3', 'espacio_entre_puertas', 'Puerta derecha 14 cm');
    const f2 = crearFallaPiso('3', 'hojas_guias_patin', 'Patín inferior suelto');
    const f3 = crearFallaPiso('PB', 'llamadores_piso');

    let lista: FallaPisoRegistro[] = [];
    lista = agregarFallaPiso(lista, f1);
    lista = agregarFallaPiso(lista, f2);
    lista = agregarFallaPiso(lista, f3);

    expect(lista).toHaveLength(3);
    expect(lista.filter((f) => f.piso === '3')).toHaveLength(2);

    const trasEliminar = eliminarFallaPiso(lista, f2.id);
    expect(trasEliminar).toHaveLength(2);
    expect(trasEliminar.map((f) => f.id)).toEqual([f1.id, f3.id]);
  });
});

import {
  EQUIPOS_EDIFICIO_DEMO,
  aplicarRespuestaConSalaCompartida,
  obtenerSiguienteSolapa,
  obtenerSolapaAnterior,
} from './navegacion';

describe('Navegación por estaciones y sala compartida (HU-17 RF-07)', () => {
  it('sincroniza respuestas de entorno entre equipos de una misma sala compartida sin tocar salas independientes', () => {
    const config = obtenerChecklistParaTipo('traccion');
    const { respuestasPorEquipo, propagadoAEquipos } = aplicarRespuestaConSalaCompartida({
      prevRespuestasPorEquipo: {},
      equipos: EQUIPOS_EDIFICIO_DEMO,
      equipoActivoId: 'demo-m1',
      config,
      solapaId: 'sala_maquinas',
      itemId: 'entorno_iluminacion',
      opcionId: 'deficiente',
    });

    expect(propagadoAEquipos).toEqual(['demo-m2']);
    expect(respuestasPorEquipo['demo-m1']?.sala_maquinas?.entorno_iluminacion).toBe('deficiente');
    expect(respuestasPorEquipo['demo-m2']?.sala_maquinas?.entorno_iluminacion).toBe('deficiente');
    expect(respuestasPorEquipo['demo-m3']?.sala_maquinas?.entorno_iluminacion).toBeUndefined();

    // Ítem propio de máquina no se propaga entre equipos
    const resMaq = aplicarRespuestaConSalaCompartida({
      prevRespuestasPorEquipo: respuestasPorEquipo,
      equipos: EQUIPOS_EDIFICIO_DEMO,
      equipoActivoId: 'demo-m1',
      config,
      solapaId: 'sala_maquinas',
      itemId: 'cables_traccion',
      opcionId: 'correctos',
    });
    expect(resMaq.propagadoAEquipos).toEqual([]);
    expect(resMaq.respuestasPorEquipo['demo-m2']?.sala_maquinas?.cables_traccion).toBeUndefined();
  });

  it('navega a la estación siguiente y conserva orden completo', () => {
    const config = obtenerChecklistParaTipo('traccion');
    expect(obtenerSiguienteSolapa(config.solapas, 'sala_maquinas')?.id).toBe('cabina');
    expect(obtenerSiguienteSolapa(config.solapas, 'cabina')?.id).toBe('accesos');
    expect(obtenerSiguienteSolapa(config.solapas, 'fosa')).toBeNull();
    expect(obtenerSolapaAnterior(config.solapas, 'sala_maquinas')).toBeNull();
    expect(obtenerSolapaAnterior(config.solapas, 'cabina')?.id).toBe('sala_maquinas');
  });
});
