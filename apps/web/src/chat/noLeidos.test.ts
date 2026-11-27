import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  avisarCambioDeLecturas,
  EVENTO_LECTURAS,
  INTERVALO_CANALES_MS,
  INTERVALO_NO_LEIDOS_MS,
  MAX_CONTADOR,
  ordenarCanales,
  textoContador,
  tituloBase,
  tituloConNoLeidos,
} from './noLeidos';

// HU-19 RF-09 — lo no leído del chat: el contador, el título de la pestaña y el orden de la lista.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');

describe('textoContador (criterios 1 y 2)', () => {
  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])('sin nada sin leer (%p) no dice nada', (n) => {
    expect(textoContador(n)).toBe('');
  });
  it.each([[1, '1'], [2, '2'], [42, '42'], [99, '99']])('hasta 99 dice el número (%p)', (n, texto) => expect(textoContador(n)).toBe(texto));
  it.each([[100, '99+'], [101, '99+'], [5000, '99+']])('desde 100 dice «99+» (%p)', (n, texto) => expect(textoContador(n)).toBe(texto));
  it('un número con decimales se redondea hacia abajo', () => expect(textoContador(5.9)).toBe('5'));
  it('el tope es 99', () => expect(MAX_CONTADOR).toBe(99));
});

describe('el título de la pestaña del navegador (criterio 2)', () => {
  const base = 'mant_asc · Inspecciones de Ascensores';
  it('con mensajes sin leer lleva el total por delante, por ejemplo «(3) mant_asc»', () => {
    expect(tituloConNoLeidos('mant_asc', 3)).toBe('(3) mant_asc');
    expect(tituloConNoLeidos(base, 1)).toBe(`(1) ${base}`);
  });
  it('desde 100 dice «(99+)»', () => expect(tituloConNoLeidos(base, 250)).toBe(`(99+) ${base}`));
  it.each([0, -1, Number.NaN])('sin nada sin leer (%p) queda el título de siempre', (n) => expect(tituloConNoLeidos(base, n)).toBe(base));
  it('tituloBase le saca el contador de adelante, y solo el de adelante', () => {
    expect(tituloBase('(3) mant_asc')).toBe('mant_asc');
    expect(tituloBase('(99+) mant_asc')).toBe('mant_asc');
    expect(tituloBase('mant_asc')).toBe('mant_asc');
    expect(tituloBase('mant_asc (3) otra cosa')).toBe('mant_asc (3) otra cosa');
    expect(tituloBase('(3)mant_asc')).toBe('(3)mant_asc');
    expect(tituloBase('(abc) mant_asc')).toBe('(abc) mant_asc');
  });
  it('poner y sacar el contador son inversos: nunca se acumulan «(2) (2) …»', () => {
    for (const n of [0, 1, 7, 99, 100, 500]) {
      expect(tituloBase(tituloConNoLeidos(base, n))).toBe(base);
      expect(tituloConNoLeidos(tituloBase(tituloConNoLeidos(base, n)), n)).toBe(tituloConNoLeidos(base, n));
    }
  });
});

