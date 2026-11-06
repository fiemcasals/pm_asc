import { describe, expect, it, vi } from 'vitest';
import {
  Consorcio,
  ConsorcioInput,
  ConsorcioResumen,
  ReporteVisitaFallidaInput,
  ResumenAdvertenciasConsorcio,
  VisitaFallidaRegistro,
  crearConsorcio,
  fetchAdvertenciasConsorcio,
  fetchConsorcioById,
  fetchConsorcios,
  registrarVisitaFallida,
} from './consorcios';

describe('consorcios module', () => {
  describe('fetchConsorcios', () => {
    it('retorna la lista de consorcios resumidos', async () => {
      const mockList: ConsorcioResumen[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          nombre: 'Consorcio Callao 850',
          direccion: 'Av. Callao 850, CABA',
          cantidadMaquinas: 2,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockList,
      } as Response);

      const res = await fetchConsorcios();
      expect(res.ok).toBe(true);
      expect(res.data).toEqual(mockList);
      expect(global.fetch).toHaveBeenCalledWith('/api/consorcios');
    });

    it('maneja errores de respuesta HTTP', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const res = await fetchConsorcios();
      expect(res.ok).toBe(false);
      expect(res.error).toContain('500');
    });
  });

  describe('fetchConsorcioById', () => {
    it('retorna la ficha completa del edificio y sus máquinas', async () => {
      const mockConsorcio: Consorcio = {
        id: '11111111-1111-1111-1111-111111111111',
        nombre: 'Consorcio Callao 850',
        direccion: 'Av. Callao 850, CABA',
        administracion: {
          nombre: 'Admin Centro',
          telefono: '11-4567-8900',
          email: 'contacto@admincentro.com',
        },
        maquinas: [
          { id: 'm-1', referenciaAgc: 'M1', descripcion: 'Ascensor Principal' },
          { id: 'm-2', referenciaAgc: 'M2', descripcion: 'Ascensor Servicio' },
        ],
        createdAt: '2026-11-06T10:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConsorcio,
      } as Response);

      const res = await fetchConsorcioById('11111111-1111-1111-1111-111111111111');
      expect(res.ok).toBe(true);
      expect(res.data?.nombre).toBe('Consorcio Callao 850');
      expect(res.data?.maquinas.length).toBe(2);
      expect(res.data?.maquinas[0].referenciaAgc).toBe('M1');
    });

    it('maneja 404 consorcio no encontrado', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const res = await fetchConsorcioById('inexistente');
      expect(res.ok).toBe(false);
      expect(res.error).toContain('404');
    });
  });

  describe('crearConsorcio', () => {
    it('envía POST /api/consorcios y retorna el consorcio creado con sus máquinas', async () => {
      const input: ConsorcioInput = {
        nombre: 'Nuevo Consorcio Corrientes 500',
        direccion: 'Av. Corrientes 500, CABA',
        administracion: {
          nombre: 'Administración Puerto',
          telefono: '11-1111-2222',
          email: 'puerto@admin.com',
        },
        maquinas: [
          { referenciaAgc: 'M1', descripcion: 'Principal' },
          { referenciaAgc: 'M2', descripcion: 'Montacargas' },
        ],
      };

      const mockCreado: Consorcio = {
        ...input,
        id: '22222222-2222-2222-2222-222222222222',
        maquinas: [
          { id: 'maq-1', referenciaAgc: 'M1', descripcion: 'Principal' },
          { id: 'maq-2', referenciaAgc: 'M2', descripcion: 'Montacargas' },
        ],
        createdAt: '2026-11-06T10:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCreado,
      } as Response);

      const res = await crearConsorcio(input);
      expect(res.ok).toBe(true);
      expect(res.data?.id).toBe('22222222-2222-2222-2222-222222222222');
      expect(res.data?.maquinas.length).toBe(2);
      expect(global.fetch).toHaveBeenCalledWith('/api/consorcios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    });

    it('captura errores de validación 400 con lista de errores', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          statusCode: 400,
          message: 'Error de validación',
          errores: ['nombre es obligatorio', 'direccion es obligatorio'],
        }),
      } as Response);

      const input: ConsorcioInput = {
        nombre: '',
        direccion: '',
        administracion: { nombre: null, telefono: null, email: null },
        maquinas: [],
      };

      const res = await crearConsorcio(input);
      expect(res.ok).toBe(false);
      expect(res.errores).toEqual(['nombre es obligatorio', 'direccion es obligatorio']);
    });
  });

  describe('registrarVisitaFallida (HU-07 / RF-01)', () => {
    it('registra exitosamente una visita fallida con foto del frente y GPS congelado', async () => {
      const input: ReporteVisitaFallidaInput = {
        consorcioId: '11111111-1111-1111-1111-111111111111',
        inspector: 'Inspector García',
        fotoFrenteUrl: 'https://storage.empresa.com/frente-consorcio-1.jpg',
        gps: {
          latitud: -34.603722,
          longitud: -58.381592,
          precision: 5.2,
          timestamp: '2026-11-06T10:00:00.000Z',
        },
        motivo: 'Portero ausente y timbre sin respuesta',
      };

      const mockRegistro: VisitaFallidaRegistro = {
        id: 'vf-1',
        consorcioId: input.consorcioId,
        consorcioNombre: 'Consorcio Callao 850',
        direccion: 'Av. Callao 850, CABA',
        numeroAdvertencia: 1,
        fotoFrenteUrl: input.fotoFrenteUrl,
        gps: input.gps,
        inspector: input.inspector || 'Inspector General',
        motivo: input.motivo || '',
        fechaHora: '2026-11-06T10:00:00.000Z',
        emailNotificacion: {
          id: 'email-1',
          destinatario: 'administracion@consorcio.com',
          remitente: 'notificaciones@maicon.com.ar',
          asunto: 'NOTIFICACIÓN DE VISITA TÉCNICA FALLIDA - ADVERTENCIA 1',
          cuerpo: 'Estimada Administración...',
          fechaEnvio: '2026-11-06T10:00:01.000Z',
          estado: 'enviado',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRegistro,
      } as Response);

      const res = await registrarVisitaFallida(input);
      expect(res.ok).toBe(true);
      expect(res.data?.numeroAdvertencia).toBe(1);
      expect(res.data?.fotoFrenteUrl).toBe(input.fotoFrenteUrl);
      expect(res.data?.emailNotificacion?.asunto).toContain('ADVERTENCIA 1');
      expect(global.fetch).toHaveBeenCalledWith('/api/visitas-fallidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    });

    it('devuelve error si falta la foto del frente o coordenadas GPS', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: 'Es obligatoria la foto del frente del edificio con coordenadas GPS congeladas',
        }),
      } as Response);

      const inputInvalido: ReporteVisitaFallidaInput = {
        consorcioId: '11111111-1111-1111-1111-111111111111',
        fotoFrenteUrl: '',
        gps: { latitud: 0, longitud: 0 },
      };

      const res = await registrarVisitaFallida(inputInvalido);
      expect(res.ok).toBe(false);
      expect(res.error).toContain('foto del frente');
    });
  });

  describe('fetchAdvertenciasConsorcio (HU-07 / RF-01)', () => {
    it('obtiene el historial de advertencias y estado de bloqueo', async () => {
      const mockResumen: ResumenAdvertenciasConsorcio = {
        consorcioId: '11111111-1111-1111-1111-111111111111',
        totalAdvertencias: 2,
        ultimaAdvertencia: 2,
        bloqueadoPorTerceraVisita: false,
        recargoAplicable: false,
        historial: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResumen,
      } as Response);

      const res = await fetchAdvertenciasConsorcio('11111111-1111-1111-1111-111111111111');
      expect(res.ok).toBe(true);
      expect(res.data?.totalAdvertencias).toBe(2);
      expect(res.data?.ultimaAdvertencia).toBe(2);
      expect(res.data?.bloqueadoPorTerceraVisita).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith('/api/visitas-fallidas/consorcio/11111111-1111-1111-1111-111111111111');
    });
  });
});
