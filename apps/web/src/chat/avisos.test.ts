import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activarAvisos,
  armarAviso,
  ayudaDeEstado,
  CLAVE_PREFERENCIA_AVISOS,
  decidirAvisos,
  desactivarAvisos,
  estadoDeAvisos,
  guardarPreferencia,
  leerPreferencia,
  MAX_TEXTO_AVISO,
  mostrarAviso,
  recortarTexto,
  salaDeLaDireccion,
  textoDeEstado,
  type ConversacionNoLeida,
  type EstadoAvisos,
} from './avisos';
import { conversacionVista, fijarConversacionVista } from './visto';

// HU-19 RF-10 — avisos del navegador cuando llega un mensaje nuevo del chat.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');
const ANA = '11111111-1111-4111-8111-111111111111';
const CARLA = '33333333-3333-4333-8333-333333333333';

function conversacion(sala: string, id: string, extra: Partial<ConversacionNoLeida['ultimoMensaje']> = {}, noLeidos = 1): ConversacionNoLeida {
  return { sala, noLeidos, ultimoMensaje: { id, emisorNombre: 'Ana Gómez', contenido: 'hola', conFoto: false, creadoEn: '2026-11-27T10:00:00.000Z', ...extra } };
}

describe('los textos de cada estado (criterio 1)', () => {
  const estados: EstadoAvisos[] = ['activados', 'desactivados', 'bloqueados', 'no-disponibles'];
  it('cada estado dice con claridad cuál es', () => {
    expect(textoDeEstado('activados')).toBe('Avisos del chat activados');
    expect(textoDeEstado('desactivados')).toBe('Avisos del chat desactivados');
    expect(textoDeEstado('bloqueados')).toBe('Avisos del chat bloqueados');
    expect(textoDeEstado('no-disponibles')).toBe('Avisos del chat no disponibles');
    expect(new Set(estados.map(textoDeEstado)).size).toBe(4);
  });
  it('bloqueados y no disponibles explican qué hacer y que el chat y los contadores funcionan igual (criterio 5)', () => {
    expect(ayudaDeEstado('bloqueados')).toMatch(/ajustes del sitio/);
    expect(ayudaDeEstado('bloqueados')).toMatch(/chat y los contadores funcionan igual/);
    expect(ayudaDeEstado('no-disponibles')).toMatch(/no admite avisos/);
    expect(ayudaDeEstado('no-disponibles')).toMatch(/chat y los contadores funcionan igual/);
  });
  it('cada estado tiene su propia ayuda', () => {
    expect(new Set(estados.map(ayudaDeEstado)).size).toBe(4);
    expect(ayudaDeEstado('activados')).toMatch(/aplicación esté abierta/);
  });
});

describe('recortarTexto (criterio 2: hasta 100 caracteres)', () => {
  it('un texto corto queda igual', () => expect(recortarTexto('Beto, ¿llegaste?')).toBe('Beto, ¿llegaste?'));
  it('un texto de exactamente 100 caracteres no se corta', () => {
    const t = 'a'.repeat(100);
    expect(recortarTexto(t)).toBe(t);
  });
  it('uno de 101 se corta a 100 caracteres, terminado en «…»', () => {
    const r = recortarTexto('a'.repeat(101));
    expect(r).toHaveLength(100);
    expect(r.endsWith('…')).toBe(true);
    expect(r).toBe(`${'a'.repeat(99)}…`);
  });
  it('un texto larguísimo también queda en 100', () => expect(recortarTexto('palabra '.repeat(900))).toHaveLength(100));
  it('es una sola línea: los saltos de línea y los espacios repetidos se juntan, y se recortan los de los costados', () => {
    expect(recortarTexto('  uno\n\ndos   tres\t cuatro  ')).toBe('uno dos tres cuatro');
  });
  it('el corte no deja un espacio antes de los puntos suspensivos', () => {
    const r = recortarTexto(`${'a'.repeat(98)} bbbbb`);
    expect(r.endsWith(' …')).toBe(false);
    expect(r).toBe(`${'a'.repeat(98)}…`);
  });
  it('un texto vacío o de espacios queda vacío', () => {
    expect(recortarTexto('')).toBe('');
    expect(recortarTexto('   \n ')).toBe('');
  });
  it('el máximo es 100', () => expect(MAX_TEXTO_AVISO).toBe(100));
  it('se puede pedir otro máximo', () => expect(recortarTexto('abcdefghij', 5)).toBe('abcd…'));
});

