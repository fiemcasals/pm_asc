import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_PERFIL,
  MENSAJE_SIN_CONEXION,
  cerrarSesion,
  getAccessToken,
  leerPerfil,
  login,
  pantallaInicial,
  restaurarSesion,
  type Usuario,
} from './sesion';

/** localStorage mínimo en memoria (las pruebas corren en Node, sin navegador). */
function almacenamiento(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => void datos.delete(k),
    setItem: (k, v) => void datos.set(k, String(v)),
  };
}

const RT: Usuario = { id: 'u-1', usuario: 'rt1', nombre: 'Ing. Aliado 1', rol: 'rt_calle' };

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('sesión del usuario (HU-14 RF-02)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', almacenamiento());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('pantallaInicial: cada rol entra a su pantalla', () => {
    it('el RT de Calle entra a su mapa', () => {
      expect(pantallaInicial('rt_calle')).toBe('rt');
    });
    it('Firmante, ECA, Secretaría y Administrador entran a su portal', () => {
      expect(pantallaInicial('firmante')).toBe('firmante');
      expect(pantallaInicial('eca')).toBe('eca');
      expect(pantallaInicial('secretaria')).toBe('secretaria');
      expect(pantallaInicial('administrador')).toBe('secretaria');
    });
  });

  describe('login', () => {
    it('con credenciales válidas devuelve el usuario, guarda el perfil y deja el token sólo en memoria', async () => {
      const fetch = vi.fn().mockResolvedValue(respuesta(200, { accessToken: 'tok-1', tokenType: 'Bearer', expiresIn: 900, usuario: RT }));
      vi.stubGlobal('fetch', fetch);

      const r = await login('rt1', 'Clave-Segura-2026');

      expect(r).toEqual({ kind: 'ok', usuario: RT });
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ usuario: 'rt1', password: 'Clave-Segura-2026' }),
      }));
      expect(getAccessToken()).toBe('tok-1');
      expect(leerPerfil()).toEqual(RT);
      expect(localStorage.getItem(CLAVE_PERFIL)).not.toContain('tok-1');
      expect(localStorage.getItem(CLAVE_PERFIL)).not.toContain('Clave-Segura-2026');
    });

    it('con credenciales inválidas devuelve el mensaje del servidor y no guarda nada', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(401, { statusCode: 401, message: 'Usuario o contraseña incorrectos.' })));
      expect(await login('rt1', 'mala')).toEqual({ kind: 'error', message: 'Usuario o contraseña incorrectos.' });
      expect(leerPerfil()).toBeNull();
    });

    it('con el login bloqueado (429) muestra el mensaje del bloqueo', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        respuesta(429, { statusCode: 429, message: 'Demasiados intentos fallidos. Probá de nuevo en 15 minutos.' }),
      ));
      expect(await login('rt1', 'x')).toEqual({
        kind: 'error',
        message: 'Demasiados intentos fallidos. Probá de nuevo en 15 minutos.',
      });
    });

    it('sin red avisa que el primer ingreso necesita señal', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      expect(await login('rt1', 'x')).toEqual({ kind: 'error', message: MENSAJE_SIN_CONEXION });
    });
  });

  describe('restaurarSesion: al reabrir la app', () => {
    it('sin perfil guardado pide ingresar, sin llamar al servidor', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      expect(await restaurarSesion()).toEqual({ kind: 'sin-sesion' });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('con perfil y señal renueva el token con la cookie', async () => {
      localStorage.setItem(CLAVE_PERFIL, JSON.stringify(RT));
      const fetch = vi.fn().mockResolvedValue(respuesta(200, { accessToken: 'tok-2', usuario: RT }));
      vi.stubGlobal('fetch', fetch);

      expect(await restaurarSesion()).toEqual({ kind: 'conectada', usuario: RT });
      expect(fetch).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }));
      expect(getAccessToken()).toBe('tok-2');
    });

    it('con perfil y SIN señal sigue con la sesión guardada', async () => {
      localStorage.setItem(CLAVE_PERFIL, JSON.stringify(RT));
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      expect(await restaurarSesion()).toEqual({ kind: 'sin-senal', usuario: RT });
      expect(leerPerfil()).toEqual(RT);
    });

    it('si el servidor no está disponible (502/503) también sigue con la sesión guardada', async () => {
      localStorage.setItem(CLAVE_PERFIL, JSON.stringify(RT));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(502, {})));
      expect(await restaurarSesion()).toEqual({ kind: 'sin-senal', usuario: RT });
    });

    it('si el servidor rechaza la sesión (401: venció o la revocaron) borra el perfil y pide ingresar', async () => {
      localStorage.setItem(CLAVE_PERFIL, JSON.stringify(RT));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(401, { message: 'La sesión venció. Volvé a ingresar.' })));
      expect(await restaurarSesion()).toEqual({ kind: 'sin-sesion' });
      expect(leerPerfil()).toBeNull();
    });

    it('dos llamados simultáneos hacen UN solo refresco (cada cookie sirve una sola vez)', async () => {
      localStorage.setItem(CLAVE_PERFIL, JSON.stringify(RT));
      const fetch = vi.fn().mockResolvedValue(respuesta(200, { accessToken: 'tok-4', usuario: RT }));
      vi.stubGlobal('fetch', fetch);

      const [a, b] = await Promise.all([restaurarSesion(), restaurarSesion()]);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(a).toEqual({ kind: 'conectada', usuario: RT });
      expect(b).toEqual(a);
    });

    it('un perfil guardado corrupto se ignora', async () => {
      localStorage.setItem(CLAVE_PERFIL, '{"rol":"superusuario"}');
      vi.stubGlobal('fetch', vi.fn());
      expect(await restaurarSesion()).toEqual({ kind: 'sin-sesion' });
    });
  });

  describe('cerrarSesion', () => {
    it('borra el perfil y el token, y avisa al servidor', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, { accessToken: 'tok-3', usuario: RT })));
      await login('rt1', 'Clave-Segura-2026');
      const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', fetch);

      await cerrarSesion();

      expect(leerPerfil()).toBeNull();
      expect(getAccessToken()).toBeNull();
      expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
    });

    it('sin señal igual cierra la sesión en el dispositivo', async () => {
      localStorage.setItem(CLAVE_PERFIL, JSON.stringify(RT));
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      await cerrarSesion();
      expect(leerPerfil()).toBeNull();
    });
  });
});
