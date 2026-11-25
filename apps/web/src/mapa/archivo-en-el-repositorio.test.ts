import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CABA, ZOOM } from './config';

// HU-16 RF-06 — el archivo del mapa de CABA va con el repositorio: sin él, el sitio armado desde el repositorio dibuja todos los mapas vacíos.
const archivo = fileURLToPath(new URL('../../public/mapa/caba.pmtiles', import.meta.url));
const raiz = fileURLToPath(new URL('../../../../', import.meta.url));

describe('el archivo del mapa de CABA está en el repositorio (criterio 1)', () => {
  it('existe donde la app lo pide (/mapa/caba.pmtiles se sirve desde apps/web/public)', () => {
    expect(existsSync(archivo)).toBe(true);
  });

  it('pesa entre 1 y 60 MB (el tope de HU-16 RF-03)', () => {
    const mb = statSync(archivo).size / 1048576;
    expect(mb).toBeGreaterThan(1);
    expect(mb).toBeLessThanOrEqual(60);
  });

  describe('su cabecera es la de un PMTiles v3 del recuadro de CABA', () => {
    const cabecera = readFileSync(archivo).subarray(0, 127);
    const grados = (desplazamiento: number) => cabecera.readInt32LE(desplazamiento) / 1e7;

    it('empieza con «PMTiles» y es la versión 3', () => {
      expect(cabecera.subarray(0, 7).toString('latin1')).toBe('PMTiles');
      expect(cabecera[7]).toBe(3);
    });

    it('tiene mosaicos (no es un archivo vacío) y llega al zoom que usan los mapas', () => {
      expect(Number(cabecera.readBigUInt64LE(72))).toBeGreaterThan(100);
      expect(cabecera[100]).toBeLessThanOrEqual(ZOOM.min);
      expect(cabecera[101]).toBeGreaterThanOrEqual(14);
    });

    it('cubre CABA: su recuadro es el mismo que usa el mapa de la app', () => {
      expect(grados(102)).toBeCloseTo(CABA.oeste, 3);
      expect(grados(110)).toBeCloseTo(CABA.este, 3);
      expect(grados(106)).toBeCloseTo(CABA.sur, 3);
      expect(grados(114)).toBeCloseTo(CABA.norte, 3);
    });
  });

  it('git no lo ignora: no hay ninguna regla activa en .gitignore para el archivo del mapa', () => {
    const reglas = readFileSync(`${raiz}.gitignore`, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(reglas.filter((r) => /pmtiles|public\/mapa/.test(r))).toEqual([]);
  });

  it('git lo trata como binario (no le cambia los saltos de línea)', () => {
    const atributos = readFileSync(`${raiz}.gitattributes`, 'utf8');
    expect(atributos).toMatch(/^\*\.pmtiles\s+binary\s*$/m);
  });
});