describe('armarAviso: quién escribió y el comienzo de su mensaje (criterio 2)', () => {
  it('en un privado el título es el nombre de quien escribió y el cuerpo, su mensaje', () => {
    expect(armarAviso(conversacion(ANA, 'm1', { emisorNombre: 'Ana Gómez', contenido: 'Beto, ¿llegaste?' }))).toEqual({ sala: ANA, titulo: 'Ana Gómez', cuerpo: 'Beto, ¿llegaste?' });
  });
  it('en el grupo el título dice también que es el grupo', () => {
    expect(armarAviso(conversacion('global', 'm1', { emisorNombre: 'Carla Díaz', contenido: 'Aviso a todos' }))).toEqual({ sala: 'global', titulo: 'Carla Díaz · Grupo General', cuerpo: 'Aviso a todos' });
  });
  it('el cuerpo no pasa de 100 caracteres', () => {
    expect(armarAviso(conversacion(ANA, 'm1', { contenido: 'x'.repeat(500) })).cuerpo).toHaveLength(100);
  });
  it('un mensaje con foto lleva su texto y nunca la foto: el aviso tiene solo sala, título y cuerpo', () => {
    const aviso = armarAviso(conversacion(ANA, 'm1', { contenido: '📷 Foto adjunta', conFoto: true }));
    expect(aviso.cuerpo).toBe('📷 Foto adjunta');
    expect(Object.keys(aviso).sort()).toEqual(['cuerpo', 'sala', 'titulo']);
  });
  it('una foto sin texto avisa «📷 Foto»; sin nombre ni texto, «Mensaje nuevo»', () => {
    expect(armarAviso(conversacion(ANA, 'm1', { contenido: '  ', conFoto: true })).cuerpo).toBe('📷 Foto');
    const vacio = armarAviso(conversacion(ANA, 'm1', { emisorNombre: ' ', contenido: '' }));
    expect(vacio.titulo).toBe('Mensaje nuevo');
    expect(vacio.cuerpo).toBe('Mensaje nuevo');
  });
});

