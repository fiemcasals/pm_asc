import { describe, expect, it, vi } from 'vitest';
import {
  CHECKLIST_VERSION,
  obtenerChecklistParaTipo,
  obtenerFallasCriticasDefinidas,
} from './checklist.config';
import { contarRespondidosSolapa, esSolapaCompleta } from './checklist.logic';
import {
  construirPayloadInformeCritico,
  despacharOEncolarInformeCritico,
  recolectarFallasCriticasSolapa,
  sincronizarColaFallasCriticas,
} from './fallasCriticasChecklist';

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

import {
  OFFLINE_DB_NAME,
  STORE_COLA_FALLAS,
  STORE_VISITAS,
  cargarVisitaEnCurso,
  guardarVisitaEnCurso,
  limpiarVisitaEnCurso,
  listarColaInformesCriticos,
  tieneProgresoVisita,
} from './offlineStore';

function crearIdbEnMemoria(): IDBFactory {
  const stores = new Map<string, Map<string, unknown>>();
  const keyPaths = new Map<string, string>();

  const makeReq = <T,>(run: () => T): IDBRequest<T> => {
    const req: Record<string, unknown> = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      try {
        req.result = run();
        if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
      } catch (err) {
        req.error = err;
        if (typeof req.onerror === 'function') (req.onerror as () => void)();
      }
    });
    return req as unknown as IDBRequest<T>;
  };

  return {
    open(_name: string) {
      const req: Record<string, unknown> = {
        result: undefined,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      const db = {
        objectStoreNames: { contains: (s: string) => stores.has(s) },
        createObjectStore: (s: string, opts: { keyPath: string }) => {
          stores.set(s, new Map());
          keyPaths.set(s, opts.keyPath);
          return {};
        },
        close: () => {},
        transaction: (storeName: string) => {
          const tx: Record<string, unknown> = { oncomplete: null, onerror: null, onabort: null };
          queueMicrotask(() => {
            if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
          });
          tx.objectStore = () => {
            const map = stores.get(storeName)!;
            const kp = keyPaths.get(storeName)!;
            return {
              put: (val: Record<string, unknown>) => makeReq(() => {
                map.set(String(val[kp]), val);
                return val[kp];
              }),
              get: (k: string) => makeReq(() => map.get(k)),
              getAll: () => makeReq(() => [...map.values()]),
              delete: (k: string) => makeReq(() => {
                map.delete(k);
                return undefined;
              }),
            };
          };
          return tx;
        },
      };
      queueMicrotask(() => {
        req.result = db;
        if (!stores.has(STORE_VISITAS) && typeof req.onupgradeneeded === 'function') {
          (req.onupgradeneeded as () => void)();
        }
        if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

describe('Persistencia offline en IndexedDB (HU-17 RNF-01)', () => {
  it('guarda y recupera visita con 3 equipos y 20 fotos comprimidas sin tocar LocalStorage', async () => {
    const idb = crearIdbEnMemoria();
    const fotosM1: FotosPorEquipo = {};
    const fotosM2: FotosPorEquipo = {};
    const fotosM3: FotosPorEquipo = {};

    for (let i = 0; i < 20; i += 1) {
      const paso = comprimirDataUrlHastaTope(
        (escala, calidad) => `data:image/jpeg;base64,${'B'.repeat(Math.round(450_000 * escala * calidad))}`,
        MAX_FOTO_BYTES,
      );
      const target = i < 7 ? fotosM1 : i < 14 ? fotosM2 : fotosM3;
      const maq = i < 7 ? 'demo-m1' : i < 14 ? 'demo-m2' : 'demo-m3';
      const ref = i < 7 ? 'M1' : i < 14 ? 'M2' : 'M3';
      target[`cabina:item_${i}`] = {
        id: `f-${i}`,
        maquinaId: maq,
        referenciaAgc: ref,
        solapaId: 'cabina',
        itemId: `item_${i}`,
        itemEtiqueta: `Ítem ${i}`,
        dataUrl: paso.dataUrl,
        sizeBytes: paso.sizeBytes,
        tomadaEn: new Date().toISOString(),
      };
    }

    const saved = await guardarVisitaEnCurso(
      {
        equipoId: 'demo-m2',
        solapaActiva: 'cabina',
        tipoOverride: {},
        estadoPorEquipo: { 'demo-m2': 'en_uso' },
        respuestasPorEquipo: {
          'demo-m1': { sala_maquinas: { cables_traccion: 'correctos' } },
          'demo-m2': { cabina: { iluminacion_cabina: 'falla' } },
        },
        obsPorEquipo: { 'demo-m2': { cabina: 'Revisar tubo LED' } },
        fotosPorEquipo: {
          'demo-m1': fotosM1,
          'demo-m2': fotosM2,
          'demo-m3': fotosM3,
        },
        fallasPisoPorEquipo: {},
      },
      idb,
    );

    expect(OFFLINE_DB_NAME).toBe('mant_asc_inspeccion_db');
    expect(STORE_COLA_FALLAS).toBe('cola_fallas_criticas');
    expect(saved.equipoId).toBe('demo-m2');
    expect(saved.solapaActiva).toBe('cabina');

    const loaded = await cargarVisitaEnCurso(idb);
    expect(tieneProgresoVisita(loaded)).toBe(true);
    expect(loaded?.equipoId).toBe('demo-m2');
    expect(loaded?.solapaActiva).toBe('cabina');
    const totalFotos =
      Object.keys(loaded?.fotosPorEquipo['demo-m1'] ?? {}).length +
      Object.keys(loaded?.fotosPorEquipo['demo-m2'] ?? {}).length +
      Object.keys(loaded?.fotosPorEquipo['demo-m3'] ?? {}).length;
    expect(totalFotos).toBe(20);
    expect(globalThis.localStorage).toBeUndefined();

    await limpiarVisitaEnCurso(idb);
    expect(await cargarVisitaEnCurso(idb)).toBeNull();
  });
});

describe('Fallas críticas del checklist y cola offline (HU-17 RF-08)', () => {
  it('recolecta fallas críticas de una solapa (incluye fallas por piso y fotos) y arma el payload', () => {
    const config = obtenerChecklistParaTipo('traccion');
    const accesos = config.solapas.find((s) => s.id === 'accesos')!;

    const rec = recolectarFallasCriticasSolapa({
      solapa: accesos,
      respuestasSolapa: {
        espacio_entre_puertas: 'mayor_12cm',
      },
      fallasPiso: [
        {
          id: 'fp-1',
          piso: '4',
          componenteId: 'cerradura_puerta',
          componenteEtiqueta: 'Cerradura no traba',
          grupo: 'seguridad_critica',
          grupoTitulo: 'Seguridad Crítica',
          detalle: 'No enclava puerta en piso 4',
          esFallaCritica: true,
          codigoFallaCritica: 'CERRADURA_NO_TRABA',
          creadaEn: '2026-11-12T12:00:00.000Z',
        },
      ],
      fotos: {
        'accesos:espacio_entre_puertas': {
          id: 'f-1',
          maquinaId: 'demo-m1',
          referenciaAgc: 'M1',
          solapaId: 'accesos',
          itemId: 'espacio_entre_puertas',
          itemEtiqueta: 'Espacio entre puertas mayor a 12 cm',
          dataUrl: 'data:image/jpeg;base64,AAA=',
          sizeBytes: 1200,
          tomadaEn: '2026-11-12T12:00:00.000Z',
        },
        'accesos:piso:fp-1': {
          id: 'f-2',
          maquinaId: 'demo-m1',
          referenciaAgc: 'M1',
          solapaId: 'accesos',
          itemId: 'piso-fp-1',
          itemEtiqueta: 'Piso 4',
          dataUrl: 'data:image/jpeg;base64,BBB=',
          sizeBytes: 1400,
          tomadaEn: '2026-11-12T12:00:00.000Z',
        },
      },
    });

    expect(rec.codigosCriticos).toEqual(['ESPACIO_ENTRE_PUERTAS_MAYOR_12CM', 'CERRADURA_NO_TRABA']);
    expect(rec.fotografias).toHaveLength(2);

    const payload = construirPayloadInformeCritico({
      equipo: EQUIPOS_EDIFICIO_DEMO[0],
      solapa: accesos,
      respuestasSolapa: { espacio_entre_puertas: 'mayor_12cm' },
      fallasPiso: [],
      fotos: {
        'accesos:espacio_entre_puertas': {
          id: 'f-1',
          maquinaId: 'demo-m1',
          referenciaAgc: 'M1',
          solapaId: 'accesos',
          itemId: 'espacio_entre_puertas',
          itemEtiqueta: 'Espacio entre puertas mayor a 12 cm',
          dataUrl: 'data:image/jpeg;base64,AAA=',
          sizeBytes: 1200,
          tomadaEn: '2026-11-12T12:00:00.000Z',
        },
      },
      observacionSolapa: 'Puerta desregulada',
      inspector: 'Gonzalo RT',
      clientReportId: 'rep-test-1',
    });

    expect(payload).toMatchObject({
      clientReportId: 'rep-test-1',
      maquinaId: 'MAQ-CALLAO-M1',
      inspector: 'Gonzalo RT',
      fallasCriticas: ['ESPACIO_ENTRE_PUERTAS_MAYOR_12CM'],
    });
    expect(payload?.observaciones).toContain('Puerta desregulada');
    expect(payload?.fotografias).toHaveLength(1);
  });

  it('sin señal encola el informe en IndexedDB y al volver la conexión lo envía una sola vez', async () => {
    const idb = crearIdbEnMemoria();
    const config = obtenerChecklistParaTipo('traccion');
    const sala = config.solapas.find((s) => s.id === 'sala_maquinas')!;
    const payload = construirPayloadInformeCritico({
      equipo: EQUIPOS_EDIFICIO_DEMO[0],
      solapa: sala,
      respuestasSolapa: { cables_traccion: 'desgastados', limitador_velocidad: 'anulado' },
      inspector: 'Gonzalo RT',
      clientReportId: 'rep-offline-1',
    })!;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ informe: { id: 'INF-901' }, eventoEmitido: true }),
    })) as unknown as typeof fetch;

    const offlineRes = await despacharOEncolarInformeCritico({
      payload,
      enLinea: false,
      idbFactory: idb,
      fetchFn: fetchMock,
    });
    expect(offlineRes).toEqual({
      tieneFallasCriticas: true,
      estado: 'encolado',
      pendientesEnCola: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await listarColaInformesCriticos(idb)).toHaveLength(1);

    const sync1 = await sincronizarColaFallasCriticas(idb, fetchMock);
    expect(sync1).toEqual({ enviados: 1, pendientes: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listarColaInformesCriticos(idb)).toHaveLength(0);

    // Segundo intento de sincronización: la cola ya está vacía, no reenvía duplicados
    const sync2 = await sincronizarColaFallasCriticas(idb, fetchMock);
    expect(sync2).toEqual({ enviados: 0, pendientes: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
