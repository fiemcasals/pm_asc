import { describe, expect, it, vi } from 'vitest';
import { claveDeFoto, crearCacheDeFotos, esRutaDeFotoDeParada } from './memoriaDeFotos';

// HU-17 RF-12: la foto de la alerta se pide aparte, una sola vez, y no se mezcla entre usuarios.
const blob = (texto: string) => new Blob([texto], { type: 'image/jpeg' });
const RUTA_A = '/api/paradas/PAR-0b9f8f0e-1111-4222-8333-444455556666/foto';
const RUTA_B = '/api/paradas/PAR-9c1d2e3f-aaaa-4bbb-8ccc-ddddeeeeffff/foto';

describe('esRutaDeFotoDeParada', () => {
  it('reconoce la ruta de la foto de un reporte', () => {
    expect(esRutaDeFotoDeParada(RUTA_A)).toBe(true);
  });
  it.each([
    undefined,
    null,
    '',
    'https://storage.nuestrocamino.cloud/fotos/cabina-trabada-default.jpg',
    'data:image/jpeg;base64,AAAA',
    '/api/paradas/PAR-1/foto/otra',
    '/api/paradas//foto',
    '/api/paradas/PAR-1/confirmar',
    '/api/chat/mensajes/0b9f8f0e-1111-4222-8333-444455556666/foto',
    '/api/paradas/../../etc/foto',
  ])('no toma por ruta de foto: %s', (ruta) => {
    expect(esRutaDeFotoDeParada(ruta as string | null | undefined)).toBe(false);
  });
});

describe('crearCacheDeFotos', () => {
  const armar = (maximo?: number) => {
    const pedir = vi.fn(async (ruta: string) => blob(ruta));
    const crearUrl = vi.fn((b: Blob) => `blob:${b.size}`);
    const soltarUrl = vi.fn();
    return { pedir, crearUrl, soltarUrl, cache: crearCacheDeFotos(pedir, crearUrl, soltarUrl, maximo) };
  };

  it('pide la foto una sola vez aunque se la pida muchas veces, también si los pedidos llegan juntos', async () => {
    const { pedir, cache } = armar();

    const urls = await Promise.all([cache.obtener('u|a', RUTA_A), cache.obtener('u|a', RUTA_A), cache.obtener('u|a', RUTA_A)]);
    await cache.obtener('u|a', RUTA_A);

    expect(pedir).toHaveBeenCalledTimes(1);
    expect(new Set(urls).size).toBe(1);
    expect(cache.cantidad()).toBe(1);
  });

  it('cada foto se pide por separado', async () => {
    const { pedir, cache } = armar();

    await cache.obtener('u|a', RUTA_A);
    await cache.obtener('u|b', RUTA_B);

    expect(pedir.mock.calls.map((c) => c[0])).toEqual([RUTA_A, RUTA_B]);
  });

  it('si el pedido falla, no queda guardado: la próxima vez se vuelve a intentar', async () => {
    const pedir = vi.fn().mockRejectedValueOnce(new Error('sin señal')).mockResolvedValue(blob('ok'));
    const cache = crearCacheDeFotos(pedir, () => 'blob:ok', vi.fn());

    await expect(cache.obtener('u|a', RUTA_A)).rejects.toThrow('sin señal');
    expect(cache.cantidad()).toBe(0);
    await expect(cache.obtener('u|a', RUTA_A)).resolves.toBe('blob:ok');
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('guarda como mucho `maximo` fotos: suelta la más vieja y libera su dirección', async () => {
    const { cache, soltarUrl, crearUrl } = armar(2);

    await cache.obtener('u|1', '/api/paradas/PAR-1/foto');
    await cache.obtener('u|2', '/api/paradas/PAR-2/foto');
    await cache.obtener('u|3', '/api/paradas/PAR-3/foto');
    await Promise.resolve();

    expect(cache.cantidad()).toBe(2);
    expect(soltarUrl).toHaveBeenCalledTimes(1);
    expect(soltarUrl).toHaveBeenCalledWith(crearUrl.mock.results[0].value);
  });

  it('vaciar suelta todas las direcciones', async () => {
    const { cache, soltarUrl } = armar();
    await cache.obtener('u|1', '/api/paradas/PAR-1/foto');
    await cache.obtener('u|2', '/api/paradas/PAR-2/foto');

    cache.vaciar();
    await Promise.resolve();

    expect(cache.cantidad()).toBe(0);
    expect(soltarUrl).toHaveBeenCalledTimes(2);
  });

  it('la foto que bajó un usuario no se le muestra a otro: la clave incluye al usuario', async () => {
    const { pedir, cache } = armar();

    await cache.obtener(claveDeFoto(RUTA_A, 'eca.uno'), RUTA_A);
    await cache.obtener(claveDeFoto(RUTA_A, 'eca.dos'), RUTA_A);

    expect(pedir).toHaveBeenCalledTimes(2);
    expect(claveDeFoto(RUTA_A, 'eca.uno')).not.toBe(claveDeFoto(RUTA_A, 'eca.dos'));
    expect(claveDeFoto(RUTA_A, null)).toBe(`|${RUTA_A}`);
  });
});
