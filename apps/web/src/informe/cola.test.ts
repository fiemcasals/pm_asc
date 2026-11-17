import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CuerpoInforme, armarInforme, nuevoIdInforme } from './consolidacion';
import {
  ERROR_SIN_GUARDAR,
  type AlmacenCola,
  type EventoCola,
  type ItemCola,
  alCambiarCola,
  almacenEnMemoria,
  cerrarInforme,
  descartarRechazado,
  enviarCola,
  enviarUno,
  fechaCorta,
  iniciarAutoSync,
  resumirCola,
  textoSinSubir,
} from './cola';

// HU-18 RNF-02 — Cola de sincronización: guardar primero, subir después, reintentar sin duplicar ni perder fotos.

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD-FOTO-DE-LA-ANOMALIA';
const informe = (id: string, extra: Record<string, unknown> = {}): CuerpoInforme =>
  ({
    clientReportId: id, consorcioId: 'c1', horaDispositivo: '2026-11-17T13:00:00.000Z',
    equipos: [{ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: {}, observaciones: { cabina: 'golpe' }, fotos: { f1: { dataUrl: FOTO } } }],
    firma: { nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', imagen: 'data:image/png;base64,AAAA', trazos: [[[1, 2], [3, 4]]] }, ...extra,
  }) as unknown as CuerpoInforme;

type Modo = 'ok' | 'sin-red' | 'respuesta-perdida' | 'cuerpo-roto' | 'revocada' | number;

/** Una API de mentira que se comporta como la real: 201 la primera vez, 200 con el original si el identificador ya estaba. */
function crearApi() {
  const guardados = new Map<string, { id: string; requiereRevision: boolean; hashSha256: string }>();
  const posts: CuerpoInforme[] = [];
  const api = {
    modo: 'ok' as Modo, guardados, posts, enCurso: 0, maxEnParalelo: 0, demora: 0,
    alRecibir: undefined as ((c: CuerpoInforme) => void) | undefined,
    enviar: async (_url: string, init?: RequestInit): Promise<Response> => {
      const c = JSON.parse(init?.body as string) as CuerpoInforme;
      posts.push(c);
      api.alRecibir?.(c);
      api.enCurso++;
      api.maxEnParalelo = Math.max(api.maxEnParalelo, api.enCurso);
      try {
        if (api.demora) await new Promise((r) => setTimeout(r, api.demora));
        if (api.modo === 'sin-red') throw new TypeError('Failed to fetch');
        if (api.modo === 'revocada') throw Object.assign(new Error('Tu sesión fue cerrada por un Administrador.'), { name: 'SesionRevocadaError' });
        if (typeof api.modo === 'number') return new Response(JSON.stringify(api.modo === 400 ? { errores: ['equipos: falta el equipo M2'] } : { message: 'x' }), { status: api.modo });
        const id = c.clientReportId as string;
        const previo = guardados.get(id);
        const g = previo ?? { id: `inf-${guardados.size + 1}`, requiereRevision: false, hashSha256: 'a'.repeat(64) };
        guardados.set(id, g);
        if (api.modo === 'respuesta-perdida') throw new TypeError('Failed to fetch'); // la API guardó, pero la respuesta no llegó
        if (api.modo === 'cuerpo-roto') return new Response('<html>cortado', { status: 201 });
        return new Response(JSON.stringify(g), { status: previo ? 200 : 201 });
      } finally {
        api.enCurso--;
      }
    },
  };
  return api;
}

const deps = (api: ReturnType<typeof crearApi>, almacen: AlmacenCola, usuario = 'rt.ana') => ({ usuario, almacen, enviar: api.enviar });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('nuevoIdInforme: el identificador que se genera en el celular (criterio 3)', () => {
  const REGEX_API = /^[A-Za-z0-9_-]{8,100}$/;

  it('cumple el formato que acepta la API y no se repite', () => {
    const ids = new Set(Array.from({ length: 500 }, () => nuevoIdInforme()));

    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(REGEX_API);
  });
  it('si el celular no tiene randomUUID (página sin https) usa números aleatorios del sistema', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.map((_, i) => i * 7 + 1) });

    expect(nuevoIdInforme()).toMatch(REGEX_API);
  });
  it('y si tampoco hay crypto, igual genera uno válido y distinto cada vez', () => {
    vi.stubGlobal('crypto', undefined);

    const a = nuevoIdInforme();
    const b = nuevoIdInforme();

    expect(a).toMatch(REGEX_API);
    expect(a).not.toBe(b);
  });
  it('armarInforme lo lleva en el cuerpo: el que le pasan o uno nuevo; mismo cierre, mismo identificador', () => {
    const cierre = { sinFirma: { motivo: 'El encargado no está', foto: 'x' } };
    const v = { estadoPorEquipo: {}, respuestasPorEquipo: {}, obsPorEquipo: {}, fotosPorEquipo: {}, tipoOverride: {} };
    const eq = [{ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion' as const }];

    expect(armarInforme('c1', eq as never, v, cierre, new Date(), 'mi-identificador-1').clientReportId).toBe('mi-identificador-1');
    const a = armarInforme('c1', eq as never, v, cierre);
    const b = armarInforme('c1', eq as never, v, cierre);
    expect(a.clientReportId).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(a.clientReportId).not.toBe(b.clientReportId);
  });
});

