import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLORES_SEMAFORO,
  ORDEN_COLORES,
  SemaforoEdificio,
  confirmarReasignacion,
  fechaCorta,
  fechaHora,
  fetchHistorialReasignaciones,
  fetchSemaforo,
  fetchSugerencia,
  marcadoresSemaforo,
  mensajeDeError,
  textoCandidato,
} from './semaforo';

// Las llamadas autenticadas usan fetchConSesion (lleva el token de la sesión); acá delega en el fetch simulado.
vi.mock('../auth/sesion', () => ({
  fetchConSesion: (url: string, init?: RequestInit) => (globalThis.fetch as typeof fetch)(url, init),
}));

const edificio = (id: string, color: SemaforoEdificio['color'], estado: SemaforoEdificio['estado'] = 'pendiente'): SemaforoEdificio => ({
  id,
  nombre: `Edificio ${id}`,
  direccion: 'Calle 1',
  color,
  estado,
  maquinas: 2,
  maquinasInspeccionadas: estado === 'inspeccionado' ? 2 : 0,
  diaUltimaInspeccion: null,
  rtCalle: null,
});

const respuesta = (cuerpo: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => cuerpo }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la leyenda (criterio 1)', () => {
  it('tiene los tres colores, con tres colores distintos y un texto que dice cuándo corresponde cada uno', () => {
    expect(ORDEN_COLORES).toEqual(['rojo', 'amarillo', 'verde']);
    const hex = ORDEN_COLORES.map((c) => COLORES_SEMAFORO[c].hex);
    expect(new Set(hex).size).toBe(3);
    expect(COLORES_SEMAFORO.verde.significado).toContain('día 1 al 10');
    expect(COLORES_SEMAFORO.amarillo.significado).toContain('día 11 al 20');
    expect(COLORES_SEMAFORO.rojo.significado).toContain('día 21');
  });
});

describe('marcadoresSemaforo (criterios 1 y 2)', () => {
  const ubicaciones = [
    { id: 'a', ubicacion: { latitud: -34.6, longitud: -58.4 } },
    { id: 'b', ubicacion: { latitud: -34.61, longitud: -58.41 } },
    { id: 'c', ubicacion: { latitud: -34.62, longitud: -58.42 } },
  ];

  it('un pin por edificio, con el color de su semáforo', () => {
    const { marcadores } = marcadoresSemaforo(
      [edificio('a', 'rojo'), edificio('b', 'amarillo'), edificio('c', 'verde', 'inspeccionado')],
      ubicaciones,
    );

    expect(marcadores.map((m) => [m.id, m.colorNombre, m.color])).toEqual([
      ['a', 'rojo', COLORES_SEMAFORO.rojo.hex],
      ['b', 'amarillo', COLORES_SEMAFORO.amarillo.hex],
      ['c', 'verde', COLORES_SEMAFORO.verde.hex],
    ]);
    expect(marcadores[2].subtitulo).toBe('Verde: inspeccionado');
  });

  it('sólo hay marcadores de edificios: nada más puede llegar al mapa, ningún técnico', () => {
    const { marcadores } = marcadoresSemaforo([edificio('a', 'rojo')], [
      ...ubicaciones,
      { id: 'tecnico-1', ubicacion: { latitud: -34.7, longitud: -58.5 } }, // una ubicación que no es de un edificio del semáforo
    ]);

    expect(marcadores.map((m) => m.id)).toEqual(['a']);
  });

  it('los edificios sin ubicación no se dibujan pero se devuelven aparte para avisarlo', () => {
    const { marcadores, sinUbicacion } = marcadoresSemaforo([edificio('a', 'rojo'), edificio('x', 'verde')], ubicaciones);

    expect(marcadores.map((m) => m.id)).toEqual(['a']);
    expect(sinUbicacion.map((e) => e.id)).toEqual(['x']);
  });

  it('sin edificios no hay marcadores', () => {
    expect(marcadoresSemaforo([], ubicaciones)).toEqual({ marcadores: [], sinUbicacion: [] });
  });
});

