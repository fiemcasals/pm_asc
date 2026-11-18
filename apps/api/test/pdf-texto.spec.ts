import { esImprimibleEnPdf, textoParaPdf } from '../src/eca/pdf-texto';

// HU-10 RF-07 — El texto que va al PDF sólo puede tener lo que la fuente estándar dibuja.
describe('textoParaPdf', () => {
  it('deja igual lo que la fuente puede dibujar: acentos, ñ, comillas tipográficas, guiones largos, viñeta y euro', () => {
    const texto = 'Av. Santa Fe 3200, CABA — «piso 4» Ñandú, güemes ½ € “comillas” • 100% – ok';

    expect(textoParaPdf(texto)).toBe(texto);
  });

  it('descarta los emojis y deja el resto del texto: el título de la alerta sale limpio', () => {
    expect(textoParaPdf('⚠️ REPARACIÓN URGENTE')).toBe('REPARACIÓN URGENTE');
    expect(textoParaPdf('🚨 FUERA DE SERVICIO: Cabina Trabada')).toBe('FUERA DE SERVICIO: Cabina Trabada');
    expect(textoParaPdf('✓ OK ✔ ✅ ❌ ★ → ←')).toBe('OK');
  });

  it('un emoji en el medio no deja un hueco: se juntan los espacios', () => {
    expect(textoParaPdf('Cabina 🚨 trabada ⚠️ en piso 4')).toBe('Cabina trabada en piso 4');
  });

  it.each([
    ['familia con unión de ancho cero', '👨‍👩‍👧', ''],
    ['bandera', '🇦🇷', ''],
    ['número con marco (el dígito queda)', '1️⃣', '1'],
    ['con tono de piel', '👍🏽', ''],
  ])('emoji compuesto: %s', (_n, entrada, esperado) => {
    expect(textoParaPdf(entrada)).toBe(esperado);
  });

  it('una letra con acento que la fuente no tiene vuelve a su letra base', () => {
    expect(textoParaPdf('ő')).toBe('o');
    expect(textoParaPdf('ą')).toBe('a');
    expect(textoParaPdf('ǎ')).toBe('a');
    expect(textoParaPdf('Nagy Zoltán őr')).toBe('Nagy Zoltán or');
  });

  it('una letra de otro alfabeto se marca con «?»: no se pierde en silencio', () => {
    expect(textoParaPdf('Москва')).toBe('??????');
    expect(textoParaPdf('東京')).toBe('??');
    expect(textoParaPdf('Ω')).toBe('?');
    expect(textoParaPdf('Edificio Москва 12')).toBe('Edificio ?????? 12');
  });

  it('descarta los caracteres invisibles, de dirección y de control', () => {
    expect(textoParaPdf('​‎﻿hola‮')).toBe('hola');
    expect(textoParaPdf('a\u0000b\u0007c\u007Fd\u0085e')).toBe('abcde');
    expect(textoParaPdf('guion­blando')).toBe('guionblando');
  });

  it('conserva los saltos de línea; junta espacios, cambia tabulaciones y recorta los bordes', () => {
    expect(textoParaPdf('uno\r\ndos\t tres')).toBe('uno\ndos tres');
    expect(textoParaPdf('a\tb')).toBe('a b');
    expect(textoParaPdf('  uno   dos  \n  tres  ')).toBe('uno dos\ntres');
    expect(textoParaPdf('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('null, undefined y números no rompen', () => {
    expect(textoParaPdf(null)).toBe('');
    expect(textoParaPdf(undefined)).toBe('');
    expect(textoParaPdf(42)).toBe('42');
    expect(textoParaPdf('')).toBe('');
  });

  it('esImprimibleEnPdf: los límites de la codificación', () => {
    const si = [0x20, 0x7e, 0xa0, 0xff, 0x20ac, 0x2013, 0x2022, 0x2122, 0x0152, 0x017e];
    const no = [0x00, 0x1f, 0x7f, 0x80, 0x9f, 0xad, 0x100, 0x2713, 0x26a0, 0x1f6a8, 0xfe0f, 0x200d];

    for (const cp of si) expect([cp.toString(16), esImprimibleEnPdf(cp)]).toEqual([cp.toString(16), true]);
    for (const cp of no) expect([cp.toString(16), esImprimibleEnPdf(cp)]).toEqual([cp.toString(16), false]);
  });

  describe('propiedades con cadenas al azar (semilla fija)', () => {
    // Generador pseudoaleatorio determinista: la prueba siempre ve las mismas cadenas.
    const azar = (semilla: number) => () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const cadenas = (() => {
      const r = azar(20261118);
      return Array.from({ length: 600 }, () =>
        Array.from({ length: 1 + Math.floor(r() * 30) }, () => {
          const zona = r();
          const cp = zona < 0.35 ? 0x20 + Math.floor(r() * 0x5f) : zona < 0.6 ? 0xa0 + Math.floor(r() * 0x60) : zona < 0.8 ? Math.floor(r() * 0x3000) : 0x1f300 + Math.floor(r() * 0x500);
          return cp >= 0xd800 && cp <= 0xdfff ? ' ' : String.fromCodePoint(cp);
        }).join(''),
      );
    })();

    it('todo lo que sale se puede dibujar (o es un salto de línea)', () => {
      for (const s of cadenas) for (const c of textoParaPdf(s)) expect([s, c === '\n' || esImprimibleEnPdf(c.codePointAt(0) as number)]).toEqual([s, true]);
    });

    it('es idempotente: limpiar dos veces da lo mismo que limpiar una', () => {
      for (const s of cadenas) expect(textoParaPdf(textoParaPdf(s))).toBe(textoParaPdf(s));
    });

    it('nunca deja espacios ni saltos al borde ni espacios repetidos', () => {
      for (const s of cadenas) {
        const t = textoParaPdf(s);
        expect([s, t === t.trim(), !/ {2}/.test(t)]).toEqual([s, true, true]);
      }
    });
  });
});