describe('enviarUno: qué se reintenta y qué no (criterios 4 y 5)', () => {
  const resp = (status: number, body: unknown = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  const con = (r: Response | Error) => async () => {
    if (r instanceof Error) throw r;
    return r;
  };

  it.each([[201], [200]])('%i es enviado (200 es el reenvío de uno que la API ya tenía)', async (status) => {
    const r = await enviarUno(informe('informe-0001'), con(resp(status, { id: 'inf-1', requiereRevision: false })));

    expect(r).toEqual({ tipo: 'enviado', informe: { id: 'inf-1', requiereRevision: false } });
  });
  it('un corte de señal es reintentable por red', async () => {
    expect(await enviarUno(informe('informe-0001'), con(new TypeError('Failed to fetch')))).toMatchObject({ tipo: 'reintentable', motivo: 'red' });
  });
  it('la sesión revocada es reintentable por sesión (queda guardado hasta volver a ingresar)', async () => {
    const e = Object.assign(new Error('Tu sesión fue cerrada'), { name: 'SesionRevocadaError' });

    expect(await enviarUno(informe('informe-0001'), con(e))).toMatchObject({ tipo: 'reintentable', motivo: 'sesion', error: 'Tu sesión fue cerrada' });
  });
  it('401 (la sesión venció y no se pudo renovar) es reintentable por sesión', async () => {
    expect(await enviarUno(informe('informe-0001'), con(resp(401, { message: 'Unauthorized' })))).toMatchObject({ tipo: 'reintentable', motivo: 'sesion' });
  });
  it.each([[500], [502], [503], [504], [408], [425], [429]])('%i es reintentable por el servidor', async (status) => {
    expect(await enviarUno(informe('informe-0001'), con(resp(status)))).toMatchObject({ tipo: 'reintentable', motivo: 'servidor' });
  });
  it.each([[400], [403], [404], [409], [413], [422]])('%i es rechazo definitivo con el motivo del servidor', async (status) => {
    expect(await enviarUno(informe('informe-0001'), con(resp(status, { errores: ['falta algo'] })))).toEqual({ tipo: 'rechazado', error: 'falta algo' });
  });
  it('el motivo del rechazo sale de errores, de message (texto o lista) o, si no hay cuerpo, del código', async () => {
    expect(await enviarUno(informe('informe-0001'), con(resp(404, { message: 'Edificio no encontrado' })))).toEqual({ tipo: 'rechazado', error: 'Edificio no encontrado' });
    expect(await enviarUno(informe('informe-0001'), con(resp(400, { message: ['a', 'b'] })))).toEqual({ tipo: 'rechazado', error: 'a · b' });
    expect(await enviarUno(informe('informe-0001'), con(resp(403, '<html>')))).toEqual({ tipo: 'rechazado', error: 'El servidor lo rechazó (error 403)' });
  });
  it('una respuesta exitosa que llega cortada no se da por enviada: se reenvía y la API devuelve el original', async () => {
    expect(await enviarUno(informe('informe-0001'), con(resp(201, '<html>cortado')))).toMatchObject({ tipo: 'reintentable', motivo: 'red' });
  });
  it('manda el informe tal cual, con su identificador, por POST a /api/informes-visita', async () => {
    const enviar = vi.fn(con(resp(201, { id: 'x' })));

    await enviarUno(informe('informe-0001'), enviar);

    expect(enviar).toHaveBeenCalledWith('/api/informes-visita', expect.objectContaining({ method: 'POST' }));
    const [, init] = enviar.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(informe('informe-0001'));
  });
});

describe('cerrarInforme: guardar primero, subir después (criterios 1 y 4)', () => {
  it('con señal y la API contenta: se sube y no queda nada en la cola', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();

    const r = await cerrarInforme({ ...deps(api, almacen), cuerpo: informe('informe-0001'), enLinea: true });

    expect(r).toMatchObject({ estado: 'enviado', informe: { id: 'inf-1' } });
    expect(almacen.items.size).toBe(0);
    expect(api.posts).toHaveLength(1);
  });

  it('sin señal: queda guardado en el celular con todo (fotos, firma, hora) y ni siquiera intenta enviar', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();

    const r = await cerrarInforme({ ...deps(api, almacen), cuerpo: informe('informe-0001'), enLinea: false, ahora: new Date('2026-11-17T13:05:00.000Z') });

    expect(r).toEqual({ estado: 'encolado' });
    expect(api.posts).toHaveLength(0);
    expect(almacen.items.get('informe-0001')).toEqual({
      clientReportId: 'informe-0001', usuario: 'rt.ana', cuerpo: informe('informe-0001'), creadoEn: '2026-11-17T13:05:00.000Z', estado: 'pendiente',
    });
  });

  it('ya está guardado cuando sale el pedido: si se cierra la app a mitad del envío, el informe no se pierde', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    let estabaGuardado = false;
    api.alRecibir = (c) => (estabaGuardado = almacen.items.has(c.clientReportId as string));

    await cerrarInforme({ ...deps(api, almacen), cuerpo: informe('informe-0001'), enLinea: true });

    expect(estabaGuardado).toBe(true);
  });

  it('el envío se corta (sin red): queda encolado con las fotos intactas y el mismo identificador', async () => {
    const api = crearApi();
    api.modo = 'sin-red';
    const almacen = almacenEnMemoria();

    const r = await cerrarInforme({ ...deps(api, almacen), cuerpo: informe('informe-0001'), enLinea: true });

    expect(r).toEqual({ estado: 'encolado' });
    const guardado = almacen.items.get('informe-0001')!;
    expect(guardado.estado).toBe('pendiente');
    expect(guardado.cuerpo).toEqual(informe('informe-0001'));
    expect(JSON.stringify(guardado.cuerpo)).toContain(FOTO);
  });

  it('el servidor falla (500): queda encolado, no se pierde', async () => {
    const api = crearApi();
    api.modo = 500;
    const almacen = almacenEnMemoria();

    expect(await cerrarInforme({ ...deps(api, almacen), cuerpo: informe('informe-0001'), enLinea: true })).toEqual({ estado: 'encolado' });
    expect(almacen.items.size).toBe(1);
  });

  it('el servidor lo rechaza (400): se muestra el motivo para corregirlo y no queda en la cola', async () => {
    const api = crearApi();
    api.modo = 400;
    const almacen = almacenEnMemoria();

    const r = await cerrarInforme({ ...deps(api, almacen), cuerpo: informe('informe-0001'), enLinea: true });

    expect(r).toEqual({ estado: 'rechazado', error: 'equipos: falta el equipo M2' });
    expect(almacen.items.size).toBe(0);
  });

  it('la API guardó el informe pero la respuesta se perdió: se reintenta con el mismo identificador y queda uno solo', async () => {
    const api = crearApi();
    api.modo = 'respuesta-perdida';
    const almacen = almacenEnMemoria();
    expect(await cerrarInforme({ ...deps(api, almacen), cuerpo: informe('informe-0001'), enLinea: true })).toEqual({ estado: 'encolado' });
    expect(api.guardados.size).toBe(1);

    api.modo = 'ok';
    const sync = await enviarCola(deps(api, almacen));

    expect(sync.enviados).toBe(1);
    expect(api.guardados.size).toBe(1);
    expect(api.posts.map((p) => p.clientReportId)).toEqual(['informe-0001', 'informe-0001']);
    expect(almacen.items.size).toBe(0);
  });

  it('no se puede guardar en el celular pero hay señal: se sube igual', async () => {
    const api = crearApi();
    const roto: AlmacenCola = { guardar: async () => Promise.reject(new Error('cuota llena')), listar: async () => [], eliminar: async () => undefined };

    expect(await cerrarInforme({ ...deps(api, roto), cuerpo: informe('informe-0001'), enLinea: true })).toMatchObject({ estado: 'enviado' });
  });

  it('no se puede guardar y no hay señal: avisa que el informe no está a salvo (no lo da por guardado)', async () => {
    const api = crearApi();
    const roto: AlmacenCola = { guardar: async () => Promise.reject(new Error('cuota llena')), listar: async () => [], eliminar: async () => undefined };

    expect(await cerrarInforme({ ...deps(api, roto), cuerpo: informe('informe-0001'), enLinea: false })).toEqual({ estado: 'error', error: ERROR_SIN_GUARDAR });
  });

  it('no se puede guardar, hay señal pero el envío falla: avisa que no quedó a salvo para que el RT reintente', async () => {
    const api = crearApi();
    api.modo = 'sin-red';
    const roto: AlmacenCola = { guardar: async () => Promise.reject(new Error('cuota llena')), listar: async () => [], eliminar: async () => undefined };

    expect(await cerrarInforme({ ...deps(api, roto), cuerpo: informe('informe-0001'), enLinea: true })).toEqual({ estado: 'error', error: ERROR_SIN_GUARDAR });
  });

  it('un informe sin identificador no se acepta: sin él no se podría evitar el duplicado', async () => {
    const sinId = informe('informe-0001');
    delete sinId.clientReportId;

    await expect(cerrarInforme({ ...deps(crearApi(), almacenEnMemoria()), cuerpo: sinId, enLinea: true })).rejects.toThrow(/identificador/);
  });
});

