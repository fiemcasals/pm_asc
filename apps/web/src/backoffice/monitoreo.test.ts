import { describe, expect, it, vi } from 'vitest';
import {
  accionDe, cargarDetalle, cargarMonitoreo, enviarRemitoEca, fecha, FILTROS_VACIOS, fotoSegura, reclamarAdmin, resumenChecklist, textoFirmante, urlMonitoreo, type FilaMonitoreo,
} from './monitoreo';

// HU-05 RF-02: tablero de monitoreo.
const fila = (extra: Partial<FilaMonitoreo> = {}): FilaMonitoreo => ({
  id: 'V1', maquinaId: 'M1', codigoAGC: 'M1', equipo: 'Ascensor', direccion: 'Av. Callao 850, CABA', consorcio: 'C', eca: 'ECA Uno', inspector: 'ana', estadoVisita: 'Recorrida',
  fecha: '2026-11-04T10:30:00.000Z', estadoOperativo: 'Normal', firmante: 'gonza', autorizada: false, rechazada: false, alertaCritica: false, remito: null,
  administracion: 'Administración Uno', reclamo: null, fotos: 0, itemsChecklist: 0, ...extra,
});
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;

describe('urlMonitoreo (filtros en tiempo real)', () => {
  it('sin filtros pide sólo la página y el tamaño', () => {
    expect(urlMonitoreo(FILTROS_VACIOS, 1)).toBe('/api/backoffice/monitoreo?pagina=1&porPagina=10');
  });
  it('manda sólo los filtros con algo escrito, sin espacios en los bordes y codificados', () => {
    expect(urlMonitoreo({ direccion: '  Callao 850 ', eca: '', inspector: 'germán', estado: 'Advertencia' }, 3, 5)).toBe(
      '/api/backoffice/monitoreo?direccion=Callao+850&inspector=germ%C3%A1n&estado=Advertencia&pagina=3&porPagina=5',
    );
    expect(urlMonitoreo({ ...FILTROS_VACIOS, direccion: '   ' }, 1)).not.toContain('direccion');
  });
});

describe('accionDe (criterio 2: Enviar Remito a ECA o Reclamar a Admin según el estado de la visita)', () => {
  it('una visita Recorrida sin remito → «Enviar Remito a ECA»', () => {
    expect(accionDe(fila())).toEqual({ tipo: 'enviar_remito', etiqueta: 'Enviar Remito a ECA' });
  });
  it('una Recorrida con remito ya enviado → no se vuelve a mandar y dice a quién y cuándo', () => {
    const a = accionDe(fila({ remito: { enviadoPor: 'sec', enviadoEn: '2026-11-17T13:00:00.000Z', eca: 'ECA Uno' } }));

    expect(a.tipo).toBe('remito_enviado');
    expect(a.etiqueta).toBe('Remito enviado a ECA Uno el 17/11/2026 10:00');
  });
  it('una visita con Advertencia sin reclamo → «Reclamar a Admin»', () => {
    expect(accionDe(fila({ estadoVisita: 'Advertencia' }))).toEqual({ tipo: 'reclamar_admin', etiqueta: 'Reclamar a Admin' });
  });
  it('una con Advertencia y reclamo hecho → no se reclama de nuevo y dice a quién y cuándo', () => {
    const a = accionDe(fila({ estadoVisita: 'Advertencia', reclamo: { reclamadoPor: 'sec', reclamadoEn: '2026-11-17T13:00:00.000Z', administracion: 'Administración Uno' } }));

    expect(a).toEqual({ tipo: 'reclamo_hecho', etiqueta: 'Reclamo enviado a Administración Uno el 17/11/2026 10:00' });
  });
  it('un equipo Pendiente de Visita no tiene acción', () => {
    expect(accionDe(fila({ estadoVisita: 'Pendiente de Visita', fecha: null }))).toEqual({ tipo: 'ninguna', etiqueta: 'Sin visita todavía' });
  });
  it('el remito no se ofrece en una visita con advertencia ni el reclamo en una Recorrida', () => {
    expect(accionDe(fila({ estadoVisita: 'Advertencia' })).tipo).not.toBe('enviar_remito');
    expect(accionDe(fila({ estadoVisita: 'Recorrida' })).tipo).not.toBe('reclamar_admin');
  });
});

