import { describe, expect, it, vi } from 'vitest';
import { type AvisoFalla, aprobarAviso, cargarAvisos, etiquetaCanal, ordenarBandeja, puedeAprobar } from './avisos';

const aviso = (estado: AvisoFalla['estado'], creadoEn: string, id = creadoEn): AvisoFalla => ({
  id, alertaId: id, consorcio: 'C', direccion: 'Calle 1', equipo: 'M1', eca: 'ECA', detalle: 'd', enlaceInforme: '/x', estado, creadoEn,
  aprobadoPor: null, aprobadoEn: null, enlaceVenceEn: null, enlace: null, envios: [],
});
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;

describe('puedeAprobar (HU-11 RF-05)', () => {
  it('«Aprobar y enviar» está disponible si espera revisión o si el envío falló; no si ya se envió', () => {
    expect(puedeAprobar(aviso('Pendiente de revisión', '1'))).toBe(true);
    expect(puedeAprobar(aviso('Falló el envío', '1'))).toBe(true);
    expect(puedeAprobar(aviso('Enviado', '1'))).toBe(false);
  });
});

describe('ordenarBandeja', () => {
  it('primero los pendientes, después los que fallaron y al final los enviados; dentro de cada grupo, los más viejos primero', () => {
    const orden = ordenarBandeja([
      aviso('Enviado', '2026-11-01'),
      aviso('Pendiente de revisión', '2026-11-03', 'p2'),
      aviso('Falló el envío', '2026-11-02'),
      aviso('Pendiente de revisión', '2026-11-02', 'p1'),
    ]);

    expect(orden.map((a) => a.id)).toEqual(['p1', 'p2', '2026-11-02', '2026-11-01']);
  });
  it('no modifica la lista recibida', () => {
    const lista = [aviso('Enviado', '2'), aviso('Pendiente de revisión', '1')];
    ordenarBandeja(lista);
    expect(lista[0].estado).toBe('Enviado');
  });
});

describe('cargarAvisos y aprobarAviso', () => {
  it('cargarAvisos devuelve la lista o null si falla', async () => {
    const lista = [aviso('Pendiente de revisión', '1')];
    expect(await cargarAvisos(vi.fn().mockResolvedValue(respuesta(200, lista)))).toEqual(lista);
    expect(await cargarAvisos(vi.fn().mockResolvedValue(respuesta(403, {})))).toBeNull();
    expect(await cargarAvisos(vi.fn().mockRejectedValue(new Error('x')))).toBeNull();
  });
  it('aprobarAviso hace POST al aviso y devuelve el aviso actualizado', async () => {
    const enviar = vi.fn().mockResolvedValue(respuesta(201, { ...aviso('Enviado', '1'), aprobadoPor: 'sec' }));

    const r = await aprobarAviso('AV-1', enviar);

    expect(r).toMatchObject({ ok: true, aviso: { estado: 'Enviado', aprobadoPor: 'sec' } });
    expect(enviar).toHaveBeenCalledWith('/api/avisos/AV-1/aprobar', expect.objectContaining({ method: 'POST' }));
  });
  it('si la API rechaza devuelve el motivo; un corte de red también', async () => {
    expect(await aprobarAviso('AV-1', vi.fn().mockResolvedValue(respuesta(409, { message: 'Este aviso ya fue aprobado y enviado.' })))).toEqual({ ok: false, error: 'Este aviso ya fue aprobado y enviado.' });
    expect(await aprobarAviso('AV-1', vi.fn().mockRejectedValue(new Error('Sin conexión')))).toEqual({ ok: false, error: 'Sin conexión' });
  });
});

describe('etiquetaCanal', () => {
  it('nombra cada canal', () => {
    expect(etiquetaCanal('whatsapp_eca')).toBe('WhatsApp a la ECA');
    expect(etiquetaCanal('whatsapp_firmante')).toBe('WhatsApp al Firmante');
    expect(etiquetaCanal('email_eca')).toBe('Correo a la ECA');
  });
});
