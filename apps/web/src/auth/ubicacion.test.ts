import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { tomarUbicacion } from './ubicacion';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function archivosDeCodigo(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosDeCodigo(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

function geoFalsa(resultado: { ok: true } | { ok: false; code: number }) {
  return {
    getCurrentPosition: vi.fn((exito: PositionCallback, error?: PositionErrorCallback | null) => {
      if (resultado.ok) {
        exito({
          coords: { latitude: -34.6037, longitude: -58.3816, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
          timestamp: Date.UTC(2026, 10, 12, 15, 0, 0),
        } as GeolocationPosition);
      } else {
        error?.({ code: resultado.code, message: '' } as GeolocationPositionError);
      }
    }),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  } as unknown as Geolocation & { getCurrentPosition: ReturnType<typeof vi.fn>; watchPosition: ReturnType<typeof vi.fn> };
}

describe('ubicación del RT: sólo al iniciar inspección o visita fallida, sin seguimiento (HU-14 RNF-01 c2)', () => {
  it('toma UNA lectura fresca con getCurrentPosition y nunca usa watchPosition', async () => {
    const geo = geoFalsa({ ok: true });
    const r = await tomarUbicacion('inicio-inspeccion', geo);

    expect(r).toEqual({
      kind: 'ok',
      ubicacion: {
        motivo: 'inicio-inspeccion',
        latitud: -34.6037,
        longitud: -58.3816,
        precision: 12,
        tomadaEn: '2026-11-12T15:00:00.000Z',
      },
    });
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });

  it('sólo acepta los dos motivos del aviso (lo controla el tipo) y registra cuál fue', async () => {
    const r = await tomarUbicacion('visita-fallida', geoFalsa({ ok: true }));
    expect(r.kind === 'ok' && r.ubicacion.motivo).toBe('visita-fallida');
  });

  it('si el RT no dio permiso, lo explica', async () => {
    const r = await tomarUbicacion('visita-fallida', geoFalsa({ ok: false, code: 1 }));
    expect(r).toEqual({ kind: 'error', message: expect.stringMatching(/No diste permiso/) });
  });

  it('sin API de geolocalización devuelve un error, no se cuelga', async () => {
    expect(await tomarUbicacion('inicio-inspeccion', undefined)).toEqual({ kind: 'error', message: expect.any(String) });
  });

  it('en todo src/ no hay watchPosition, y la geolocalización sólo se lee en auth/ubicacion.ts', () => {
    const archivos = archivosDeCodigo(SRC);
    expect(archivos.length).toBeGreaterThan(10);
    const conWatch = archivos.filter((f) => /\.watchPosition\s*\(/.test(readFileSync(f, 'utf8')));
    expect(conWatch).toEqual([]);
    const conGeo = archivos.filter((f) => /navigator\??\.geolocation|\.getCurrentPosition\s*\(/.test(readFileSync(f, 'utf8')));
    expect(conGeo.map((f) => relative(SRC, f).replace(/\\/g, '/'))).toEqual(['auth/ubicacion.ts']);
  });
});