describe('textos de las columnas (criterio 1)', () => {
  it('fecha en hora de Buenos Aires, o «—»', () => {
    expect(fecha('2026-11-04T10:30:00.000Z')).toBe('04/11/2026 07:30');
    expect(fecha('2026-11-05T02:30:00.000Z')).toBe('04/11/2026 23:30');
    expect(fecha(null)).toBe('—');
    expect(fecha('ayer')).toBe('—');
  });
  it('checklist: ítems y fotos, o «Sin informe»', () => {
    expect(resumenChecklist({ itemsChecklist: 4, fotos: 2 })).toBe('4 ítems · 2 fotos');
    expect(resumenChecklist({ itemsChecklist: 1, fotos: 1 })).toBe('1 ítem · 1 foto');
    expect(resumenChecklist({ itemsChecklist: 0, fotos: 3 })).toBe('3 fotos');
    expect(resumenChecklist({ itemsChecklist: 0, fotos: 0 })).toBe('Sin informe');
  });
  it('firmante AGC con el estado de su autorización', () => {
    expect(textoFirmante({ firmante: 'gonza', autorizada: false, rechazada: false })).toBe('gonza · Sin autorizar');
    expect(textoFirmante({ firmante: 'gonza', autorizada: true, rechazada: false })).toBe('gonza · Autorizó');
    expect(textoFirmante({ firmante: 'gonza', autorizada: false, rechazada: true })).toBe('gonza · Rechazó');
  });
});

describe('fotoSegura (visor de fotos)', () => {
  it('acepta http(s) y data URL de imagen; descarta javascript:, otros esquemas y data URL que no son imagen', () => {
    expect(fotoSegura('https://storage.nuestrocamino.cloud/fotos/a.jpg')).toBe(true);
    expect(fotoSegura('http://x/y.png')).toBe(true);
    expect(fotoSegura('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    for (const mala of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'ftp://x/y.jpg', '', 'https://a/x" onerror="y', '//cdn/x.jpg']) expect(fotoSegura(mala)).toBe(false);
  });
});

describe('llamadas a la API', () => {
  it('cargarMonitoreo y cargarDetalle devuelven lo que manda la API o null', async () => {
    const pag = { total: 0, pagina: 1, porPagina: 10, totalPaginas: 1, items: [] };
    const enviar = vi.fn().mockResolvedValue(respuesta(200, pag));
    expect(await cargarMonitoreo({ ...FILTROS_VACIOS, eca: 'maicon' }, 2, enviar)).toEqual(pag);
    expect(enviar).toHaveBeenCalledWith('/api/backoffice/monitoreo?eca=maicon&pagina=2&porPagina=10');
    expect(await cargarMonitoreo(FILTROS_VACIOS, 1, vi.fn().mockResolvedValue(respuesta(403, {})))).toBeNull();
    expect(await cargarMonitoreo(FILTROS_VACIOS, 1, vi.fn().mockRejectedValue(new Error('x')))).toBeNull();
    const det = { id: 'V1' };
    const d = vi.fn().mockResolvedValue(respuesta(200, det));
    expect(await cargarDetalle('MAQ 1/2', d)).toEqual(det);
    expect(d).toHaveBeenCalledWith('/api/backoffice/visitas/MAQ%201%2F2');
    expect(await cargarDetalle('x', vi.fn().mockResolvedValue(respuesta(404, {})))).toBeNull();
  });

  it('enviarRemitoEca y reclamarAdmin hacen POST con la máquina y devuelven ok o el motivo del rechazo', async () => {
    const ok = vi.fn().mockResolvedValue(respuesta(201, {}));
    expect(await enviarRemitoEca('MAQ-1', ok)).toEqual({ ok: true });
    expect(ok).toHaveBeenCalledWith('/api/backoffice/remito-eca', expect.objectContaining({ method: 'POST', body: JSON.stringify({ maquinaId: 'MAQ-1' }) }));
    expect(await reclamarAdmin('MAQ-1', vi.fn().mockResolvedValue(respuesta(201, {})))).toEqual({ ok: true });
    expect(await reclamarAdmin('MAQ-1', ok)).toEqual({ ok: true });
    expect(ok).toHaveBeenLastCalledWith('/api/backoffice/reclamo-admin', expect.anything());
    expect(await enviarRemitoEca('M', vi.fn().mockResolvedValue(respuesta(409, { message: 'El remito de esta visita ya se mandó.' })))).toEqual({ ok: false, error: 'El remito de esta visita ya se mandó.' });
    expect(await reclamarAdmin('M', vi.fn().mockRejectedValue(new Error('Sin conexión')))).toEqual({ ok: false, error: 'Sin conexión' });
  });
});
