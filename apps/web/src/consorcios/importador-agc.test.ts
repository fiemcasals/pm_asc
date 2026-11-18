import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  importarExcelAgc,
  MAX_BYTES_EXCEL_AGC,
  validarArchivoExcelAgc,
} from './consorcios';
import { ImportadorExcelAgc } from './ImportadorExcelAgc';
import { SecretariaView } from './SecretariaView';

describe('HU-01 RF-03 · Importador Excel AGC en Secretaría', () => {
  it('valida extensión .xlsx y límite de 5 MB en cliente', () => {
    expect(validarArchivoExcelAgc(null)).toContain('.xlsx');
    expect(validarArchivoExcelAgc({ name: 'padron.csv', size: 1024 })).toContain('.xlsx');
    expect(validarArchivoExcelAgc({ name: 'vacio.xlsx', size: 0 })).toContain('vacío');
    expect(validarArchivoExcelAgc({ name: 'grande.xlsx', size: MAX_BYTES_EXCEL_AGC + 1 })).toContain('5 MB');
    expect(validarArchivoExcelAgc({ name: 'padron-agc.xlsx', size: 2048 })).toBeNull();
    expect(validarArchivoExcelAgc({ name: 'PADRON.XLSX', size: MAX_BYTES_EXCEL_AGC })).toBeNull();
  });

  it('renderiza el botón Importar Excel AGC en SecretariaView y el panel del importador', () => {
    const htmlSec = renderToStaticMarkup(React.createElement(SecretariaView));
    expect(htmlSec).toContain('Importar Excel AGC');

    const htmlPanel = renderToStaticMarkup(
      React.createElement(ImportadorExcelAgc, {
        onImportacionCompleta: () => undefined,
        onCerrar: () => undefined,
      }),
    );
    expect(htmlPanel).toContain('Importar listado Excel de la AGC (.xlsx)');
    expect(htmlPanel).toContain('Descargar plantilla .xlsx');
    expect(htmlPanel).toContain('Importar listado AGC');
    expect(htmlPanel).toContain('Máximo 5 MB');
  });

  it('importarExcelAgc envía multipart/form-data y devuelve resumen estructurado', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        resumen: { totalFilas: 3, creadas: 2, actualizadas: 0, rechazadas: 1, consorciosCreados: 1 },
        creadas: 2,
        actualizadas: 0,
        rechazadas: 1,
        consorciosCreados: 1,
        errores: [{ fila: 4, matriculaAgc: 'AGC-X', motivo: 'Falta la dirección del edificio' }],
        detalle: [],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);
    try {
      const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'padron.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const res = await importarExcelAgc(file);
      expect(res.ok).toBe(true);
      expect(res.data?.creadas).toBe(2);
      expect(res.data?.rechazadas).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/consorcios/importar-agc');
      expect(opts.method).toBe('POST');
      expect(opts.body).toBeInstanceOf(FormData);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
