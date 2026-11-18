import { beforeEach, describe, expect, it, vi } from 'vitest';

// HU-06 RF-06 — RT con sesión: la cola de fallas críticas del celular trabaja con la sesión y no pierde nada.
vi.mock('../auth/sesion', () => ({ fetchConSesion: vi.fn(), leerPerfil: vi.fn(() => ({ usuario: 'rt.ana' })) }));

import { fetchConSesion } from '../auth/sesion';
import { textoFallasSinEnviar } from '../informe/cola';
import { fetchChecklistConfig } from './checklist.logic';
import { obtenerChecklistParaTipo } from './checklist.config';
import {
  despacharOEncolarInformeCritico,
  esErrorDeSesion,
  esErrorPasajero,
  type PayloadInformeCriticoChecklist,
  sincronizarColaFallasCriticas,
  usuarioDeLaSesion,
} from './fallasCriticasChecklist';
import { crearIdbEnMemoria } from './idb-en-memoria';
import { encolarInformeCritico, listarColaInformesCriticos } from './offlineStore';

const sesion = vi.mocked(fetchConSesion);
const resp = (status: number, cuerpo: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD-FOTO-DE-LA-FALLA';
const payload = (id = 'rep-0001'): PayloadInformeCriticoChecklist => ({
  clientReportId: id, maquinaId: 'MAQ-CORRIENTES-M1', inspector: 'otra.persona', cablesDesgastados: true, limitadorAnulado: false,
  fallasCriticas: ['CABLES_DESGASTADOS'], observaciones: 'cables deshilachados', fotografias: [FOTO],
});
const sinRed = () => Promise.reject(new TypeError('Failed to fetch'));
const revocada = () => Promise.reject(Object.assign(new Error('Tu sesión fue cerrada'), { name: 'SesionRevocadaError' }));

beforeEach(() => {
  sesion.mockReset();
});

describe('qué es un error de sesión y qué es pasajero', () => {
  it.each([[401, true], [403, true], [400, false], [404, false], [409, false], [500, false], [429, false]])('esErrorDeSesion(%i) → %s', (status, esperado) => {
    expect(esErrorDeSesion(status)).toBe(esperado);
  });
  it.each([[500, true], [502, true], [503, true], [408, true], [425, true], [429, true], [400, false], [401, false], [403, false], [404, false]])('esErrorPasajero(%i) → %s', (status, esperado) => {
    expect(esErrorPasajero(status)).toBe(esperado);
  });
  it('el usuario de la sesión sale del perfil guardado', () => {
    expect(usuarioDeLaSesion()).toBe('rt.ana');
  });
  it('textoFallasSinEnviar: singular y plural', () => {
    expect(textoFallasSinEnviar(1)).toBe('1 falla crítica sin enviar');
    expect(textoFallasSinEnviar(3)).toBe('3 fallas críticas sin enviar');
  });
});

describe('cargar una falla crítica con la sesión (criterio 4)', () => {
  it('con sesión y señal se manda con fetchConSesion (nunca con fetch sin sesión) y no queda nada en la cola', async () => {
    const idb = crearIdbEnMemoria();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no se debe usar fetch sin sesión'))));
    sesion.mockResolvedValue(resp(201, { informe: { id: 'INF-1' }, eventoEmitido: true }));

    const r = await despacharOEncolarInformeCritico({ payload: payload(), enLinea: true, idbFactory: idb });

    expect(r).toMatchObject({ estado: 'enviado', informeId: 'INF-1', eventoEmitido: true, pendientesEnCola: 0 });
    expect(sesion).toHaveBeenCalledTimes(1);
    expect(sesion.mock.calls[0][0]).toBe('/api/fallas-criticas/informes');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([[401], [403]])('con %i (la sesión venció o no alcanza) NO se pierde: queda guardada con las fotos, a nombre de quien la cargó, y se avisa que es por la sesión', async (status) => {
    const idb = crearIdbEnMemoria();
    sesion.mockResolvedValue(resp(status));

    const r = await despacharOEncolarInformeCritico({ payload: payload(), enLinea: true, idbFactory: idb });

    expect(r).toMatchObject({ estado: 'encolado', motivoEncolado: 'sesion', pendientesEnCola: 1 });
    const [guardada] = await listarColaInformesCriticos(idb);
    expect(guardada).toMatchObject({ clientReportId: 'rep-0001', usuario: 'rt.ana', payload: payload() });
    expect(JSON.stringify(guardada.payload)).toContain(FOTO);
  });

  it('una sesión revocada por un Administrador también la deja guardada, por la sesión', async () => {
    const idb = crearIdbEnMemoria();
    sesion.mockImplementation(revocada);

    const r = await despacharOEncolarInformeCritico({ payload: payload(), enLinea: true, idbFactory: idb });

    expect(r).toMatchObject({ estado: 'encolado', motivoEncolado: 'sesion' });
    expect(await listarColaInformesCriticos(idb)).toHaveLength(1);
  });

  it.each([[500], [503], [408], [429]])('un error pasajero (%i) la deja guardada, por la señal', async (status) => {
    const idb = crearIdbEnMemoria();
    sesion.mockResolvedValue(resp(status));

    expect(await despacharOEncolarInformeCritico({ payload: payload(), enLinea: true, idbFactory: idb })).toMatchObject({ estado: 'encolado', motivoEncolado: 'sin-senal' });
  });

  it('sin señal (corte o sin conexión) se guarda sin intentar mandar', async () => {
    const idb = crearIdbEnMemoria();
    sesion.mockImplementation(sinRed);

    const conCorte = await despacharOEncolarInformeCritico({ payload: payload('rep-a'), enLinea: true, idbFactory: idb });
    const sinConexion = await despacharOEncolarInformeCritico({ payload: payload('rep-b'), enLinea: false, idbFactory: idb });

    expect(conCorte).toMatchObject({ estado: 'encolado', motivoEncolado: 'sin-senal' });
    expect(sinConexion).toMatchObject({ estado: 'encolado', motivoEncolado: 'sin-senal', pendientesEnCola: 2 });
    expect(sesion).toHaveBeenCalledTimes(1);
  });

  it.each([[400], [404], [409], [422]])('un rechazo definitivo (%i) se informa y no se guarda: reintentar no lo arregla', async (status) => {
    const idb = crearIdbEnMemoria();
    sesion.mockResolvedValue(resp(status));

    await expect(despacharOEncolarInformeCritico({ payload: payload(), enLinea: true, idbFactory: idb })).rejects.toThrow(`HTTP ${status}`);
    expect(await listarColaInformesCriticos(idb)).toEqual([]);
  });

  it('sin perfil guardado (nadie con sesión) la falla se guarda igual, sin dueño', async () => {
    const idb = crearIdbEnMemoria();
    sesion.mockResolvedValue(resp(401));

    await despacharOEncolarInformeCritico({ payload: payload(), enLinea: true, idbFactory: idb, usuario: null });

    expect((await listarColaInformesCriticos(idb))[0].usuario).toBeUndefined();
  });
});

describe('la cola se manda con la sesión y no pierde nada (criterio 4)', () => {
  const encolar = async (idb: IDBFactory, id: string, usuario?: string) =>
    encolarInformeCritico({ clientReportId: id, ...(usuario ? { usuario } : {}), payload: payload(id), creadoEn: '2026-11-18T10:00:00.000Z', intentos: 0 }, idb);
  const ids = async (idb: IDBFactory) => (await listarColaInformesCriticos(idb)).map((i) => i.clientReportId).sort();

  it('se manda con fetchConSesion por defecto y vacía la cola', async () => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-1', 'rt.ana');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no se debe usar fetch sin sesión'))));
    sesion.mockResolvedValue(resp(201, { informe: { id: 'INF-1' } }));

    const r = await sincronizarColaFallasCriticas(idb);

    expect(r).toEqual({ enviados: 1, pendientes: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([[401], [403]])('con %i corta en el primero y deja TODO guardado (no descarta ninguna)', async (status) => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-1', 'rt.ana');
    await encolar(idb, 'rep-2', 'rt.ana');
    const enviar = vi.fn(async () => resp(status));

    const r = await sincronizarColaFallasCriticas(idb, enviar, 'rt.ana', () => 'rt.ana');

    expect(r).toEqual({ enviados: 0, pendientes: 2 });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await ids(idb)).toEqual(['rep-1', 'rep-2']);
  });

  it('sesión vencida → vuelve a ingresar → se mandan sin perder ninguna (con las fotos)', async () => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-1', 'rt.ana');
    await encolar(idb, 'rep-2', 'rt.ana');

    const vencida = await sincronizarColaFallasCriticas(idb, async () => resp(401), 'rt.ana', () => 'rt.ana');
    const cuerpos: string[] = [];
    const alIngresar = await sincronizarColaFallasCriticas(idb, async (_u, init) => (cuerpos.push(String(init?.body)), resp(201, {})), 'rt.ana', () => 'rt.ana');

    expect(vencida).toEqual({ enviados: 0, pendientes: 2 });
    expect(alIngresar).toEqual({ enviados: 2, pendientes: 0 });
    expect(cuerpos).toHaveLength(2);
    expect(cuerpos.every((c) => c.includes(FOTO))).toBe(true);
  });

  it.each([[500], [503], [408], [425], [429]])('un error pasajero (%i) con una no frena a las demás y la deja guardada', async (status) => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-1', 'rt.ana');
    await encolar(idb, 'rep-2', 'rt.ana');
    const enviar = vi.fn(async (_u: string, init?: RequestInit) => (String(init?.body).includes('rep-1') ? resp(status) : resp(201)));

    const r = await sincronizarColaFallasCriticas(idb, enviar, 'rt.ana', () => 'rt.ana');

    expect(r).toEqual({ enviados: 1, pendientes: 1 });
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(await ids(idb)).toEqual(['rep-1']);
  });

  it.each([[400], [404], [422]])('un rechazo definitivo (%i) se saca de la cola (no cicla) y sigue con las demás', async (status) => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-1', 'rt.ana');
    await encolar(idb, 'rep-2', 'rt.ana');
    const enviar = vi.fn(async (_u: string, init?: RequestInit) => (String(init?.body).includes('rep-1') ? resp(status) : resp(201)));

    const r = await sincronizarColaFallasCriticas(idb, enviar, 'rt.ana', () => 'rt.ana');

    expect(r).toEqual({ enviados: 1, pendientes: 0 });
    expect(await ids(idb)).toEqual([]);
  });

  it('sin señal queda todo guardado', async () => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-1', 'rt.ana');

    const r = await sincronizarColaFallasCriticas(idb, sinRed, 'rt.ana', () => 'rt.ana');

    expect(r).toEqual({ enviados: 0, pendientes: 1 });
  });

  it('cada RT manda lo suyo: lo de otro RT del mismo celular espera a que ingrese él (el inspector sale de la sesión)', async () => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-ana', 'rt.ana');
    await encolar(idb, 'rep-beto', 'rt.beto');
    const enviados: string[] = [];
    const enviar = async (_u: string, init?: RequestInit) => (enviados.push(JSON.parse(String(init?.body)).clientReportId), resp(201));

    const r = await sincronizarColaFallasCriticas(idb, enviar, 'rt.beto', () => 'rt.beto');

    expect(enviados).toEqual(['rep-beto']);
    expect(r).toEqual({ enviados: 1, pendientes: 1 });
    expect(await ids(idb)).toEqual(['rep-ana']);
  });

  it('las que se guardaron antes de esta versión (sin dueño) las manda quien tiene la sesión abierta', async () => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-vieja');
    await encolar(idb, 'rep-ana', 'rt.ana');

    const r = await sincronizarColaFallasCriticas(idb, async () => resp(201), 'rt.beto', () => 'rt.beto');

    expect(r).toEqual({ enviados: 1, pendientes: 1 });
    expect(await ids(idb)).toEqual(['rep-ana']);
  });

  it('sin sesión (nadie ingresó) sólo se mandan las que no tienen dueño', async () => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-vieja');
    await encolar(idb, 'rep-ana', 'rt.ana');

    await sincronizarColaFallasCriticas(idb, async () => resp(201), null, () => null);

    expect(await ids(idb)).toEqual(['rep-ana']);
  });

  it('si en medio del envío ingresa otro usuario, se frena: no se manda con la sesión ajena', async () => {
    const idb = crearIdbEnMemoria();
    await encolar(idb, 'rep-1', 'rt.ana');
    await encolar(idb, 'rep-2', 'rt.ana');
    const vigente = vi.fn<() => string | null>().mockReturnValueOnce('rt.ana').mockReturnValue('rt.beto');
    const enviar = vi.fn(async () => resp(201));

    const r = await sincronizarColaFallasCriticas(idb, enviar, 'rt.ana', vigente);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ enviados: 1, pendientes: 1 });
  });
});

