import { describe, expect, it } from 'vitest';
import {
  autorizarFirmaMaquina,
  fetchMaquinasFirmante,
  type MaquinaAsignada,
  obtenerMotivoBloqueo,
  puedeAutorizar,
} from './firmante';

const mockMaquinaRecorridaValida: MaquinaAsignada = {
  id: 'MAQ-1',
  codigoAGC: 'M1',
  nombre: 'M1: Ascensor Principal',
  edificio: {
    id: 'E1',
    direccion: 'Av. Corrientes 1234, CABA',
    administracion: 'Admin Central',
    consorcio: 'Consorcio 1234',
  },
  eca: 'Conservación SRL',
  rtCalle: 'dev-ma-2',
  firmanteId: 'USR-1',
  firmanteUsername: 'gonza',
  mes: '2026-11',
  estado: 'Recorrida',
  visita: {
    id: 'VIS-1',
    fecha: '2026-11-04T10:00:00Z',
    inspector: 'dev-ma-2',
    estado: 'Recorrida',
    fotosObligatorias: {
      cables: 'https://fotos.local/cables.jpg',
      frente: 'https://fotos.local/frente.jpg',
    },
    firmaEncargado: 'data:image/svg+xml;base64,abc',
    nombreEncargado: 'Carlos',
    autorizada: false,
  },
};

const mockMaquinaPendiente: MaquinaAsignada = {
  ...mockMaquinaRecorridaValida,
  id: 'MAQ-2',
  codigoAGC: 'M2',
  estado: 'Pendiente de Visita',
  visita: null,
};

const mockMaquinaAdvertencia: MaquinaAsignada = {
  ...mockMaquinaRecorridaValida,
  id: 'MAQ-3',
  estado: 'Advertencia',
  visita: {
    ...mockMaquinaRecorridaValida.visita!,
    id: 'VIS-3',
    estado: 'Advertencia',
    motivoAdvertencia: 'Encargado ausente',
    fotosObligatorias: null,
    firmaEncargado: null,
  },
};

const mockMaquinaSinCables: MaquinaAsignada = {
  ...mockMaquinaRecorridaValida,
  id: 'MAQ-4',
  visita: {
    ...mockMaquinaRecorridaValida.visita!,
    fotosObligatorias: {
      cables: '',
      frente: 'https://fotos.local/frente.jpg',
    },
  },
};

const mockMaquinaSinFirma: MaquinaAsignada = {
  ...mockMaquinaRecorridaValida,
  id: 'MAQ-5',
  visita: {
    ...mockMaquinaRecorridaValida.visita!,
    firmaEncargado: null,
  },
};

describe('Reglas de negocio del Firmante (HU-08 / RF-02)', () => {
  describe('puedeAutorizar', () => {
    it('habilita la autorización únicamente si la visita está Recorrida, con fotos y firma', () => {
      expect(puedeAutorizar(mockMaquinaRecorridaValida)).toBe(true);
    });

    it('bloquea la autorización si la máquina está en estado Pendiente de Visita', () => {
      expect(puedeAutorizar(mockMaquinaPendiente)).toBe(false);
    });

    it('bloquea la autorización si la máquina está en estado Advertencia', () => {
      expect(puedeAutorizar(mockMaquinaAdvertencia)).toBe(false);
    });

    it('bloquea la autorización si falta la foto obligatoria de cables', () => {
      expect(puedeAutorizar(mockMaquinaSinCables)).toBe(false);
    });

    it('bloquea la autorización si falta la firma del encargado', () => {
      expect(puedeAutorizar(mockMaquinaSinFirma)).toBe(false);
    });

    it('bloquea si ya fue autorizada previamente', () => {
      const yaAutorizada: MaquinaAsignada = {
        ...mockMaquinaRecorridaValida,
        visita: {
          ...mockMaquinaRecorridaValida.visita!,
          autorizada: true,
        },
      };
      expect(puedeAutorizar(yaAutorizada)).toBe(false);
    });
  });

  describe('obtenerMotivoBloqueo', () => {
    it('informa motivo claro para Pendiente de Visita', () => {
      const motivo = obtenerMotivoBloqueo(mockMaquinaPendiente);
      expect(motivo).toContain('Pendiente de Visita');
    });

    it('informa motivo claro para Advertencia', () => {
      const motivo = obtenerMotivoBloqueo(mockMaquinaAdvertencia);
      expect(motivo).toContain('Advertencia');
      expect(motivo).toContain('Encargado ausente');
    });

    it('informa que falta foto obligatoria de cables', () => {
      const motivo = obtenerMotivoBloqueo(mockMaquinaSinCables);
      expect(motivo).toContain('Falta foto obligatoria de cables');
    });

    it('informa que falta la firma del encargado', () => {
      const motivo = obtenerMotivoBloqueo(mockMaquinaSinFirma);
      expect(motivo).toContain('Falta firma del encargado');
    });

    it('devuelve null si la máquina está en condiciones de ser autorizada', () => {
      expect(obtenerMotivoBloqueo(mockMaquinaRecorridaValida)).toBeNull();
    });
  });

  describe('fetchMaquinasFirmante', () => {
    it('obtiene la lista de máquinas correctamente', async () => {
      const fakeFetch: typeof fetch = async () =>
        new Response(JSON.stringify([mockMaquinaRecorridaValida, mockMaquinaPendiente]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const res = await fetchMaquinasFirmante(fakeFetch, 'gonza');
      expect(res.ok).toBe(true);
      expect(res.data.length).toBe(2);
      expect(res.data[0].codigoAGC).toBe('M1');
    });

    it('maneja errores HTTP', async () => {
      const fakeFetch: typeof fetch = async () =>
        new Response('Error', { status: 500 });

      const res = await fetchMaquinasFirmante(fakeFetch, 'gonza');
      expect(res.ok).toBe(false);
      expect(res.error).toContain('Error 500');
    });
  });

  describe('autorizarFirmaMaquina', () => {
    it('envía petición POST y procesa respuesta exitosa', async () => {
      const fakeFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        expect(body.maquinaId).toBe('MAQ-1');
        return new Response(
          JSON.stringify({
            ok: true,
            mensaje: 'Firma autorizada',
            maquinaId: 'MAQ-1',
            visitaId: 'VIS-1',
            autorizacion: {
              autorizada: true,
              fechaAutorizacion: '2026-11-06T12:00:00Z',
              autorizadoPor: 'gonza',
              protocoloAGC: 'AGC-2026-AUT-MAQ-1',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const res = await autorizarFirmaMaquina('MAQ-1', fakeFetch, 'gonza');
      expect(res.ok).toBe(true);
      expect(res.data?.autorizacion.autorizada).toBe(true);
      expect(res.data?.autorizacion.protocoloAGC).toBe('AGC-2026-AUT-MAQ-1');
    });

    it('maneja rechazo con mensaje de error de la API', async () => {
      const fakeFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({ message: 'No se puede autorizar: faltan fotos obligatorias' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );

      const res = await autorizarFirmaMaquina('MAQ-4', fakeFetch, 'gonza');
      expect(res.ok).toBe(false);
      expect(res.error).toContain('faltan fotos obligatorias');
    });
  });
});
