import { describe, expect, it, vi } from 'vitest';
import {
  actualizarConsorcio,
  agruparSalasCompartidas,
  BloqueoConsorcioInfo,
  Consorcio,
  ConsorcioInput,
  ConsorcioMapaItem,
  ConsorcioResumen,
  LiquidacionConsorcioResultado,
  LiquidacionMaquinaInput,
  LiquidacionMaquinaResultado,
  parsearListaPisos,
  ReporteVisitaFallidaInput,
  ResumenAdvertenciasConsorcio,
  VisitaFallidaRegistro,
  crearConsorcio,
  fetchAdvertenciasConsorcio,
  fetchBloqueoConsorcio,
  fetchConsorcioById,
  fetchConsorcios,
  fetchConsorciosMapa,
  fetchLiquidacionConsorcio,
  liquidarMaquina,
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

  describe('HU-07 / RF-02: Bloqueo por Advertencia 3 y Cálculo de Recargo del 45%', () => {
    describe('Criterio 1: Bloqueo en Tablero con aviso Cobro de Tercer Visita Habilitado', () => {
      it('obtiene estado de bloqueo activo y cartel Cobro de Tercer Visita Habilitado al acumular 3 advertencias', async () => {
        const mockBloqueo: BloqueoConsorcioInfo = {
          consorcioId: '11111111-1111-1111-1111-111111111111',
          consorcioNombre: 'Consorcio Callao 850',
          bloqueado: true,
          avisoCobro: 'Cobro de Tercer Visita Habilitado',
          totalAdvertencias: 3,
          recargoAplicable: true,
          porcentajeRecargo: 45,
          motivoBloqueo: 'El edificio acumula 3 visitas fallidas consecutivas',
        };

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockBloqueo,
        } as Response);

        const res = await fetchBloqueoConsorcio('11111111-1111-1111-1111-111111111111');
        expect(res.ok).toBe(true);
        expect(res.data?.bloqueado).toBe(true);
        expect(res.data?.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');
        expect(res.data?.totalAdvertencias).toBe(3);
        expect(res.data?.porcentajeRecargo).toBe(45);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/visitas-fallidas/consorcio/11111111-1111-1111-1111-111111111111/bloqueo',
        );
      });
    });

    describe('Criterio 2: Módulo de Facturación Mensual con Recargo del 45% Extra', () => {
      it('suma automáticamente el recargo del 45% extra a la liquidación de la máquina cuando el consorcio tiene Advertencia 3', async () => {
        const input: LiquidacionMaquinaInput = {
          consorcioId: '11111111-1111-1111-1111-111111111111',
          maquinaId: 'm-1',
          referenciaAgc: 'M1',
          periodo: '2026-11',
          montoBase: 150000,
        };

        const mockResultado: LiquidacionMaquinaResultado = {
          id: 'LIQ-11111111-M1-2026-11',
          consorcioId: input.consorcioId,
          consorcioNombre: 'Consorcio Callao 850',
          maquinaId: 'm-1',
          referenciaAgc: 'M1',
          periodo: '2026-11',
          montoBase: 150000,
          totalAdvertencias: 3,
          bloqueadoPorTerceraVisita: true,
          recargoAplicado: true,
          porcentajeRecargo: 45,
          montoRecargo: 67500, // 150000 * 0.45
          montoTotal: 217500, // 150000 + 67500
          avisoCobro: 'Cobro de Tercer Visita Habilitado',
          detalleConceptos: [
            { concepto: 'Abono mensual conservación máquina M1', monto: 150000 },
            { concepto: 'Recargo 45% extra por tercera visita fallida — Cobro de Tercer Visita Habilitado', monto: 67500 },
          ],
          fechaLiquidacion: '2026-11-06T12:00:00.000Z',
        };

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockResultado,
        } as Response);

        const res = await liquidarMaquina(input);
        expect(res.ok).toBe(true);
        expect(res.data?.montoBase).toBe(150000);
        expect(res.data?.recargoAplicado).toBe(true);
        expect(res.data?.porcentajeRecargo).toBe(45);
        expect(res.data?.montoRecargo).toBe(67500);
        expect(res.data?.montoTotal).toBe(217500);
        expect(res.data?.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');
        expect(global.fetch).toHaveBeenCalledWith('/api/visitas-fallidas/liquidar-maquina', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
      });

      it('obtiene la liquidación mensual consolidada del consorcio', async () => {
        const mockConsolidado: LiquidacionConsorcioResultado = {
          consorcioId: '11111111-1111-1111-1111-111111111111',
          consorcioNombre: 'Consorcio Callao 850',
          periodo: '2026-11',
          totalMaquinas: 2,
          totalAdvertencias: 3,
          bloqueadoPorTerceraVisita: true,
          avisoCobro: 'Cobro de Tercer Visita Habilitado',
          subtotalBase: 300000,
          totalRecargos: 135000,
          totalGeneral: 435000,
          liquidacionesMaquinas: [],
          fechaLiquidacion: '2026-11-06T12:00:00.000Z',
        };

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockConsolidado,
        } as Response);

        const res = await fetchLiquidacionConsorcio('11111111-1111-1111-1111-111111111111', '2026-11', 150000);
        expect(res.ok).toBe(true);
        expect(res.data?.subtotalBase).toBe(300000);
        expect(res.data?.totalRecargos).toBe(135000);
        expect(res.data?.totalGeneral).toBe(435000);
        expect(res.data?.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');
      });
    });

    describe('datos operativos y salas compartidas (HU-01 RF-05)', () => {
      it('agruparSalasCompartidas agrupa solo salas con 2 o más máquinas', () => {
        const grupos = agruparSalasCompartidas([
          { id: '1', referenciaAgc: 'M1', descripcion: 'Izquierda', tipo: 'traccion', salaCompartidaId: 'sala-principal' },
          { id: '2', referenciaAgc: 'M2', descripcion: 'Derecha', tipo: 'hidraulico', salaCompartidaId: 'sala-principal' },
          { id: '3', referenciaAgc: 'M3', descripcion: 'Montacargas', tipo: 'montavehiculos', salaCompartidaId: 'sala-unica' },
          { id: '4', referenciaAgc: 'M4', descripcion: 'Auxiliar', tipo: 'traccion', salaCompartidaId: null },
        ]);
        expect(grupos).toHaveLength(1);
        expect(grupos[0].salaId).toBe('sala-principal');
        expect(grupos[0].maquinas.map((m) => m.referenciaAgc)).toEqual(['M1', 'M2']);
      });

      it('parsearListaPisos recorta y elimina duplicados conservando orden', () => {
        expect(parsearListaPisos(' SS , PB, 1, pb, 2 , ')).toEqual(['SS', 'PB', '1', '2']);
      });

      it('actualizarConsorcio envía PUT /api/consorcios/:id y fetchConsorciosMapa consulta /api/consorcios/mapa', async () => {
        const payload: ConsorcioInput = {
          nombre: 'Edificio Norte',
          direccion: 'Av. Libertador 1000',
          administracion: { nombre: null, telefono: null, email: null },
          encargado: { nombre: 'Luis', telefono: '11-5555-0000' },
          pisos: ['PB', '1', '2'],
          ubicacion: { latitud: -34.58, longitud: -58.4 },
          maquinas: [{ referenciaAgc: 'M1', descripcion: 'Principal', tipo: 'hidraulico', salaCompartidaId: null }],
        };
        const mockResp = { ...payload, id: 'c-1', createdAt: '', updatedAt: '' };
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResp } as Response);
        const putRes = await actualizarConsorcio('c-1', payload);
        expect(putRes.ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith('/api/consorcios/c-1', expect.objectContaining({ method: 'PUT' }));

        const mockMapa: ConsorcioMapaItem[] = [
          {
            id: 'c-1',
            nombre: 'Edificio Norte',
            direccion: 'Av. Libertador 1000',
            ubicacion: { latitud: -34.58, longitud: -58.4 },
            cantidadMaquinas: 1,
          },
        ];
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockMapa } as Response);
        const mapRes = await fetchConsorciosMapa();
        expect(mapRes.ok).toBe(true);
        expect(mapRes.data).toEqual(mockMapa);
        expect(global.fetch).toHaveBeenCalledWith('/api/consorcios/mapa');
      });
    });
  });
});
