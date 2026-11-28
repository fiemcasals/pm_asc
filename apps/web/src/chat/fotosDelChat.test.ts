import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { crearCacheDeFotos, esRutaDeFoto } from './fotosDelChat';

// HU-19 RF-05, criterios 2 y 3 — la foto se pide aparte del hilo, una sola vez, y la muestran todos los que leen el mensaje.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');
const RUTA = '/api/chat/mensajes/3f2a1c4e-8b7d-4e21-9c3a-1b2c3d4e5f60/foto';
const OTRA = '/api/chat/mensajes/aa2a1c4e-8b7d-4e21-9c3a-1b2c3d4e5f61/foto';

function preparar(falla = false) {
  const pedidos: string[] = [];
  const soltadas: string[] = [];
  let n = 0;
  const cache = crearCacheDeFotos(
    async (ruta) => {
      pedidos.push(ruta);
      if (falla) throw new Error('sin red');
      return new Blob(['x']);
    },
    () => `blob:foto-${++n}`,
    (u) => soltadas.push(u),
    2,
  );
  return { cache, pedidos, soltadas };
}

describe('las fotos del chat se piden una sola vez', () => {
  it('reconoce la ruta que manda la API y nada más', () => {
    expect(esRutaDeFoto(RUTA)).toBe(true);
    expect(esRutaDeFoto('data:image/jpeg;base64,AAAA')).toBe(false);
    expect(esRutaDeFoto('https://otro.sitio/api/chat/mensajes/x/foto')).toBe(false);
  });

  it('pedir la misma foto en cada actualización del hilo la baja una sola vez', async () => {
    const { cache, pedidos } = preparar();
    const urls = await Promise.all(Array.from({ length: 30 }, () => cache.obtener(RUTA)));
    expect(new Set(urls)).toEqual(new Set(['blob:foto-1']));
    expect(pedidos).toEqual([RUTA]);
  });

  it('si falla, la próxima vez se vuelve a intentar', async () => {
    const { cache, pedidos } = preparar(true);
    await expect(cache.obtener(RUTA)).rejects.toThrow('sin red');
    await expect(cache.obtener(RUTA)).rejects.toThrow('sin red');
    expect(pedidos).toEqual([RUTA, RUTA]);
  });

  it('lo que no es una ruta de la API se muestra tal cual, sin pedir nada', async () => {
    const { cache, pedidos } = preparar();
    expect(await cache.obtener('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(pedidos).toEqual([]);
  });

  it('guarda una cantidad limitada y suelta las más viejas; al vaciar suelta todas', async () => {
    const { cache, soltadas } = preparar();
    await cache.obtener(RUTA);
    await cache.obtener(OTRA);
    await cache.obtener('/api/chat/mensajes/bb2a1c4e-8b7d-4e21-9c3a-1b2c3d4e5f62/foto');
    await Promise.resolve();
    expect(cache.cantidad()).toBe(2);
    expect(soltadas).toEqual(['blob:foto-1']);
    cache.vaciar();
    await Promise.resolve();
    expect(cache.cantidad()).toBe(0);
    expect(soltadas.sort()).toEqual(['blob:foto-1', 'blob:foto-2', 'blob:foto-3']);
  });
});

describe('la miniatura (criterio 3)', () => {
  const miniatura = leer('./FotoDelChat.tsx');
  it('pide la foto con la sesión y la guarda por usuario', () => {
    expect(miniatura).toContain('const res = await fetchConSesion(ruta);');
    expect(miniatura).toContain('if (!cache || cache.usuarioId !== usuarioId) {');
  });
  it('si no llega, ofrece reintentar en vez de quedarse en blanco', () => {
    expect(miniatura).toContain('No se pudo cargar la foto. Tocá para reintentar.');
  });
});