describe('enviarCola: se vacía sola cuando se puede (criterios 2, 4 y 5)', () => {
  const encolar = async (almacen: AlmacenCola, id: string, creadoEn: string, usuario = 'rt.ana', extra: Partial<ItemCola> = {}) =>
    almacen.guardar({ clientReportId: id, usuario, cuerpo: informe(id), creadoEn, estado: 'pendiente', ...extra });

  it('vuelve la señal: manda todo lo pendiente en el orden en que se cerró y deja la cola vacía', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0003', '2026-11-17T15:00:00.000Z');
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    await encolar(almacen, 'informe-0002', '2026-11-17T14:00:00.000Z');

    const r = await enviarCola(deps(api, almacen));

    expect(api.posts.map((p) => p.clientReportId)).toEqual(['informe-0001', 'informe-0002', 'informe-0003']);
    expect(r).toMatchObject({ enviados: 3, pendientes: 0, rechazados: 0 });
    expect(almacen.items.size).toBe(0);
  });

  it('sin señal no se pierde nada: todo sigue en la cola, se corta en el primero y se avisa por qué', async () => {
    const api = crearApi();
    api.modo = 'sin-red';
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    await encolar(almacen, 'informe-0002', '2026-11-17T14:00:00.000Z');

    const r = await enviarCola(deps(api, almacen));

    expect(api.posts).toHaveLength(1);
    expect(r).toMatchObject({ enviados: 0, pendientes: 2, error: 'Sin conexión con el servidor.' });
    expect([...almacen.items.values()].map((i) => i.estado)).toEqual(['pendiente', 'pendiente']);
  });

  it('un corte en el medio: lo que ya se subió sale de la cola y lo que falta se reintenta después, sin repetir lo enviado', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    await encolar(almacen, 'informe-0002', '2026-11-17T14:00:00.000Z');
    await encolar(almacen, 'informe-0003', '2026-11-17T15:00:00.000Z');
    let n = 0;
    const cortaAlSegundo = async (url: string, init?: RequestInit) => (++n === 2 ? Promise.reject(new TypeError('Failed to fetch')) : api.enviar(url, init));

    const primera = await enviarCola({ ...deps(api, almacen), enviar: cortaAlSegundo });
    expect(primera).toMatchObject({ enviados: 1, pendientes: 2 });
    const segunda = await enviarCola(deps(api, almacen));

    expect(segunda).toMatchObject({ enviados: 2, pendientes: 0 });
    expect(api.guardados.size).toBe(3);
    // El pedido cortado del segundo nunca llegó a la API; el primero no se vuelve a mandar.
    expect(api.posts.map((p) => p.clientReportId)).toEqual(['informe-0001', 'informe-0002', 'informe-0003']);
  });

  it('reintentar muchas veces el mismo informe no lo duplica y siempre manda el mismo cuerpo (criterio 3)', async () => {
    const api = crearApi();
    api.modo = 'respuesta-perdida';
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');

    for (let i = 0; i < 4; i++) await enviarCola(deps(api, almacen));
    api.modo = 'ok';
    await enviarCola(deps(api, almacen));

    expect(api.posts).toHaveLength(5);
    expect(new Set(api.posts.map((p) => JSON.stringify(p))).size).toBe(1);
    expect(api.guardados.size).toBe(1);
    expect(almacen.items.size).toBe(0);
  });

  it('la sesión venció (401): queda todo guardado; al volver a ingresar se envía sin pérdida (criterio 5)', async () => {
    const api = crearApi();
    api.modo = 401;
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');

    const vencida = await enviarCola(deps(api, almacen));
    expect(vencida).toMatchObject({ enviados: 0, pendientes: 1 });
    expect(vencida.error).toMatch(/sesión venció/);
    expect(almacen.items.get('informe-0001')?.estado).toBe('pendiente');

    api.modo = 'ok'; // el RT volvió a ingresar
    const trasLogin = await enviarCola(deps(api, almacen));

    expect(trasLogin).toMatchObject({ enviados: 1, pendientes: 0 });
    expect(api.guardados.get('informe-0001')).toBeDefined();
  });

  it('un Administrador revocó la sesión: el informe queda guardado y se corta el envío', async () => {
    const api = crearApi();
    api.modo = 'revocada';
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    await encolar(almacen, 'informe-0002', '2026-11-17T14:00:00.000Z');

    const r = await enviarCola(deps(api, almacen));

    expect(api.posts).toHaveLength(1);
    expect(r).toMatchObject({ enviados: 0, pendientes: 2 });
    expect(almacen.items.size).toBe(2);
  });

  it('un informe que el servidor rechaza de forma definitiva se marca, se conserva y no se reenvía solo; los demás siguen', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    await encolar(almacen, 'informe-0002', '2026-11-17T14:00:00.000Z');
    const rechazaElPrimero = async (url: string, init?: RequestInit) =>
      (JSON.parse(init?.body as string) as CuerpoInforme).clientReportId === 'informe-0001' ? new Response(JSON.stringify({ message: 'Edificio no encontrado' }), { status: 404 }) : api.enviar(url, init);

    const r = await enviarCola({ ...deps(api, almacen), enviar: rechazaElPrimero });

    expect(r).toMatchObject({ enviados: 1, pendientes: 0, rechazados: 1 });
    expect(almacen.items.get('informe-0001')).toMatchObject({ estado: 'rechazado', ultimoError: 'Edificio no encontrado' });
    expect(JSON.stringify(almacen.items.get('informe-0001')?.cuerpo)).toContain(FOTO);
    const posts = api.posts.length;
    await enviarCola(deps(api, almacen));
    expect(api.posts).toHaveLength(posts); // no se vuelve a mandar
  });

  it('un error del servidor con un informe no frena a los que siguen', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    await encolar(almacen, 'informe-0002', '2026-11-17T14:00:00.000Z');
    const fallaElPrimero = async (url: string, init?: RequestInit) =>
      (JSON.parse(init?.body as string) as CuerpoInforme).clientReportId === 'informe-0001' ? new Response('{}', { status: 500 }) : api.enviar(url, init);

    const r = await enviarCola({ ...deps(api, almacen), enviar: fallaElPrimero });

    expect(r).toMatchObject({ enviados: 1, pendientes: 1 });
    expect([...almacen.items.keys()]).toEqual(['informe-0001']);
  });

  it('sólo manda lo del usuario con la sesión abierta: lo de otro RT que usó el mismo celular espera a que ingrese él', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-ana1', '2026-11-17T13:00:00.000Z', 'rt.ana');
    await encolar(almacen, 'informe-beto', '2026-11-17T13:30:00.000Z', 'rt.beto');

    const r = await enviarCola(deps(api, almacen, 'rt.beto'));

    expect(api.posts.map((p) => p.clientReportId)).toEqual(['informe-beto']);
    expect(r).toMatchObject({ enviados: 1, pendientes: 0 });
    expect([...almacen.items.keys()]).toEqual(['informe-ana1']);
  });

  it('si en medio del envío ingresa otro usuario, se frena: no se manda con la sesión ajena', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    await encolar(almacen, 'informe-0002', '2026-11-17T14:00:00.000Z');
    const vigente = vi.fn<() => string | null>().mockReturnValueOnce('rt.ana').mockReturnValue('rt.beto');

    const r = await enviarCola({ ...deps(api, almacen), usuarioVigente: vigente });

    expect(api.posts).toHaveLength(1);
    expect(r).toMatchObject({ enviados: 1, pendientes: 1 });
  });

  it('sin sesión (el perfil se borró) no manda nada', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');

    const r = await enviarCola({ ...deps(api, almacen), usuarioVigente: () => null });

    expect(api.posts).toHaveLength(0);
    expect(r.pendientes).toBe(1);
  });

  it('nunca lanza: si falla el almacenamiento, lo informa y no rompe', async () => {
    const roto: AlmacenCola = { guardar: async () => undefined, listar: async () => Promise.reject(new Error('IndexedDB no disponible')), eliminar: async () => undefined };

    const r = await enviarCola(deps(crearApi(), roto));

    expect(r).toMatchObject({ enviados: 0, pendientes: 0 });
  });

  it('si se manda bien pero no se puede borrar de la cola, cuenta como enviado y el reenvío no duplica', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    const noBorra: AlmacenCola = { ...almacen, eliminar: async () => Promise.reject(new Error('falló')) };

    const a = await enviarCola(deps(api, noBorra));
    const b = await enviarCola(deps(api, noBorra));

    expect(a.enviados).toBe(1);
    expect(b.enviados).toBe(1);
    expect(api.guardados.size).toBe(1);
  });

  it('una sola pasada a la vez: varios disparos juntos (señal, reloj, cierre) mandan cada informe una sola vez y nunca en paralelo', async () => {
    const api = crearApi();
    api.demora = 5;
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    await encolar(almacen, 'informe-0002', '2026-11-17T14:00:00.000Z');
    await encolar(almacen, 'informe-0003', '2026-11-17T15:00:00.000Z');

    const listar = vi.spyOn(almacen, 'listar');

    await Promise.all(Array.from({ length: 6 }, () => enviarCola(deps(api, almacen))));

    expect(api.maxEnParalelo).toBe(1);
    expect(api.posts.map((p) => p.clientReportId).sort()).toEqual(['informe-0001', 'informe-0002', 'informe-0003']);
    expect(almacen.items.size).toBe(0);
    expect(listar).toHaveBeenCalledTimes(2); // los seis disparos se juntaron en una sola pasada (leer al empezar y al terminar)
  });

  it('un informe que se cierra mientras otra pasada está enviando también sale, una sola vez', async () => {
    const api = crearApi();
    api.demora = 5;
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');

    const enMarcha = enviarCola(deps(api, almacen));
    const cierre = cerrarInforme({ ...deps(api, almacen), cuerpo: informe('informe-0002'), enLinea: true });
    const [, r] = await Promise.all([enMarcha, cierre]);

    expect(r).toMatchObject({ estado: 'enviado' });
    expect(api.maxEnParalelo).toBe(1);
    expect(api.posts.map((p) => p.clientReportId).sort()).toEqual(['informe-0001', 'informe-0002']);
    expect(almacen.items.size).toBe(0);
  });

  it('avisa a la pantalla cada informe que se sube (para mostrar su sello) y cada cambio de la cola', async () => {
    const api = crearApi();
    const almacen = almacenEnMemoria();
    await encolar(almacen, 'informe-0001', '2026-11-17T13:00:00.000Z');
    const eventos: EventoCola[] = [];
    const dejar = alCambiarCola((e) => eventos.push(e));

    await enviarCola(deps(api, almacen));
    dejar();

    expect(eventos.filter((e) => e.tipo === 'enviado')).toEqual([{ tipo: 'enviado', clientReportId: 'informe-0001', informe: { id: 'inf-1', requiereRevision: false, hashSha256: 'a'.repeat(64) } }]);
    expect(eventos.some((e) => e.tipo === 'cambio')).toBe(true);
  });

  it('un oyente que falla no impide que los demás se enteren', async () => {
    const almacen = almacenEnMemoria();
    const vistos: string[] = [];
    const a = alCambiarCola(() => {
      throw new Error('boom');
    });
    const b = alCambiarCola((e) => vistos.push(e.tipo));

    await enviarCola(deps(crearApi(), almacen));
    a();
    b();

    expect(vistos).toContain('cambio');
  });
});

