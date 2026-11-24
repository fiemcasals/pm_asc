import { describe, expect, it, vi } from 'vitest';
import { obtenerChecklistParaTipo, type TipoMaquinaChecklist } from '../checklist/checklist.config';
import { type FotosPorEquipo, type RespuestasChecklist } from '../checklist/checklist.logic';
import { type EquipoInspeccion } from '../checklist/navegacion';
import { claveFotoObligatoria, fotosObligatoriasDelTipo, nuevaFotoObligatoria } from '../checklist/fotosObligatorias';
import { armarInforme, dniValido, enviarInforme, selloCorto, erroresFirmante, erroresSinFirma, firmaTrazada, puedeConsolidar, type EstadoVisita, type Punto } from './consolidacion';

// HU-18 RF-01: consolidar el informe y firmar.
const equipo = (id: string, tipo: TipoMaquinaChecklist = 'traccion'): EquipoInspeccion => ({ maquinaId: id, referenciaAgc: id.toUpperCase(), descripcion: '', tipo, salaCompartidaId: null });
/** Responde todos los ítems de todas las solapas del tipo con la primera opción que no es falla (no pide fotos). */
const respuestasCompletas = (tipo: TipoMaquinaChecklist): RespuestasChecklist =>
  Object.fromEntries(
    obtenerChecklistParaTipo(tipo).solapas.map((s) => [
      s.id,
      Object.fromEntries(s.subgrupos.flatMap((g) => g.items.map((i) => [i.id, i.opciones.find((o) => !o.esFalla && !o.fotoObligatoria)!.id]))),
    ]),
  );
/** Las fotos obligatorias de un equipo en uso del tipo dado (HU-17 RF-11): frente y, si tiene cables de tracción, cables. */
const fotosObligatorias = (id: string, tipo: TipoMaquinaChecklist = 'traccion'): FotosPorEquipo =>
  Object.fromEntries(fotosObligatoriasDelTipo(tipo).map((f) => [claveFotoObligatoria(f), nuevaFotoObligatoria(f, { maquinaId: id, referenciaAgc: id.toUpperCase() }, { dataUrl: 'data:image/jpeg;base64,AAAA', sizeBytes: 3 })]));
const vacia = (extra: Partial<EstadoVisita> = {}): EstadoVisita => ({ estadoPorEquipo: {}, respuestasPorEquipo: {}, obsPorEquipo: {}, fotosPorEquipo: {}, tipoOverride: {}, ...extra });
const completa = (ids: string[]): EstadoVisita =>
  vacia({
    estadoPorEquipo: Object.fromEntries(ids.map((i) => [i, 'en_uso'])),
    respuestasPorEquipo: Object.fromEntries(ids.map((i) => [i, respuestasCompletas('traccion')])),
    fotosPorEquipo: Object.fromEntries(ids.map((i) => [i, fotosObligatorias(i)])),
  });
const TRAZO: Punto[] = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);

