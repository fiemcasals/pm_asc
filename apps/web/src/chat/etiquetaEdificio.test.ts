import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_CARACTERES_MAQUINA, textoDeEtiqueta } from './etiquetaEdificio';

// HU-19 RF-07 — la etiqueta de edificio se elige para cada mensaje y la ve todo el que lo lee.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');
const vista = leer('./ChatOperativoView.tsx');

describe('criterio 2: lo que dice la etiqueta', () => {
  it('«📍 edificio» y, si se indicó, la máquina', () => {
    expect(textoDeEtiqueta('DEMO Cabildo 1540', 'M1')).toBe('📍 DEMO Cabildo 1540 · Ascensor M1');
    expect(textoDeEtiqueta('DEMO Cabildo 1540', null)).toBe('📍 DEMO Cabildo 1540');
    expect(textoDeEtiqueta('DEMO Cabildo 1540', '  ')).toBe('📍 DEMO Cabildo 1540');
  });
  it('sin edificio no hay etiqueta (aunque venga una máquina)', () => {
    expect(textoDeEtiqueta(null, 'M1')).toBeNull();
    expect(textoDeEtiqueta('', null)).toBeNull();
    expect(textoDeEtiqueta(undefined, undefined)).toBeNull();
  });
  it('la pantalla la muestra con textoDeEtiqueta (lo que manda la API, guardado con el mensaje)', () => {
    expect(vista).toContain('{textoDeEtiqueta(m.edificioNombre, m.maquinaRef)}');
  });
});

describe('criterio 1: el edificio se elige para cada mensaje', () => {
  it('después de un envío que salió bien, el selector vuelve a «(Opcional) Vincular Edificio…» y la máquina se vacía', () => {
    const enviar = vista.slice(vista.indexOf('const handleEnviar'), vista.indexOf('const canalActivo'));
    const ok = enviar.slice(enviar.indexOf('if (res.ok) {'));
    expect(ok).toMatch(/setConsorcioSeleccionado\(''\);\s*setMaquinaRef\(''\);/);
    expect(vista).toContain('<option value="">(Opcional) Vincular Edificio…</option>');
  });
});

describe('criterio 3: el campo de la máquina', () => {
  it('aparece solo con un edificio elegido', () => {
    expect(vista).toMatch(/\{consorcioSeleccionado && \(\s*<input/);
  });
  it('admite hasta 40 caracteres, igual que la API', () => {
    expect(MAX_CARACTERES_MAQUINA).toBe(40);
    const api = /export const LIMITE_MAQUINA = (\d+);/.exec(leer('../../../api/src/chat/chat.types.ts'));
    expect(Number(api![1])).toBe(MAX_CARACTERES_MAQUINA);
    expect(vista).toContain('maxLength={MAX_CARACTERES_MAQUINA}');
  });
  it('se vacía al quitar el edificio', () => {
    expect(vista).toContain("if (!e.target.value) setMaquinaRef('');");
  });
});

describe('criterio 4: el selector ofrece los edificios que la persona puede ver', () => {
  it('la lista sale de /api/consorcios, que ya filtra por la seguridad por edificio de quien pide', () => {
    expect(vista).toContain("const res = await fetchConSesion('/api/consorcios');");
  });
});