describe('descartarRechazado y resumen (criterio 1)', () => {
  const item = (id: string, estado: ItemCola['estado'], usuario = 'rt.ana'): ItemCola => ({ clientReportId: id, usuario, cuerpo: informe(id), creadoEn: '2026-11-17T13:00:00.000Z', estado });

  it('la fecha se muestra en 24 horas, sin año ni segundos: «17/11, 13:59» (nunca «01:59» sin decir si es de la tarde)', () => {
    const f = fechaCorta('2026-11-17T16:59:38.000Z');

    expect(f).toMatch(/^\d{2}\/\d{2}, \d{2}:\d{2}$/);
    expect(fechaCorta('2026-11-17T23:05:00.000Z')).not.toMatch(/\b(a|p)\. ?m\./i);
  });
  it('textoSinSubir: «1 inspección sin subir», «N inspecciones sin subir»', () => {
    expect(textoSinSubir(1)).toBe('1 inspección sin subir');
    expect(textoSinSubir(2)).toBe('2 inspecciones sin subir');
    expect(textoSinSubir(7)).toBe('7 inspecciones sin subir');
  });
  it('el resumen cuenta pendientes y rechazados como «sin subir», sólo del usuario con sesión', () => {
    const r = resumirCola([item('a', 'pendiente'), item('b', 'pendiente'), item('c', 'rechazado'), item('d', 'pendiente', 'rt.beto')], 'rt.ana');

    expect(r.pendientes).toBe(2);
    expect(r.rechazados.map((i) => i.clientReportId)).toEqual(['c']);
    expect(r.sinSubir).toBe(3);
  });
  it('sin nada en la cola no hay nada que mostrar (0 sin subir)', () => {
    expect(resumirCola([], 'rt.ana').sinSubir).toBe(0);
    expect(resumirCola([item('d', 'pendiente', 'rt.beto')], 'rt.ana').sinSubir).toBe(0);
  });
  it('descartar quita un rechazado, pero nunca un pendiente (todavía se tiene que subir)', async () => {
    const almacen = almacenEnMemoria();
    await almacen.guardar(item('rechazado-1', 'rechazado'));
    await almacen.guardar(item('pendiente-1', 'pendiente'));

    await descartarRechazado(almacen, 'pendiente-1');
    expect([...almacen.items.keys()]).toEqual(['rechazado-1', 'pendiente-1']);
    await descartarRechazado(almacen, 'rechazado-1');

    expect([...almacen.items.keys()]).toEqual(['pendiente-1']);
  });
});