describe('puedeConsolidar (criterio 1: sólo con todo completo o resuelto como fuera de servicio)', () => {
  const equipos = [equipo('m1'), equipo('m2')];

  it('con todas las solapas de todos los equipos completas se habilita', () => {
    expect(puedeConsolidar(equipos, completa(['m1', 'm2']))).toEqual({ puede: true, pendientes: [] });
  });

  it('un equipo sin responder si está en uso bloquea, y dice cuál', () => {
    const v = completa(['m1']);

    expect(puedeConsolidar(equipos, v)).toEqual({ puede: false, pendientes: [{ equipo: 'M2', motivo: 'falta indicar si está en uso' }] });
  });

  it('un equipo con una solapa incompleta bloquea y dice cuáles faltan', () => {
    const v = completa(['m1', 'm2']);
    const incompleta = { ...respuestasCompletas('traccion') };
    delete incompleta.fosa;
    v.respuestasPorEquipo.m2 = incompleta;

    const r = puedeConsolidar(equipos, v);

    expect(r.puede).toBe(false);
    expect(r.pendientes).toEqual([{ equipo: 'M2', motivo: 'faltan completar: Fosa' }]);
  });

  it('un ítem sin responder dentro de una solapa también bloquea', () => {
    const v = completa(['m1', 'm2']);
    const resp = structuredClone(respuestasCompletas('traccion'));
    const primero = Object.keys(resp.cabina!)[0];
    delete resp.cabina![primero];
    v.respuestasPorEquipo.m1 = resp;

    expect(puedeConsolidar(equipos, v).pendientes).toEqual([{ equipo: 'M1', motivo: 'faltan completar: Cabina' }]);
  });

  it('un equipo resuelto como fuera de servicio cuenta como resuelto aunque no tenga solapas', () => {
    const v = completa(['m1']);
    v.estadoPorEquipo.m2 = 'fuera_de_servicio';

    expect(puedeConsolidar(equipos, v)).toEqual({ puede: true, pendientes: [] });
  });

  it('una respuesta con foto obligatoria sin la foto deja la solapa incompleta (falla crítica)', () => {
    const v = completa(['m1']);
    const critica = obtenerChecklistParaTipo('traccion').solapas.flatMap((s) => s.subgrupos.flatMap((g) => g.items.map((i) => ({ s: s.id, i, o: i.opciones.find((x) => x.esFallaCritica) })))).find((x) => x.o)!;
    v.respuestasPorEquipo.m1 = { ...respuestasCompletas('traccion'), [critica.s]: { ...respuestasCompletas('traccion')[critica.s], [critica.i.id]: critica.o!.id } };

    expect(puedeConsolidar([equipo('m1')], v).puede).toBe(false);
  });

  it('el tipo cambiado a mano (hidráulico) se evalúa con el checklist de ese tipo', () => {
    const v = vacia({ estadoPorEquipo: { m1: 'en_uso' }, respuestasPorEquipo: { m1: respuestasCompletas('traccion') }, fotosPorEquipo: { m1: fotosObligatorias('m1', 'hidraulico') }, tipoOverride: { m1: 'hidraulico' } });

    expect(puedeConsolidar([equipo('m1')], v).puede).toBe(false); // las respuestas de tracción no cubren el aceite de batea
    v.respuestasPorEquipo.m1 = respuestasCompletas('hidraulico');
    expect(puedeConsolidar([equipo('m1')], v).puede).toBe(true);
  });

  it('un edificio sin equipos no se consolida', () => {
    expect(puedeConsolidar([], vacia())).toEqual({ puede: false, pendientes: [] });
  });
});

describe('firmaTrazada (criterio 2: la firma no se acepta vacía)', () => {
  it('sin trazos, trazo vacío, 7 puntos, un toque o una raya diminuta no; un trazo con cuerpo sí', () => {
    expect(firmaTrazada([])).toBe(false);
    expect(firmaTrazada([[]])).toBe(false);
    expect(firmaTrazada([TRAZO.slice(0, 7)])).toBe(false);
    expect(firmaTrazada([Array.from({ length: 30 }, () => [50, 50] as Punto)])).toBe(false);
    expect(firmaTrazada([Array.from({ length: 30 }, (_, i) => [50 + (i % 5), 50] as Punto)])).toBe(false);
    expect(firmaTrazada([TRAZO.slice(0, 8)])).toBe(true);
    expect(firmaTrazada([TRAZO])).toBe(true);
  });
  it('el borde: 14 px no, 15 px sí, en horizontal y en vertical', () => {
    const h = (a: number): Punto[] => Array.from({ length: 10 }, (_, i) => [i * (a / 9), 50]);
    const v = (a: number): Punto[] => Array.from({ length: 10 }, (_, i) => [50, i * (a / 9)]);

    expect([firmaTrazada([h(14)]), firmaTrazada([h(15)]), firmaTrazada([v(14)]), firmaTrazada([v(15)])]).toEqual([false, true, false, true]);
  });
  it('los puntos se suman entre trazos', () => {
    expect(firmaTrazada([TRAZO.slice(0, 4), TRAZO.slice(4, 8)])).toBe(true);
  });
});