describe('decidirAvisos: de qué conversaciones se avisa (criterios 2 y 4)', () => {
  const vista = { visible: true, conversacionVista: null as string | null };

  it('la primera vez lo que ya estaba sin leer es la base: no genera aviso, pero se recuerda', () => {
    const r = decidirAvisos(null, [conversacion(ANA, 'a1'), conversacion('global', 'g1')], vista);
    expect(r.avisos).toEqual([]);
    expect(r.siguiente).toEqual({ [ANA]: 'a1', global: 'g1' });
  });

  it('un mensaje nuevo (otro id) en una conversación avisa de ella', () => {
    const r = decidirAvisos({ [ANA]: 'a1' }, [conversacion(ANA, 'a2')], vista);
    expect(r.avisos.map((c) => c.sala)).toEqual([ANA]);
    expect(r.siguiente).toEqual({ [ANA]: 'a2' });
  });

  it('el mismo mensaje que ya se conocía no vuelve a avisar', () => {
    const r = decidirAvisos({ [ANA]: 'a1' }, [conversacion(ANA, 'a1')], vista);
    expect(r.avisos).toEqual([]);
  });

  it('una conversación que antes no tenía nada sin leer y ahora sí avisa', () => {
    const r = decidirAvisos({ [ANA]: 'a1' }, [conversacion(ANA, 'a1'), conversacion(CARLA, 'c1')], vista);
    expect(r.avisos.map((c) => c.sala)).toEqual([CARLA]);
  });

  it('varias conversaciones con mensajes nuevos avisan cada una, una vez', () => {
    const r = decidirAvisos({ [ANA]: 'a1', global: 'g1' }, [conversacion(ANA, 'a2'), conversacion('global', 'g2'), conversacion(CARLA, 'c1')], vista);
    expect(r.avisos.map((c) => c.sala)).toEqual([ANA, 'global', CARLA]);
  });

  it('varios mensajes seguidos de la misma conversación en una consulta son UN aviso (con el último)', () => {
    const r = decidirAvisos({ [ANA]: 'a1' }, [conversacion(ANA, 'a4', { contenido: 'el cuarto' }, 3)], vista);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].ultimoMensaje.contenido).toBe('el cuarto');
  });

  it('la conversación que se está mirando, con la pestaña a la vista, no avisa (pero se la da por conocida)', () => {
    const r = decidirAvisos({ [ANA]: 'a1' }, [conversacion(ANA, 'a2')], { visible: true, conversacionVista: ANA });
    expect(r.avisos).toEqual([]);
    expect(r.siguiente[ANA]).toBe('a2');
  });

  it('con la pestaña en segundo plano sí avisa, aunque sea de la conversación abierta', () => {
    const r = decidirAvisos({ [ANA]: 'a1' }, [conversacion(ANA, 'a2')], { visible: false, conversacionVista: ANA });
    expect(r.avisos.map((c) => c.sala)).toEqual([ANA]);
  });

  it('con otra conversación abierta sí avisa; con el chat cerrado (otra pestaña de la aplicación) también', () => {
    expect(decidirAvisos({ [ANA]: 'a1' }, [conversacion(ANA, 'a2')], { visible: true, conversacionVista: CARLA }).avisos).toHaveLength(1);
    expect(decidirAvisos({ [ANA]: 'a1' }, [conversacion(ANA, 'a2')], { visible: true, conversacionVista: null }).avisos).toHaveLength(1);
  });

  it('con una conversación abierta, las demás siguen avisando', () => {
    const r = decidirAvisos({ [ANA]: 'a1', global: 'g1' }, [conversacion(ANA, 'a2'), conversacion('global', 'g2')], { visible: true, conversacionVista: ANA });
    expect(r.avisos.map((c) => c.sala)).toEqual(['global']);
  });

  it('una conversación que se leyó (ya no viene) sale de la base: cuando le llegue un mensaje nuevo avisa', () => {
    const dos = decidirAvisos({ [ANA]: 'a1' }, [], vista);
    expect(dos.siguiente).toEqual({});
    const tres = decidirAvisos(dos.siguiente, [conversacion(ANA, 'a2')], vista);
    expect(tres.avisos.map((c) => c.sala)).toEqual([ANA]);
  });

  it('una secuencia de consultas: base, nada nuevo, uno nuevo, el mismo, otro nuevo', () => {
    let base: Record<string, string> | null = null;
    const paso = (lista: ConversacionNoLeida[]) => {
      const r = decidirAvisos(base, lista, vista);
      base = r.siguiente;
      return r.avisos.map((c) => c.ultimoMensaje.id);
    };
    expect(paso([conversacion(ANA, 'a1')])).toEqual([]);
    expect(paso([conversacion(ANA, 'a1')])).toEqual([]);
    expect(paso([conversacion(ANA, 'a2')])).toEqual(['a2']);
    expect(paso([conversacion(ANA, 'a2')])).toEqual([]);
    expect(paso([conversacion(ANA, 'a3')])).toEqual(['a3']);
  });

  it('no modifica lo que recibe', () => {
    const previo = { [ANA]: 'a1' };
    decidirAvisos(previo, [conversacion(ANA, 'a2')], vista);
    expect(previo).toEqual({ [ANA]: 'a1' });
  });

  it('sin conversaciones no hay avisos', () => {
    expect(decidirAvisos({ [ANA]: 'a1' }, [], vista)).toEqual({ avisos: [], siguiente: {} });
  });
});

describe('la conversación que se está viendo (visto.ts)', () => {
  afterEach(() => fijarConversacionVista(null));
  it('empieza sin ninguna, se fija y se suelta', () => {
    expect(conversacionVista()).toBeNull();
    fijarConversacionVista(ANA);
    expect(conversacionVista()).toBe(ANA);
    fijarConversacionVista(null);
    expect(conversacionVista()).toBeNull();
  });
});

describe('la preferencia de cada dispositivo y cada usuario (criterio 5)', () => {
  let almacen: Map<string, string>;
  beforeEach(() => {
    almacen = new Map();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => almacen.set(k, v), removeItem: (k: string) => almacen.delete(k) } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('por defecto está desactivada', () => expect(leerPreferencia(ANA)).toBe(false));
  it('se guarda y se lee, por usuario', () => {
    guardarPreferencia(ANA, true);
    expect(leerPreferencia(ANA)).toBe(true);
    expect(leerPreferencia(CARLA)).toBe(false);
    expect(almacen.get(`${CLAVE_PREFERENCIA_AVISOS}:${ANA}`)).toBe('1');
  });
  it('desactivarla borra lo guardado', () => {
    guardarPreferencia(ANA, true);
    guardarPreferencia(ANA, false);
    expect(leerPreferencia(ANA)).toBe(false);
    expect(almacen.size).toBe(0);
  });
  it('un valor guardado que no es «1» cuenta como desactivada', () => {
    almacen.set(`${CLAVE_PREFERENCIA_AVISOS}:${ANA}`, 'true');
    expect(leerPreferencia(ANA)).toBe(false);
  });
  it('si el navegador no deja usar el almacenamiento no se rompe nada', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } } });
    expect(leerPreferencia(ANA)).toBe(false);
    expect(() => guardarPreferencia(ANA, true)).not.toThrow();
    expect(() => guardarPreferencia(ANA, false)).not.toThrow();
  });
});

