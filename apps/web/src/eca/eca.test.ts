import { describe, expect, it, vi } from 'vitest';
import {
  CoberturaEca,
  fetchCoberturaEca,
  fetchMaquinasEca,
  getCoberturaColor,
  MaquinaEca,
} from './eca';

describe('eca module', () => {
  describe('getCoberturaColor', () => {
    it('devuelve color verde para porcentajes altos (>= 80%)', () => {
      expect(getCoberturaColor(100)).toBe('#15803d');
      expect(getCoberturaColor(80)).toBe('#15803d');
    });

    it('devuelve color amarillo para porcentajes medios (40% - 79%)', () => {
      expect(getCoberturaColor(50)).toBe('#b45309');
      expect(getCoberturaColor(40)).toBe('#b45309');
    });

    it('devuelve color rojo para porcentajes bajos (< 40%)', () => {
      expect(getCoberturaColor(0)).toBe('#b91c1c');
      expect(getCoberturaColor(39.9)).toBe('#b91c1c');
    });
  });

  describe('fetchCoberturaEca', () => {
    it('consume /api/eca/cobertura con los parámetros y headers correspondientes', async () => {
      const mockCobertura: CoberturaEca = {
        eca: 'Conservación Porteña S.R.L.',
        mes: '2026-11',
        totalMaquinas: 2,
        inspeccionadas: 1,
        firmadas: 1,
        pendientes: 1,
        advertencias: 0,
        porcentajeInspeccionadas: 50.0,
        porcentajeFirmadas: 50.0,
        porcentajeCobertura: 50.0,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCobertura,
      } as Response);

      const res = await fetchCoberturaEca('Conservación Porteña S.R.L.', '2026-11');
      expect(res.ok).toBe(true);
      expect(res.data).toEqual(mockCobertura);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/eca/cobertura?eca=Conservaci%C3%B3n+Porte%C3%B1a+S.R.L.&mes=2026-11'),
        expect.objectContaining({
          headers: { 'x-eca-name': 'Conservación Porteña S.R.L.' },
        }),
      );
    });

    it('maneja respuestas HTTP no exitosas', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const res = await fetchCoberturaEca('Conservación Porteña S.R.L.', '2026-11');
      expect(res.ok).toBe(false);
      expect(res.error).toContain('500');
    });

    it('captura errores de conexión o excepciones en el fetch', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Fallo de red'));

      const res = await fetchCoberturaEca();
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Fallo de red');
    });
  });

  describe('fetchMaquinasEca', () => {
    it('consume /api/eca/maquinas retornando el catálogo de la flota', async () => {
      const mockMaquinas: MaquinaEca[] = [
        {
          id: 'MAQ-CORRIENTES-M1',
          codigoAGC: 'M1',
          nombre: 'M1: Ascensor Principal',
          edificio: {
            id: 'EDIF-01',
            direccion: 'Av. Corrientes 1234',
            administracion: 'Balvanera SRL',
            consorcio: 'Corrientes 1234',
          },
          eca: 'Conservación Porteña S.R.L.',
          rtCalle: 'dev-ma-2',
          mes: '2026-11',
          estado: 'Recorrida',
          visita: {
            id: 'VIS-101',
            fecha: '2026-11-04T10:00:00Z',
            inspector: 'dev-ma-2',
            estado: 'Recorrida',
            autorizada: true,
            protocoloAGC: 'AGC-2026-AUT-101',
          },
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMaquinas,
      } as Response);

      const res = await fetchMaquinasEca('Conservación Porteña S.R.L.');
      expect(res.ok).toBe(true);
      expect(res.data).toEqual(mockMaquinas);
      expect(res.data?.[0].codigoAGC).toBe('M1');
      expect(res.data?.[0].visita?.autorizada).toBe(true);
    });

    it('maneja errores en fetchMaquinasEca', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Timeout'));

      const res = await fetchMaquinasEca();
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Timeout');
    });
  });
});
