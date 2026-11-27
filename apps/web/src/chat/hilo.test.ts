import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MensajeChat } from './ChatOperativoView';
import { estaAlFinal, fusionarVentana, MARGEN_AL_FINAL, sumarAnteriores, sumarPropio } from './hilo';

// HU-19 RF-02 — el hilo: cómo se juntan los mensajes que llegan con los que ya se ven, y cuándo se está «al final».
function msg(n: number, extra: Partial<MensajeChat> = {}): MensajeChat {
  return {
    id: `id-${n}`,
    emisorId: 'u-ana',
    emisorNombre: 'Ana',
    emisorUsuario: 'rt.ana',
    emisorRol: 'rt_calle',
    destinatarioId: null,
    tipoSala: 'global',
    contenido: `msg ${n}`,
    // una fecha por mensaje, creciente, en el mismo formato que devuelve la API
    creadoEn: new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + n * 1000).toISOString(),
    ...extra,
  };
}
const rango = (desde: number, hasta: number) => Array.from({ length: hasta - desde + 1 }, (_, i) => msg(desde + i));
const ids = (lista: MensajeChat[]) => lista.map((m) => m.id);

describe('estaAlFinal (criterio 4 y 5: se está leyendo más arriba o al final)', () => {
  it('al final exacto y dentro del margen cuenta como al final', () => {
    expect(estaAlFinal(600, 400, 1000)).toBe(true); // 1000 - 600 - 400 = 0
    expect(estaAlFinal(600 - MARGEN_AL_FINAL, 400, 1000)).toBe(true); // justo en el margen
  });

  it('con los números a la vista: a 80 px del final todavía es el final y a 81 px ya no', () => {
    expect(estaAlFinal(520, 400, 1000)).toBe(true); // faltan 80 px
    expect(estaAlFinal(519, 400, 1000)).toBe(false); // faltan 81 px
    expect(MARGEN_AL_FINAL).toBe(80);
  });

  it('un poco más arriba del margen ya es leer mensajes anteriores', () => {
    expect(estaAlFinal(600 - MARGEN_AL_FINAL - 1, 400, 1000)).toBe(false);
    expect(estaAlFinal(0, 400, 1000)).toBe(false);
  });

  it('un hilo más corto que la pantalla siempre está al final', () => {
    expect(estaAlFinal(0, 400, 300)).toBe(true);
  });

  it('el margen se puede cambiar', () => {
    expect(estaAlFinal(500, 400, 1000, 100)).toBe(true);
    expect(estaAlFinal(499, 400, 1000, 100)).toBe(false);
  });
});

describe('fusionarVentana (criterios 1, 3 y 4: la actualización automática no pisa lo leído)', () => {
  it('si no hay nada nuevo devuelve la MISMA lista, para no volver a dibujar ni mover el hilo', () => {
    const actuales = rango(1, 10);
    const { lista, nuevos } = fusionarVentana(actuales, rango(1, 10));
    expect(lista).toBe(actuales);
    expect(nuevos).toEqual([]);
  });

  it('un mensaje nuevo se suma al final y se informa como nuevo', () => {
    const actuales = rango(1, 10);
    const { lista, nuevos } = fusionarVentana(actuales, rango(1, 11));
    expect(ids(lista)).toEqual(ids(rango(1, 11)));
    expect(ids(nuevos)).toEqual(['id-11']);
  });

  it('los mensajes anteriores ya cargados con «Ver mensajes anteriores» se conservan cuando la ventana de los más nuevos no los trae', () => {
    const actuales = [...rango(1, 50), ...rango(51, 250)]; // 250 en pantalla: la ventana de 200 llega hasta el 51
    const ventana = rango(51, 250);
    const { lista, nuevos } = fusionarVentana(actuales, ventana);
    expect(lista).toBe(actuales);
    expect(nuevos).toEqual([]);
    const conUnoNuevo = fusionarVentana(actuales, rango(52, 251));
    expect(ids(conUnoNuevo.lista)).toEqual(ids(rango(1, 251)));
    expect(ids(conUnoNuevo.nuevos)).toEqual(['id-251']);
  });

  it('con una ventana vacía no cambia nada', () => {
    const actuales = rango(1, 3);
    expect(fusionarVentana(actuales, []).lista).toBe(actuales);
    expect(fusionarVentana([], []).lista).toEqual([]);
  });

  it('la primera carga (nada en pantalla) toma la ventana completa', () => {
    const { lista, nuevos } = fusionarVentana([], rango(1, 5));
    expect(ids(lista)).toEqual(ids(rango(1, 5)));
    expect(nuevos).toHaveLength(5);
  });

  it('un mensaje propio puesto al enviar que la ventana ya trae no queda repetido', () => {
    const actuales = [...rango(1, 5), msg(6)];
    const { lista } = fusionarVentana(actuales, rango(1, 6));
    expect(ids(lista)).toEqual(ids(rango(1, 6)));
  });

  it('lo que la ventana ya no trae y no es anterior a ella (algo que dejó de existir) no se conserva', () => {
    const actuales = [...rango(1, 3), msg(9)];
    const { lista } = fusionarVentana(actuales, rango(1, 3));
    expect(ids(lista)).toEqual(ids(rango(1, 3)));
  });

  it('el orden de la ventana (el del servidor) manda', () => {
    const a = msg(1), b = msg(2);
    const { lista } = fusionarVentana([], [a, b]);
    expect(ids(lista)).toEqual(['id-1', 'id-2']);
  });
});