describe('el estado y la activación con la API de avisos del navegador (criterios 1 y 5)', () => {
  let almacen: Map<string, string>;
  let permiso: NotificationPermission;
  let alPedir: NotificationPermission | 'sin-cambio';
  let pedidos: number;

  function instalarNavegador(conAvisos = true) {
    almacen = new Map();
    pedidos = 0;
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => almacen.set(k, v), removeItem: (k: string) => almacen.delete(k) } });
    if (conAvisos) {
      vi.stubGlobal('Notification', {
        get permission() {
          return permiso;
        },
        requestPermission: async () => {
          pedidos++;
          if (alPedir !== 'sin-cambio') permiso = alPedir;
          return permiso;
        },
      });
    } else {
      vi.stubGlobal('Notification', undefined);
    }
  }

  beforeEach(() => {
    permiso = 'default';
    alPedir = 'granted';
    instalarNavegador();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('estadoDeAvisos', () => {
    it('sin la API de avisos: no disponibles', () => {
      instalarNavegador(false);
      expect(estadoDeAvisos(ANA)).toBe('no-disponibles');
    });
    it('permiso denegado: bloqueados (aunque se hubiera activado antes)', () => {
      permiso = 'denied';
      expect(estadoDeAvisos(ANA)).toBe('bloqueados');
      guardarPreferencia(ANA, true);
      expect(estadoDeAvisos(ANA)).toBe('bloqueados');
    });
    it('sin haber elegido todavía: desactivados', () => expect(estadoDeAvisos(ANA)).toBe('desactivados'));
    it('permiso dado pero sin activar: desactivados', () => {
      permiso = 'granted';
      expect(estadoDeAvisos(ANA)).toBe('desactivados');
    });
    it('permiso dado y activados: activados, solo para ese usuario', () => {
      permiso = 'granted';
      guardarPreferencia(ANA, true);
      expect(estadoDeAvisos(ANA)).toBe('activados');
      expect(estadoDeAvisos(CARLA)).toBe('desactivados');
    });
    it('activados en el almacenamiento pero sin permiso (se lo quitaron): desactivados', () => {
      guardarPreferencia(ANA, true);
      expect(estadoDeAvisos(ANA)).toBe('desactivados');
    });
  });

  describe('activarAvisos: el permiso se pide SOLO acá', () => {
    it('sin permiso todavía: lo pide una vez, y si lo dan, queda activado y recordado', async () => {
      expect(await activarAvisos(ANA)).toBe('activados');
      expect(pedidos).toBe(1);
      expect(leerPreferencia(ANA)).toBe(true);
    });
    it('si la persona lo bloquea: bloqueados, y no se recuerda nada', async () => {
      alPedir = 'denied';
      expect(await activarAvisos(ANA)).toBe('bloqueados');
      expect(pedidos).toBe(1);
      expect(leerPreferencia(ANA)).toBe(false);
    });
    it('si cierra la pregunta sin elegir: sigue desactivado, sin recordar nada, y se puede volver a intentar', async () => {
      alPedir = 'sin-cambio';
      expect(await activarAvisos(ANA)).toBe('desactivados');
      expect(leerPreferencia(ANA)).toBe(false);
      alPedir = 'granted';
      expect(await activarAvisos(ANA)).toBe('activados');
      expect(pedidos).toBe(2);
    });
    it('con el permiso ya dado no se vuelve a preguntar', async () => {
      permiso = 'granted';
      expect(await activarAvisos(ANA)).toBe('activados');
      expect(pedidos).toBe(0);
    });
    it('con el permiso ya denegado no se pregunta y dice bloqueados', async () => {
      permiso = 'denied';
      expect(await activarAvisos(ANA)).toBe('bloqueados');
      expect(pedidos).toBe(0);
    });
    it('sin la API de avisos: no disponibles, sin errores', async () => {
      instalarNavegador(false);
      expect(await activarAvisos(ANA)).toBe('no-disponibles');
    });
    it('si el navegador falla al preguntar, se mira el permiso que quedó y no se rompe nada', async () => {
      vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => { throw new Error('no se pudo'); } });
      expect(await activarAvisos(ANA)).toBe('desactivados');
    });
  });

  describe('desactivarAvisos', () => {
    it('borra la preferencia y no toca el permiso del navegador', () => {
      permiso = 'granted';
      guardarPreferencia(ANA, true);
      expect(desactivarAvisos(ANA)).toBe('desactivados');
      expect(leerPreferencia(ANA)).toBe(false);
      expect(permiso).toBe('granted');
      expect(pedidos).toBe(0);
    });
    it('con el permiso denegado sigue diciendo bloqueados', () => {
      permiso = 'denied';
      expect(desactivarAvisos(ANA)).toBe('bloqueados');
    });
  });
});