describe('iniciarAutoSync: la cola se envía sola con la app abierta (criterio 2)', () => {
  const montar = (enLinea = true, hayPendientes = true) => {
    vi.useFakeTimers();
    const objetivo = new EventTarget();
    const estado = { enLinea, hayPendientes };
    const sincronizar = vi.fn(async () => undefined);
    const detener = iniciarAutoSync({ sincronizar, objetivo, enLinea: () => estado.enLinea, hayPendientes: () => estado.hayPendientes, intervaloMs: 30_000 });
    return { objetivo, estado, sincronizar, detener };
  };

  it('al abrir la app con señal, envía; sin señal, espera', () => {
    expect(montar(true).sincronizar).toHaveBeenCalledTimes(1);
    expect(montar(false).sincronizar).not.toHaveBeenCalled();
  });
  it('cuando vuelve la señal (evento online) envía, sin que el RT haga nada', () => {
    const { objetivo, sincronizar } = montar(false);

    objetivo.dispatchEvent(new Event('online'));

    expect(sincronizar).toHaveBeenCalledTimes(1);
  });
  it('mientras haya pendientes y señal, reintenta cada 30 segundos', () => {
    const { sincronizar } = montar(true);
    sincronizar.mockClear();

    vi.advanceTimersByTime(30_000);
    expect(sincronizar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(sincronizar).toHaveBeenCalledTimes(3);
  });
  it('no insiste si no hay pendientes ni si no hay señal', () => {
    const a = montar(true, false);
    a.sincronizar.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(a.sincronizar).not.toHaveBeenCalled();

    const b = montar(false, true);
    vi.advanceTimersByTime(120_000);
    expect(b.sincronizar).not.toHaveBeenCalled();
  });
  it('al detenerlo (se cierra la sesión o la pantalla) ya no reacciona al evento ni al reloj', () => {
    const { objetivo, sincronizar, detener } = montar(true);
    sincronizar.mockClear();

    detener();
    objetivo.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(120_000);

    expect(sincronizar).not.toHaveBeenCalled();
  });
  it('si el envío falla, no rompe el reloj ni el evento', async () => {
    vi.useFakeTimers();
    const objetivo = new EventTarget();
    const sincronizar = vi.fn(async () => Promise.reject(new Error('boom')));
    iniciarAutoSync({ sincronizar, objetivo, enLinea: () => true, hayPendientes: () => true, intervaloMs: 1000 });

    objetivo.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(3000);

    expect(sincronizar.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