describe('erroresFirmante y dniValido (criterio 3)', () => {
  const ok = { nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado' as const, dni: '' };

  it('con nombre, apellido y carácter no hay errores; el DNI vacío está bien', () => {
    expect(erroresFirmante(ok)).toEqual([]);
  });
  it('cada dato obligatorio que falta da su error', () => {
    expect(erroresFirmante({ ...ok, nombre: '' })).toEqual(['Falta el nombre.']);
    expect(erroresFirmante({ ...ok, nombre: ' C ' })).toEqual(['Falta el nombre.']);
    expect(erroresFirmante({ ...ok, apellido: '  ' })).toEqual(['Falta el apellido.']);
    expect(erroresFirmante({ ...ok, caracter: '' })).toEqual([expect.stringMatching(/en qué carácter firma/)]);
    expect(erroresFirmante({ nombre: '', apellido: '', caracter: '', dni: '' })).toHaveLength(3);
  });
  it.each(['Encargado', 'Administrador', 'Propietario'] as const)('el carácter %s es válido', (caracter) => {
    expect(erroresFirmante({ ...ok, caracter })).toEqual([]);
  });
  it('el DNI, si se escribe, tiene que ser válido', () => {
    expect(erroresFirmante({ ...ok, dni: '12.345.678' })).toEqual([]);
    expect(erroresFirmante({ ...ok, dni: '123' })).toEqual([expect.stringMatching(/DNI/)]);
    expect(dniValido('')).toBe(true);
    expect(dniValido('  ')).toBe(true);
    expect(dniValido('1234567')).toBe(true);
    expect(dniValido('12345678')).toBe(true);
    for (const mal of ['123456', '123456789', '12a45678', '12-345-678']) expect(dniValido(mal)).toBe(false);
  });
});

describe('erroresSinFirma (criterio 4: motivo y foto)', () => {
  it('con motivo y foto no hay errores', () => {
    expect(erroresSinFirma({ motivo: 'El encargado no está', foto: 'data:image/jpeg;base64,AAAA' })).toEqual([]);
  });
  it('sin motivo, con motivo corto (9) o sin foto da su error; 10 caracteres alcanza', () => {
    expect(erroresSinFirma({ motivo: '', foto: 'x' })).toEqual([expect.stringMatching(/motivo/)]);
    expect(erroresSinFirma({ motivo: '123456789', foto: 'x' })).toHaveLength(1);
    expect(erroresSinFirma({ motivo: '1234567890', foto: 'x' })).toEqual([]);
    expect(erroresSinFirma({ motivo: '  ' + '1234567890'.slice(0, 5) + '  ', foto: 'x' })).toHaveLength(1);
    expect(erroresSinFirma({ motivo: 'El encargado no está', foto: null })).toEqual([expect.stringMatching(/foto/)]);
    expect(erroresSinFirma({ motivo: '', foto: null })).toHaveLength(2);
  });
  it('un motivo de más de 500 caracteres no se acepta', () => {
    expect(erroresSinFirma({ motivo: 'x'.repeat(501), foto: 'x' })).toEqual([expect.stringMatching(/500/)]);
  });
});

describe('armarInforme y enviarInforme', () => {
  const equipos = [equipo('m1'), equipo('m2', 'hidraulico')];
  const v = vacia({ estadoPorEquipo: { m1: 'en_uso', m2: 'fuera_de_servicio' }, obsPorEquipo: { m1: { cabina: 'ok' } }, tipoOverride: { m2: 'montavehiculos' } });
  const ahora = new Date('2026-11-17T13:00:00Z');

  it('con firma: trae todos los equipos (tipo y estado correctos), la firma sin espacios y el DNI sólo si se escribió', () => {
    const c = armarInforme('c1', equipos, v, { firma: { datos: { nombre: ' Carlos ', apellido: 'Rodríguez', caracter: 'Encargado', dni: '' }, imagen: 'data:image/png;base64,AAAA', trazos: [TRAZO] } }, ahora);

    expect(c).toMatchObject({ consorcioId: 'c1', horaDispositivo: '2026-11-17T13:00:00.000Z' });
    expect(c.equipos.map((e) => [e.maquinaId, e.tipo, e.estadoEquipo])).toEqual([['m1', 'traccion', 'en_uso'], ['m2', 'montavehiculos', 'fuera_de_servicio']]);
    expect(c.equipos[0].observaciones).toEqual({ cabina: 'ok' });
    expect(c.firma).toEqual({ nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', imagen: 'data:image/png;base64,AAAA', trazos: [TRAZO] });
    expect(c).not.toHaveProperty('sinFirma');
    const conDni = armarInforme('c1', equipos, v, { firma: { datos: { nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Propietario', dni: ' 12.345.678 ' }, imagen: 'x', trazos: [TRAZO] } }, ahora);
    expect(conDni.firma?.dni).toBe('12.345.678');
  });

  it('sin firma: trae el motivo (sin espacios) y la foto, y no la firma', () => {
    const c = armarInforme('c1', equipos, v, { sinFirma: { motivo: '  El encargado no está  ', foto: 'data:image/jpeg;base64,AAAA' } }, ahora);

    expect(c.sinFirma).toEqual({ motivo: 'El encargado no está', foto: 'data:image/jpeg;base64,AAAA' });
    expect(c).not.toHaveProperty('firma');
  });

  it('enviarInforme hace POST y devuelve el informe; si la API rechaza devuelve el motivo; un corte de red también', async () => {
    const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;
    const cuerpo = armarInforme('c1', equipos, v, { sinFirma: { motivo: 'El encargado no está', foto: 'x' } }, ahora);
    const ok = vi.fn().mockResolvedValue(respuesta(201, { id: 'I1', requiereRevision: true }));

    expect(await enviarInforme(cuerpo, ok)).toEqual({ ok: true, informe: { id: 'I1', requiereRevision: true } });
    expect(ok).toHaveBeenCalledWith('/api/informes-visita', expect.objectContaining({ method: 'POST' }));
    expect(await enviarInforme(cuerpo, vi.fn().mockResolvedValue(respuesta(400, { message: 'Datos inválidos', errores: ['La firma está vacía'] })))).toEqual({ ok: false, error: 'La firma está vacía' });
    expect(await enviarInforme(cuerpo, vi.fn().mockRejectedValue(new Error('Sin conexión')))).toEqual({ ok: false, error: 'Sin conexión' });
  });
});

// HU-17 RF-11: las fotos obligatorias del equipo (frente de cabina y, con cables de tracción, cables) se exigen para consolidar.
describe('puedeConsolidar con las fotos obligatorias (HU-17 RF-11)', () => {
  const FRENTE = claveFotoObligatoria('frente');
  const CABLES = claveFotoObligatoria('cables');

  it('un equipo en uso sin ninguna foto bloquea y dice qué fotos faltan', () => {
    const v = completa(['m1']);
    v.fotosPorEquipo.m1 = {};

    expect(puedeConsolidar([equipo('m1')], v)).toEqual({
      puede: false,
      pendientes: [{ equipo: 'M1', motivo: 'falta la foto de frente de cabina y botonera y cables de tracción' }],
    });
  });

  it('si sólo falta la de cables (o sólo la del frente), dice cuál', () => {
    const v = completa(['m1']);
    delete v.fotosPorEquipo.m1[CABLES];
    expect(puedeConsolidar([equipo('m1')], v).pendientes).toEqual([{ equipo: 'M1', motivo: 'falta la foto de cables de tracción' }]);

    v.fotosPorEquipo.m1 = fotosObligatorias('m1');
    delete v.fotosPorEquipo.m1[FRENTE];
    expect(puedeConsolidar([equipo('m1')], v).pendientes).toEqual([{ equipo: 'M1', motivo: 'falta la foto de frente de cabina y botonera' }]);
  });

  it('la foto de anomalía de otro ítem no reemplaza a las obligatorias', () => {
    const v = completa(['m1']);
    v.fotosPorEquipo.m1 = { 'cabina:puerta': { ...fotosObligatorias('m1')[FRENTE], itemId: 'puerta' } };

    expect(puedeConsolidar([equipo('m1')], v).puede).toBe(false);
  });

  it('un equipo hidráulico sólo necesita la del frente: no tiene cables de tracción', () => {
    const v = vacia({ estadoPorEquipo: { m1: 'en_uso' }, respuestasPorEquipo: { m1: respuestasCompletas('hidraulico') }, fotosPorEquipo: { m1: { [FRENTE]: fotosObligatorias('m1')[FRENTE] } } });

    expect(puedeConsolidar([equipo('m1', 'hidraulico')], v)).toEqual({ puede: true, pendientes: [] });
  });

  it('un montavehículos lleva las dos, como uno de tracción', () => {
    const v = vacia({ estadoPorEquipo: { m1: 'en_uso' }, respuestasPorEquipo: { m1: respuestasCompletas('montavehiculos') }, fotosPorEquipo: { m1: { [FRENTE]: fotosObligatorias('m1')[FRENTE] } } });

    expect(puedeConsolidar([equipo('m1', 'montavehiculos')], v).pendientes).toEqual([{ equipo: 'M1', motivo: 'falta la foto de cables de tracción' }]);
  });

  it('un equipo fuera de servicio no las necesita; si vuelve a ponerse en uso, sí', () => {
    const v = completa(['m1']);
    v.estadoPorEquipo.m2 = 'fuera_de_servicio';
    expect(puedeConsolidar([equipo('m1'), equipo('m2')], v).puede).toBe(true);

    v.estadoPorEquipo.m2 = 'en_uso';
    v.respuestasPorEquipo.m2 = respuestasCompletas('traccion');
    expect(puedeConsolidar([equipo('m1'), equipo('m2')], v).pendientes).toEqual([{ equipo: 'M2', motivo: expect.stringMatching(/falta la foto/) }]);
  });

  it('cambiar el tipo a hidráulico deja de exigir la de cables', () => {
    const v = completa(['m1']);
    v.respuestasPorEquipo.m1 = respuestasCompletas('hidraulico');
    delete v.fotosPorEquipo.m1[CABLES];
    v.tipoOverride.m1 = 'hidraulico';

    expect(puedeConsolidar([equipo('m1')], v).puede).toBe(true);
  });

  it('junto a una solapa incompleta, el motivo dice las dos cosas en una sola línea por equipo', () => {
    const v = completa(['m1']);
    delete v.respuestasPorEquipo.m1.fosa;
    v.fotosPorEquipo.m1 = {};

    const { pendientes } = puedeConsolidar([equipo('m1')], v);

    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].motivo).toBe('faltan completar: Fosa · falta la foto de frente de cabina y botonera y cables de tracción');
  });
});

describe('armarInforme con las fotos obligatorias (HU-17 RF-11)', () => {
  const cierre = { sinFirma: { motivo: 'El encargado no está', foto: 'data:image/jpeg;base64,AAAA' } };

  it('el informe lleva las fotos obligatorias de cada equipo con la clave reservada', () => {
    const v = completa(['m1']);

    const cuerpo = armarInforme('c1', [equipo('m1')], v, cierre);

    expect(Object.keys(cuerpo.equipos[0].fotos).sort()).toEqual([claveFotoObligatoria('cables'), claveFotoObligatoria('frente')]);
    expect(cuerpo.equipos[0].fotos[claveFotoObligatoria('frente')]).toMatchObject({ itemId: 'obligatoria:frente', maquinaId: 'm1', dataUrl: 'data:image/jpeg;base64,AAAA' });
  });

  it('si el RT sacó la de cables y después cambió el tipo a hidráulico, esa foto no viaja', () => {
    const v = completa(['m1']);
    v.tipoOverride.m1 = 'hidraulico';

    const cuerpo = armarInforme('c1', [equipo('m1')], v, cierre);

    expect(cuerpo.equipos[0].tipo).toBe('hidraulico');
    expect(Object.keys(cuerpo.equipos[0].fotos)).toEqual([claveFotoObligatoria('frente')]);
  });
});

describe('selloCorto (HU-18 RNF-01)', () => {
  it('muestra los primeros 12 caracteres del SHA-256 y puntos suspensivos', () => {
    expect(selloCorto('3fa9c1d2e7b4' + 'a'.repeat(52))).toBe('3fa9c1d2e7b4…');
  });
  it('sin sello, o con algo que no es un SHA-256, no muestra nada', () => {
    for (const mal of [null, undefined, '', 'abc', 'g'.repeat(64), 'a'.repeat(63), 'A'.repeat(64)]) expect(selloCorto(mal)).toBe('');
  });
});