describe('sumarAnteriores (criterio 3)', () => {
  it('pone los anteriores arriba, en su orden, sin repetir ninguno', () => {
    const actuales = rango(51, 60);
    const lista = sumarAnteriores(actuales, [...rango(41, 50), msg(51)]);
    expect(ids(lista)).toEqual(ids(rango(41, 60)));
  });

  it('si no hay nada para agregar devuelve la misma lista', () => {
    const actuales = rango(1, 3);
    expect(sumarAnteriores(actuales, [])).toBe(actuales);
    expect(sumarAnteriores(actuales, rango(1, 2))).toBe(actuales);
  });
});

describe('sumarPropio', () => {
  it('suma el mensaje enviado al final, salvo que ya esté', () => {
    const actuales = rango(1, 3);
    expect(ids(sumarPropio(actuales, msg(4)))).toEqual(ids(rango(1, 4)));
    expect(sumarPropio(actuales, msg(2))).toBe(actuales);
  });
});

describe('la pantalla del chat usa el hilo así (criterios 3 a 5)', () => {
  const vista = readFileSync(fileURLToPath(new URL('./ChatOperativoView.tsx', import.meta.url)), 'utf8');
  const estilos = readFileSync(fileURLToPath(new URL('./chat.css', import.meta.url)), 'utf8');

  it('la actualización automática no baja siempre el hilo: ya no hay un efecto que baje al final con cada cambio de mensajes', () => {
    expect(vista).not.toMatch(/useEffect\(\(\) => \{\s*if \(scrollRef\.current\) \{\s*scrollRef\.current\.scrollTop = scrollRef\.current\.scrollHeight;/);
    expect(vista).toContain("modo === 'fondo'");
  });

  it('junta con fusionarVentana en vez de reemplazar los mensajes, y pide los anteriores con «antes»', () => {
    expect(vista).toContain('fusionarVentana(mensajesRef.current, data)');
    expect(vista).not.toMatch(/setMensajes\(data\);\s*\n\s*\}\s*\n\s*\} catch/);
    expect(vista).toContain('&antes=${encodeURIComponent(masViejo.id)}');
    expect(vista).toContain('X-Hay-Anteriores');
  });

  it('muestra «Ver mensajes anteriores» solo si quedan anteriores, y el aviso «Mensajes nuevos ↓» solo si llegaron mensajes leyendo más arriba', () => {
    expect(vista).toContain('Ver mensajes anteriores');
    expect(vista).toMatch(/\{!cargando && hayAnteriores && \(/);
    expect(vista).toContain('Mensajes nuevos ↓');
    expect(vista).toMatch(/\{mensajesNuevos > 0 && \(/);
    expect(vista).toContain('data-testid="chat-btn-anteriores"');
    expect(vista).toContain('data-testid="chat-aviso-mensajes-nuevos"');
  });

  it('al enviar un mensaje propio el hilo baja, y al cambiar de conversación se empieza de cero', () => {
    expect(vista).toMatch(/modoScrollRef\.current = 'fondo';\s*\n\s*setMensajes\(\(prev\) => sumarPropio\(prev, nuevo\)\);/);
    expect(vista).toMatch(/canalRef\.current = canalActivoId;[\s\S]*?cargadoRef\.current = false;[\s\S]*?setMensajes\(\[\]\);/);
  });

  it('una respuesta que llega de otra conversación (se cambió mientras tanto) se descarta', () => {
    expect(vista.match(/canalRef\.current !== sala/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('las reglas del hilo: baja solo si se estaba al final, avisa solo de mensajes ajenos, se queda donde estaba al sumar anteriores, y el aviso se va al llegar abajo', () => {
    expect(vista).toContain("if (alFinalRef.current) modoScrollRef.current = 'fondo';");
    expect(vista).toContain('const deOtros = nuevos.filter((m) => !esPropio(m)).length;');
    expect(vista).toContain('if (deOtros > 0) setMensajesNuevos((n) => n + deOtros);');
    expect(vista).toContain("modoScrollRef.current = 'mantener';");
    expect(vista).toContain('area.scrollTop = medidaAntesRef.current.arriba + (area.scrollHeight - medidaAntesRef.current.alto);');
    expect(vista).toContain('if (area) medidaAntesRef.current = { alto: area.scrollHeight, arriba: area.scrollTop };');
    expect(vista).toMatch(/if \(alFinal\) \{\s*setMensajesNuevos\(0\);/);
    expect(vista).toContain('const alFinal = estaAlFinal(');
    expect(vista).toContain('onScroll={alMoverElHilo}');
    expect(vista).toContain('onClick={irAlFinal}');
    expect(vista).toContain("if (lista === mensajesRef.current) return;");
    expect(vista.match(/res\.headers\.get\('X-Hay-Anteriores'\) === 'true'/g)).toHaveLength(2);
  });

  it('el aviso y el botón tienen estilo', () => {
    expect(estilos).toMatch(/\.chat-aviso-nuevos\s*\{/);
    expect(estilos).toMatch(/\.chat-btn-anteriores\s*\{/);
    expect(estilos).toMatch(/\.chat-hilo-contenedor\s*\{/);
  });
});