describe('textos', () => {
  it('textoCandidato usa el singular con 1 y el plural con 0 o más', () => {
    expect(textoCandidato({ usuario: 'c', nombre: 'Carla', pendientes: 0 })).toBe('Carla — 0 pendientes');
    expect(textoCandidato({ usuario: 'c', nombre: 'Carla', pendientes: 1 })).toBe('Carla — 1 pendiente');
    expect(textoCandidato({ usuario: 'c', nombre: 'Carla', pendientes: 12 })).toBe('Carla — 12 pendientes');
  });

  it('fechaCorta pasa AAAA-MM-DD a DD/MM/AAAA sin correr el día por la zona horaria', () => {
    expect(fechaCorta('2026-11-25')).toBe('25/11/2026');
    expect(fechaCorta('2026-12-01')).toBe('01/12/2026');
    expect(fechaCorta('no es una fecha')).toBe('no es una fecha');
  });

  it('fechaHora devuelve DD/MM/AAAA HH:MM y deja intacto un texto que no es una fecha', () => {
    expect(fechaHora('2026-11-25T15:30:00.000Z')).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
    expect(fechaHora('basura')).toBe('basura');
  });
});

describe('mensajeDeError', () => {
  it('muestra la lista de errores de validación de la API, unidos', async () => {
    const res = respuesta({ message: 'Datos inválidos', errores: ['rtNuevo es obligatorio', 'rtAnterior es obligatorio'] }, 400);
    expect(await mensajeDeError(res, 'falló')).toBe('rtNuevo es obligatorio · rtAnterior es obligatorio');
  });

  it('si no hay lista, el message de la API (un 409 dice por qué)', async () => {
    const res = respuesta({ message: 'Sólo se puede reasignar un edificio en rojo: este está en amarillo.' }, 409);
    expect(await mensajeDeError(res, 'falló')).toBe('Sólo se puede reasignar un edificio en rojo: este está en amarillo.');
  });

  it('si el cuerpo no es JSON, el texto por defecto con el código', async () => {
    const res = { ok: false, status: 502, json: async () => { throw new Error('no json'); } } as unknown as Response;
    expect(await mensajeDeError(res, 'No se pudo')).toBe('No se pudo (error 502)');
  });
});

describe('las llamadas a la API', () => {
  it('fetchSemaforo pide /api/semaforo, con ?fecha= sólo si se eligió un día', async () => {
    const fetchSim = vi.fn().mockResolvedValue(respuesta({ edificios: [] }));
    vi.stubGlobal('fetch', fetchSim);

    await fetchSemaforo();
    await fetchSemaforo('2026-11-25');

    expect(fetchSim.mock.calls.map((c) => c[0])).toEqual(['/api/semaforo', '/api/semaforo?fecha=2026-11-25']);
  });

  it('fetchSugerencia sólo lee (GET) y lleva el id del edificio y la fecha', async () => {
    const fetchSim = vi.fn().mockResolvedValue(respuesta({ sugerido: null, candidatos: [] }));
    vi.stubGlobal('fetch', fetchSim);

    const res = await fetchSugerencia('abc', '2026-11-25');

    expect(res.ok).toBe(true);
    const [url, init] = fetchSim.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/semaforo/abc/reasignacion/sugerencia?fecha=2026-11-25');
    expect(init?.method).toBeUndefined(); // un GET: pedir la sugerencia no cambia nada
  });

  it('confirmarReasignacion es un POST con el RT anterior, el nuevo y la fecha, y devuelve el registro', async () => {
    const registro = { id: 'r1', consorcioId: 'abc', rtAnterior: 'ana', rtNuevo: 'carla', usuario: 'sec', fecha: '2026-11-25T15:00:00.000Z' };
    const fetchSim = vi.fn().mockResolvedValue(respuesta(registro, 201));
    vi.stubGlobal('fetch', fetchSim);

    const res = await confirmarReasignacion('abc', { rtAnterior: 'ana', rtNuevo: 'carla', fecha: '2026-11-25' });

    expect(res).toEqual({ ok: true, data: registro });
    const [url, init] = fetchSim.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/semaforo/abc/reasignacion');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ rtAnterior: 'ana', rtNuevo: 'carla', fecha: '2026-11-25' });
  });

  it('un 409 llega como error con el motivo de la API, sin datos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ message: 'El RT del edificio cambió: ahora es "diego".' }, 409)));

    const res = await confirmarReasignacion('abc', { rtAnterior: 'ana', rtNuevo: 'carla' });

    expect(res).toEqual({ ok: false, error: 'El RT del edificio cambió: ahora es "diego".' });
  });

  it('sin conexión devuelve el error en vez de lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    expect(await fetchHistorialReasignaciones('abc')).toEqual({ ok: false, error: 'Failed to fetch' });
  });
});