describe('mostrarAviso: por el service worker o por la página (criterios 2 y 4)', () => {
  const aviso = { sala: ANA, titulo: 'Ana Gómez', cuerpo: 'Beto, ¿llegaste?' };
  const creados: { titulo: string; opciones: Record<string, unknown>; onclick: (() => void) | null; close: ReturnType<typeof vi.fn> }[] = [];
  let ventana: { focus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    creados.length = 0;
    ventana = { focus: vi.fn() };
    vi.stubGlobal('window', ventana);
    class FalsoAviso {
      onclick: (() => void) | null = null;
      close = vi.fn();
      constructor(titulo: string, opciones: Record<string, unknown>) {
        creados.push({ titulo, opciones, onclick: null, close: this.close });
        const dato = creados[creados.length - 1];
        Object.defineProperty(this, 'onclick', { get: () => dato.onclick, set: (v) => { dato.onclick = v; } });
      }
    }
    vi.stubGlobal('Notification', FalsoAviso);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('con service worker activo el aviso se muestra por registration.showNotification, con su marca y la conversación', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ active: {}, showNotification }) } });
    await mostrarAviso(aviso, vi.fn());
    expect(showNotification).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = showNotification.mock.calls[0];
    expect(titulo).toBe('Ana Gómez');
    expect(opciones).toMatchObject({ body: 'Beto, ¿llegaste?', tag: `chat-${ANA}`, renotify: true, data: { tipo: 'chat', sala: ANA } });
    expect(creados).toHaveLength(0);
  });

  it('el aviso no lleva imagen ni ícono (nunca la foto del mensaje)', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ active: {}, showNotification }) } });
    await mostrarAviso(aviso, vi.fn());
    const opciones = showNotification.mock.calls[0][1];
    expect(Object.keys(opciones).sort()).toEqual(['body', 'data', 'lang', 'renotify', 'tag']);
    expect(opciones.image).toBeUndefined();
  });

  it('cada conversación tiene su marca: la del grupo es «chat-global» y se reemplaza sola', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ active: {}, showNotification }) } });
    await mostrarAviso({ sala: 'global', titulo: 'x', cuerpo: 'y' }, vi.fn());
    await mostrarAviso({ sala: 'global', titulo: 'x', cuerpo: 'z' }, vi.fn());
    expect(showNotification.mock.calls.map((c) => c[1].tag)).toEqual(['chat-global', 'chat-global']);
    expect(showNotification.mock.calls.every((c) => c[1].renotify === true)).toBe(true);
  });

  it('sin service worker se usa el aviso de la página, y al tocarlo se enfoca la ventana, se abre la conversación y se cierra el aviso', async () => {
    vi.stubGlobal('navigator', {});
    const alTocar = vi.fn();
    await mostrarAviso(aviso, alTocar);
    expect(creados).toHaveLength(1);
    expect(creados[0].titulo).toBe('Ana Gómez');
    expect(creados[0].opciones).toMatchObject({ body: 'Beto, ¿llegaste?', tag: `chat-${ANA}`, renotify: true, data: { tipo: 'chat', sala: ANA } });
    creados[0].onclick!();
    expect(ventana.focus).toHaveBeenCalledTimes(1);
    expect(alTocar).toHaveBeenCalledWith(ANA);
    expect(creados[0].close).toHaveBeenCalledTimes(1);
  });

  it('con un service worker sin activar (todavía instalándose) se usa el aviso de la página', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ active: null, showNotification: vi.fn() }) } });
    await mostrarAviso(aviso, vi.fn());
    expect(creados).toHaveLength(1);
  });

  it('sin ningún service worker registrado se usa el aviso de la página', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined } });
    await mostrarAviso(aviso, vi.fn());
    expect(creados).toHaveLength(1);
  });

  it('si el service worker falla al mostrar, se prueba con el aviso de la página', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ active: {}, showNotification: async () => { throw new Error('falló'); } }) } });
    await mostrarAviso(aviso, vi.fn());
    expect(creados).toHaveLength(1);
  });

  it('si no se pueden crear avisos desde la página, no se rompe nada', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('Notification', class { constructor() { throw new TypeError('Illegal constructor'); } });
    await expect(mostrarAviso(aviso, vi.fn())).resolves.toBeUndefined();
  });
});