describe('ordenarCanales (criterio 1): primero la conversación con el mensaje más reciente', () => {
  const c = (id: string, hora?: string | null) => ({ id, ultimoMensajeHora: hora });
  it('ordena de la más reciente a la más vieja', () => {
    const lista = [c('a', '2026-11-27T10:00:00.000Z'), c('b', '2026-11-27T12:00:00.000Z'), c('c', '2026-11-27T11:00:00.000Z')];
    expect(ordenarCanales(lista).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('las que todavía no tienen mensajes quedan al final, en el orden en que venían', () => {
    const lista = [c('global'), c('f'), c('a', '2026-11-27T10:00:00.000Z'), c('s', null), c('r', '2026-11-27T09:00:00.000Z')];
    expect(ordenarCanales(lista).map((x) => x.id)).toEqual(['a', 'r', 'global', 'f', 's']);
  });
  it('con la misma hora se mantiene el orden en que venían', () => {
    const h = '2026-11-27T10:00:00.000Z';
    expect(ordenarCanales([c('x', h), c('y', h), c('z', h)]).map((i) => i.id)).toEqual(['x', 'y', 'z']);
  });
  it('si ninguna tiene mensajes no cambia nada, y una lista vacía queda vacía', () => {
    expect(ordenarCanales([c('1'), c('2'), c('3')]).map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(ordenarCanales([])).toEqual([]);
  });
  it('no modifica la lista que recibe', () => {
    const lista = [c('a', '2026-11-27T10:00:00.000Z'), c('b', '2026-11-27T12:00:00.000Z')];
    ordenarCanales(lista);
    expect(lista.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('compara horas en el formato que devuelve la API (ISO con milisegundos)', () => {
    const lista = [c('a', '2026-11-27T10:00:00.100Z'), c('b', '2026-11-27T10:00:00.900Z')];
    expect(ordenarCanales(lista).map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('avisarCambioDeLecturas', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('avisa a toda la aplicación con un evento de la ventana', () => {
    const ventana = new EventTarget();
    vi.stubGlobal('window', ventana);
    const alcanzo = vi.fn();
    ventana.addEventListener(EVENTO_LECTURAS, alcanzo);
    avisarCambioDeLecturas();
    expect(alcanzo).toHaveBeenCalledTimes(1);
  });
  it('sin ventana (sin pantalla) no hace nada ni falla', () => {
    expect(() => avisarCambioDeLecturas()).not.toThrow();
  });
});

describe('cada cuánto se actualiza', () => {
  it('el total del menú, cada 8 segundos; la lista de conversaciones con el chat abierto, cada 5', () => {
    expect(INTERVALO_NO_LEIDOS_MS).toBe(8000);
    expect(INTERVALO_CANALES_MS).toBe(5000);
  });
});

describe('cómo lo usa la aplicación', () => {
  const hook = leer('./useNoLeidosChat.ts');
  const app = leer('../App.tsx');
  const vista = leer('./ChatOperativoView.tsx');
  const estilosChat = leer('./chat.css');
  const estilosMenu = leer('../neo.css');

  describe('el total en el menú y en el título (criterio 2)', () => {
    it('el hook pregunta el total al servidor cada pocos segundos y apenas la pantalla del chat marca algo', () => {
      expect(hook).toContain("fetchConSesion('/api/chat/no-leidos')");
      expect(hook).toContain('setInterval(() => void cargar(), INTERVALO_NO_LEIDOS_MS)');
      expect(hook).toContain('window.addEventListener(EVENTO_LECTURAS, cargar)');
      expect(hook).toContain('window.removeEventListener(EVENTO_LECTURAS, cargar)');
      expect(hook).toContain('clearInterval(intervalo)');
    });
    it('sin chat (por ejemplo una ECA) no pregunta nada y devuelve 0', () => {
      expect(hook).toMatch(/if \(!habilitado\) return undefined;[\s\S]*?let vivo = true;/);
      expect(hook).toContain('return habilitado ? total : 0;');
    });
    it('el título lleva el total por delante y vuelve al de siempre al terminar', () => {
      expect(hook).toContain('const base = tituloBase(document.title);');
      expect(hook).toContain('document.title = tituloConNoLeidos(base, total);');
      expect(hook).toMatch(/return \(\) => \{\s*document\.title = base;/);
    });
    it('un total que no es un número positivo cuenta como 0 (no rompe el menú)', () => {
      expect(hook).toContain("typeof cuerpo.total === 'number' && cuerpo.total > 0 ? cuerpo.total : 0");
    });
    it('la aplicación lo usa solo si el usuario tiene la pestaña del chat', () => {
      expect(app).toContain("const tieneChat = navItems.some((item) => item.id === 'chat');");
      expect(app).toMatch(/useNoLeidosChat\(tieneChat, /);
    });
    it('el menú lateral y la barra del celular muestran el total solo en la pestaña del chat y solo si hay algo sin leer', () => {
      expect(app).toMatch(/item\.id === 'chat' && noLeidosChat > 0 && \(\s*<span className="neo-nav-badge" data-testid="chat-no-leidos-menu"/);
      expect(app).toMatch(/item\.id === 'chat' && noLeidosChat > 0 && \(\s*<span className="neo-mobile-badge" data-testid="mob-chat-no-leidos-menu"/);
      expect(app.match(/textoContador\(noLeidosChat\)/g)).toHaveLength(2);
    });
    it('los números del menú tienen estilo', () => {
      expect(estilosMenu).toMatch(/\.neo-nav-badge\s*\{/);
      expect(estilosMenu).toMatch(/\.neo-mobile-badge\s*\{/);
    });
  });

  describe('la lista de conversaciones (criterio 1)', () => {
    it('se actualiza sola cada pocos segundos', () => {
      expect(vista).toContain('setInterval(() => void cargarCanales(), INTERVALO_CANALES_MS)');
      expect(vista).toContain('return () => clearInterval(intervalo);');
    });
    it('se ordena por el mensaje más reciente (sin tocar el orden que manda la API)', () => {
      expect(vista).toContain('ordenarCanales(canales).map((c) => {');
      expect(vista).toContain('const canalActivo = canales.find((c) => c.id === canalActivoId) ?? canales[0];');
    });
    it('cada conversación con mensajes sin leer lleva su contador y su nombre en negrita', () => {
      expect(vista).toContain('const pendientes = esActivo && enElFinal ? 0 : c.noLeidos ?? 0;');
      expect(vista).toContain("`chat-canal-nombre ${pendientes > 0 ? 'no-leido' : ''}`");
      expect(vista).toMatch(/\{pendientes > 0 && \(\s*<span className="chat-contador" data-testid=\{`chat-contador-\$\{c\.id\}`\}/);
      expect(vista).toContain('{textoContador(pendientes)}');
      expect(estilosChat).toMatch(/\.chat-canal-nombre\.no-leido\s*\{\s*font-weight: 800;/);
      expect(estilosChat).toMatch(/\.chat-contador\s*\{/);
    });
  });

  describe('lo que se ve queda leído (criterio 3)', () => {
    it('se marca en el servidor con la conversación y el último mensaje que se ve', () => {
      expect(vista).toContain("fetchConSesion('/api/chat/lecturas', {");
      expect(vista).toContain('body: JSON.stringify({ sala, hasta: ultimo.id }),');
    });
    it('solo se marca si se está mirando el final del hilo y la pestaña está a la vista', () => {
      expect(vista).toContain('const ultimo = mensajesRef.current[mensajesRef.current.length - 1];');
      expect(vista).toContain("if (!ultimo || !alFinalRef.current || document.visibilityState !== 'visible') return;");
    });
    it('no se vuelve a avisar del mismo mensaje, y si falla se vuelve a intentar', () => {
      expect(vista).toContain('if (ultimoMarcadoRef.current[sala] === ultimo.id) return;');
      expect(vista.match(/delete ultimoMarcadoRef\.current\[sala\];/g)).toHaveLength(2);
    });
    it('al marcar, el contador de esa conversación se actualiza y se avisa al menú y al título', () => {
      expect(vista).toContain('c.id === lectura.sala ? { ...c, noLeidos: lectura.noLeidos } : c');
      expect(vista).toContain('avisarCambioDeLecturas();');
    });
    it('se marca al llegar mensajes, al volver al final (a mano o con el aviso) y al volver a mirar la pestaña', () => {
      expect(vista).toMatch(/useEffect\(\(\) => \{\s*void marcarLeido\(\);\s*\}, \[mensajes, cargando, marcarLeido\]\);/);
      expect(vista).toContain("document.addEventListener('visibilitychange', alVolver);");
      expect(vista).toContain("window.addEventListener('focus', alVolver);");
      expect(vista).toMatch(/if \(alFinal\) \{\s*setMensajesNuevos\(0\);\s*void marcarLeido\(\);/);
      expect(vista).toMatch(/setMensajesNuevos\(0\);\s*void marcarLeido\(\);\s*\}, \[marcarLeido\]\);/);
    });
    it('leyendo más arriba lo que llega no se marca: se sigue contando hasta volver al final', () => {
      expect(vista).toContain('setEnElFinal(alFinal);');
    });
  });

  it('la conversación que cambia de lugar o se cambia no deja un contador viejo: al cambiar de conversación se está «al final»', () => {
    expect(vista).toMatch(/alFinalRef\.current = true;\s*setEnElFinal\(true\);\s*setMensajes\(\[\]\);/);
  });
});