describe('la configuración del checklist se pide con la sesión (criterio 5)', () => {
  const respaldo = obtenerChecklistParaTipo('traccion');

  it('con sesión y red se usa lo que devuelve la API (pedido con fetchConSesion, nunca con fetch sin sesión)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no se debe usar fetch sin sesión'))));
    const deLaApi = { ...respaldo, version: 'de-la-api' };
    sesion.mockResolvedValue(resp(200, deLaApi));

    const cfg = await fetchChecklistConfig('traccion');

    expect(cfg).toEqual(deLaApi);
    expect(sesion.mock.calls[0][0]).toBe('/api/checklist/config?tipo=traccion');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([[401], [403], [500]])('si la API responde %i, sigue con el respaldo local', async (status) => {
    sesion.mockResolvedValue(resp(status));

    expect(await fetchChecklistConfig('traccion')).toEqual(respaldo);
  });

  it('sin red o con la sesión revocada, sigue con el respaldo local', async () => {
    sesion.mockImplementationOnce(sinRed);
    expect(await fetchChecklistConfig('traccion')).toEqual(respaldo);
    sesion.mockImplementationOnce(revocada);
    expect(await fetchChecklistConfig('traccion')).toEqual(respaldo);
  });

  it('una respuesta sin solapas se descarta y se usa el respaldo', async () => {
    sesion.mockResolvedValue(resp(200, { version: 'x', solapas: [] }));

    expect(await fetchChecklistConfig('traccion')).toEqual(respaldo);
  });
});