describe('salaDeLaDireccion (abrir la aplicación desde un aviso)', () => {
  it('lee la conversación de /?chat=…', () => {
    expect(salaDeLaDireccion('?chat=global')).toBe('global');
    expect(salaDeLaDireccion(`?chat=${ANA}`)).toBe(ANA);
    expect(salaDeLaDireccion(`?otro=1&chat=${ANA}&mas=2`)).toBe(ANA);
  });
  it('el identificador se devuelve en minúscula', () => {
    expect(salaDeLaDireccion('?chat=ABCDEF12-3456-4789-8ABC-DEF012345678')).toBe('abcdef12-3456-4789-8abc-def012345678');
  });
  it.each(['', '?', '?chat=', '?chat=abc', '?chat=GLOBAL', "?chat=' OR 1=1", '?chat=../global', `?chat=${ANA}x`, '?otra=global'])('una dirección sin conversación válida (%p) da null', (b) => {
    expect(salaDeLaDireccion(b)).toBeNull();
  });
});

describe('el service worker al tocar un aviso (public/sw-chat.js)', () => {
  const codigo = leer('../../public/sw-chat.js');

  function cargar(ventanas: { visibilityState: string; postMessage: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }[]) {
    let manejador: ((e: unknown) => void) | undefined;
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const self = {
      addEventListener: (tipo: string, fn: (e: unknown) => void) => {
        if (tipo === 'notificationclick') manejador = fn;
      },
      clients: { matchAll: vi.fn().mockResolvedValue(ventanas), openWindow },
    };
    vm.runInNewContext(codigo, { self });
    return {
      openWindow,
      matchAll: self.clients.matchAll,
      async tocar(data: unknown) {
        const cerrado = vi.fn();
        let promesa: Promise<unknown> | undefined;
        manejador!({ notification: { data, close: cerrado }, waitUntil: (p: Promise<unknown>) => { promesa = p; } });
        await promesa;
        return { cerrado, esperó: promesa !== undefined };
      },
    };
  }
  const ventana = (visibilityState: string) => ({ visibilityState, postMessage: vi.fn(), focus: vi.fn().mockResolvedValue(undefined) });

  it('registra el manejador del toque en el aviso', () => {
    expect(codigo).toContain("self.addEventListener('notificationclick'");
  });

  it('con la aplicación abierta: cierra el aviso, le pide abrir la conversación y la trae al frente', async () => {
    const v = ventana('visible');
    const sw = cargar([v]);
    const r = await sw.tocar({ tipo: 'chat', sala: ANA });
    expect(r.cerrado).toHaveBeenCalledTimes(1);
    expect(v.postMessage).toHaveBeenCalledWith({ tipo: 'abrir-chat', sala: ANA });
    expect(v.focus).toHaveBeenCalledTimes(1);
    expect(sw.openWindow).not.toHaveBeenCalled();
    expect(sw.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  });

  it('con varias ventanas elige la que está a la vista', async () => {
    const escondida = ventana('hidden');
    const visible = ventana('visible');
    const sw = cargar([escondida, visible]);
    await sw.tocar({ tipo: 'chat', sala: 'global' });
    expect(visible.postMessage).toHaveBeenCalledWith({ tipo: 'abrir-chat', sala: 'global' });
    expect(escondida.postMessage).not.toHaveBeenCalled();
  });

  it('si ninguna está a la vista usa la primera', async () => {
    const a = ventana('hidden');
    const b = ventana('hidden');
    const sw = cargar([a, b]);
    await sw.tocar({ tipo: 'chat', sala: ANA });
    expect(a.postMessage).toHaveBeenCalledTimes(1);
    expect(b.postMessage).not.toHaveBeenCalled();
  });

  it('con la aplicación cerrada abre una ventana ya en la conversación', async () => {
    const sw = cargar([]);
    await sw.tocar({ tipo: 'chat', sala: ANA });
    expect(sw.openWindow).toHaveBeenCalledWith(`/?chat=${ANA}`);
  });

  it('la conversación se escapa en la dirección', async () => {
    const sw = cargar([]);
    await sw.tocar({ tipo: 'chat', sala: 'a b&c' });
    expect(sw.openWindow).toHaveBeenCalledWith('/?chat=a%20b%26c');
  });

  it('un aviso sin conversación abre el chat sin conversación', async () => {
    const sw = cargar([]);
    await sw.tocar({ tipo: 'chat' });
    expect(sw.openWindow).toHaveBeenCalledWith('/?chat=');
  });

  it('los avisos que no son del chat (u otros datos) no se tocan', async () => {
    const v = ventana('visible');
    const sw = cargar([v]);
    for (const data of [undefined, null, {}, { tipo: 'otra-cosa', sala: ANA }, 'texto']) {
      const r = await sw.tocar(data);
      expect(r.cerrado).not.toHaveBeenCalled();
      expect(r.esperó).toBe(false);
    }
    expect(v.postMessage).not.toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('lo carga el service worker de la aplicación', () => {
    const config = leer('../../vite.config.ts');
    expect(config).toContain("importScripts: ['sw-chat.js']");
  });
});

describe('cómo lo usa la aplicación', () => {
  const avisosTs = leer('./avisos.ts');
  const hook = leer('./useAvisosDelChat.ts');
  const hookTotal = leer('./useNoLeidosChat.ts');
  const vista = leer('./ChatOperativoView.tsx');
  const app = leer('../App.tsx');
  const estilos = leer('./chat.css');

  describe('el permiso solo se pide al tocar el botón (criterio 1)', () => {
    it('requestPermission aparece una sola vez en todo el código de la aplicación: dentro de activarAvisos', () => {
      const archivos = [avisosTs, hook, hookTotal, vista, app];
      expect(archivos.map((a) => (a.match(/requestPermission\(/g) ?? []).length)).toEqual([1, 0, 0, 0, 0]);
      const dentro = /export async function activarAvisos[\s\S]*?\n\}/.exec(avisosTs)![0];
      expect(dentro).toContain('Notification.requestPermission()');
    });
    it('activarAvisos solo se llama desde la función «activar» del hook, que solo se llama desde el botón', () => {
      expect((hook.match(/\bactivarAvisos\(/g) ?? []).length).toBe(1);
      expect(hook).toMatch(/const activar = useCallback\(async \(\) => \{\s*setEstado\(await activarAvisos\(usuarioId\)\);/);
      expect(hook).toMatch(/const desactivar = useCallback\(\(\) => \{\s*setEstado\(desactivarAvisos\(usuarioId\)\);/);
      expect((vista.match(/avisos\.activar\(\)/g) ?? []).length).toBe(1);
      expect(vista).toMatch(/onClick=\{\(\) => void avisos\.activar\(\)\}\s*data-testid="chat-btn-activar-avisos"/);
    });
    it('ningún efecto ni carga de página pide permiso', () => {
      const efectos = hook.match(/useEffect\([\s\S]*?\n  \}, \[[^\]]*\]\);/g) ?? [];
      expect(efectos.length).toBe(3);
      expect(efectos.some((e) => /activarAvisos|requestPermission/.test(e))).toBe(false);
    });
    it('el botón «Activar avisos del chat» solo está con los avisos desactivados; «Desactivar» solo con los activados', () => {
      expect(vista).toMatch(/\{avisos\.estado === 'desactivados' && \(\s*<button[\s\S]*?Activar avisos del chat/);
      expect(vista).toMatch(/\{avisos\.estado === 'activados' && \(\s*<button[\s\S]*?Desactivar/);
      expect(vista).toMatch(/onClick=\{avisos\.desactivar\}\s*data-testid="chat-btn-desactivar-avisos"/);
    });
    it('el estado y su explicación se muestran siempre', () => {
      expect(vista).toContain('{textoDeEstado(avisos.estado)}');
      expect(vista).toContain('{ayudaDeEstado(avisos.estado)}');
      expect(vista).toContain('data-estado={avisos.estado}');
    });
    it('el estado se vuelve a mirar al volver a la pestaña (el permiso se puede cambiar en los ajustes del navegador)', () => {
      expect(hook).toContain("window.addEventListener('focus', revisar);");
      expect(hook).toContain("document.addEventListener('visibilitychange', revisar);");
    });
  });

  describe('cuándo se avisa (criterios 2 y 4)', () => {
    it('cada respuesta de «mensajes sin leer» pasa por los avisos', () => {
      expect(hookTotal).toContain('alRecibirRef.current?.(cuerpo);');
      expect(app).toContain('useNoLeidosChat(tieneChat, avisosDelChat.procesar)');
    });
    it('se decide con la visibilidad de la pestaña y la conversación que se está viendo', () => {
      expect(hook).toContain("visible: document.visibilityState === 'visible',");
      expect(hook).toContain('conversacionVista: conversacionVista(),');
    });
    it('la base se actualiza siempre, aunque los avisos estén desactivados (al activarlos no se muestra lo que ya estaba)', () => {
      const procesar = /const procesar = useCallback\([\s\S]*?\[usuarioId\],\n  \);/.exec(hook)![0];
      expect(procesar.indexOf('baseRef.current = siguiente;')).toBeGreaterThan(0);
      expect(procesar.indexOf('baseRef.current = siguiente;')).toBeLessThan(procesar.indexOf("estadoDeAvisos(usuarioId) !== 'activados'"));
    });
    it('solo se muestra con los avisos activados, y se muestra uno por conversación', () => {
      expect(hook).toContain("if (estadoDeAvisos(usuarioId) !== 'activados') return;");
      expect(hook).toContain('for (const aviso of avisos) void mostrarAviso(armarAviso(aviso), (sala) => abrirRef.current(sala));');
    });
    it('la pantalla del chat dice qué conversación tiene abierta y la suelta al cerrarse', () => {
      expect(vista).toMatch(/fijarConversacionVista\(canalActivoId\);\s*return \(\) => fijarConversacionVista\(null\);\s*\}, \[canalActivoId\]\);/);
    });
    it('los estilos del estado de los avisos existen', () => {
      expect(estilos).toMatch(/\.chat-avisos\s*\{/);
      expect(estilos).toMatch(/\.chat-avisos\[data-estado='activados'\]/);
      expect(estilos).toMatch(/\.chat-avisos\[data-estado='bloqueados'\]/);
    });
  });

  describe('tocar el aviso abre la conversación (criterio 3)', () => {
    it('con la aplicación abierta, el service worker pide abrirla con un mensaje «abrir-chat»', () => {
      expect(hook).toContain("navigator.serviceWorker.addEventListener('message', alMensaje);");
      expect(hook).toContain("datos.tipo === 'abrir-chat' && typeof datos.sala === 'string'");
      expect(hook).toContain("typeof datos.sala === 'string') abrirRef.current(datos.sala);");
      expect(hook).toContain("navigator.serviceWorker.removeEventListener('message', alMensaje)");
    });
    it('con la aplicación cerrada, se abre en /?chat=<conversación> y la dirección se limpia', () => {
      expect(hook).toContain('const sala = salaDeLaDireccion(window.location.search);');
      expect(hook).toContain("direccion.searchParams.delete('chat');");
      expect(hook).toContain("window.history.replaceState(null, '', `${direccion.pathname}${direccion.search}${direccion.hash}`);");
      expect(hook).toMatch(/replaceState\([^)]*\)\;\s*abrirRef\.current\(sala\);/);
    });
    it('la aplicación pasa a la pestaña del chat y le pide abrir esa conversación', () => {
      expect(app).toMatch(/const abrirConversacionDelChat = useCallback\(\s*\(sala: string\) => \{\s*irA\('chat'\);\s*setConversacionPedida\(\(previa\) => \(\{ sala, n: \(previa\?\.n \?\? 0\) \+ 1 \}\)\);/);
      expect(app).toContain('useAvisosDelChat(usuario.id, tieneChat, abrirConversacionDelChat)');
      expect(app).toContain('avisos={avisosDelChat} conversacionPedida={conversacionPedida}');
    });
    it('la pantalla del chat abre la conversación pedida (cada pedido, aunque sea la misma)', () => {
      expect(vista).toMatch(/useEffect\(\(\) => \{\s*if \(conversacionPedida\) setCanalActivoId\(conversacionPedida\.sala\);\s*\}, \[conversacionPedida\]\);/);
    });
  });

  describe('sin chat no hay avisos', () => {
    it('los avisos solo se habilitan para quien tiene la pestaña del chat', () => {
      expect(app).toContain("const tieneChat = navItems.some((item) => item.id === 'chat');");
      expect(hook).toMatch(/if \(!habilitado\) return undefined;/);
      expect(hook).toContain("useState<EstadoAvisos>(() => (habilitado ? estadoDeAvisos(usuarioId) : 'desactivados'))");
    });
  });
});
