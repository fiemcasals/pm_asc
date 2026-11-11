import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccionesAlertaCritica, AlertasCriticas } from './AlertasCriticas';
import {
  AlertasEcaResponse,
  CoberturaEca,
  descargarRemitoTecnico,
  enviarAlertaWhatsApp,
  fetchAlertasEca,
  fetchCoberturaEca,
  fetchMaquinasEca,
  getCoberturaColor,
  MaquinaEca,
  triggerAlertaWhatsAppInmediata,
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

  describe('fetchAlertasEca', () => {
    it('consume /api/eca/alertas retornando las alertas críticas registradas', async () => {
      const mockAlertas: AlertasEcaResponse = {
        eca: 'MAICON Mantenimiento',
        mes: '2026-11',
        totalAlertas: 2,
        alertas: [
          {
            maquinaId: 'MAQ-SANTAFE-M1',
            codigoAGC: 'M1',
            nombreMaquina: 'M1: Ascensor Frontal',
            edificio: {
              id: 'EDIF-03',
              direccion: 'Av. Santa Fe 3200',
              administracion: 'Estudio Palermo Admin',
              consorcio: 'Consorcio Santa Fe 3200',
            },
            eca: 'MAICON Mantenimiento',
            estadoOperativo: 'Reparación Urgente',
            alerta: {
              id: 'ALT-01',
              tipo: 'REPARACION_URGENTE',
              titulo: 'Reparación Urgente',
              motivo: 'Freno con deslizamiento',
              fechaDeteccion: '2026-11-06T09:15:00Z',
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAlertas,
      } as Response);

      const res = await fetchAlertasEca('MAICON Mantenimiento');
      expect(res.ok).toBe(true);
      expect(res.data?.totalAlertas).toBe(2);
      expect(res.data?.alertas[0].estadoOperativo).toBe('Reparación Urgente');
    });
  });

  describe('AlertasCriticas Component (HU-10 / RF-01)', () => {
    const maquinaFueraDeServicio: MaquinaEca = {
      id: 'MAQ-FDS-1',
      codigoAGC: 'M2',
      nombre: 'M2: Ascensor de Servicio',
      edificio: {
        id: 'EDIF-1',
        direccion: 'Av. Corrientes 1234, CABA',
        administracion: 'Balvanera SRL',
        consorcio: 'Consorcio Corrientes 1234',
      },
      eca: 'Conservación Porteña S.R.L.',
      rtCalle: 'dev-ma-2',
      mes: '2026-11',
      estado: 'Pendiente de Visita',
      estadoOperativo: 'Fuera de Servicio',
      alertaCritica: {
        id: 'ALT-FDS-1',
        tipo: 'FUERA_DE_SERVICIO',
        titulo: 'FUERA DE SERVICIO: Cabina Trabada',
        motivo: 'Cabina trabada mecánicamente a 40cm del piso 4 con riesgo de atrapamiento',
        fotografiaCabinaTrabada: 'https://fotos.local/cabina-trabada.jpg',
        fechaDeteccion: '2026-11-06T08:30:00Z',
      },
      visita: null,
    };

    const maquinaReparacionUrgente: MaquinaEca = {
      id: 'MAQ-URG-1',
      codigoAGC: 'M1',
      nombre: 'M1: Ascensor Principal',
      edificio: {
        id: 'EDIF-3',
        direccion: 'Av. Santa Fe 3200, CABA',
        administracion: 'Palermo Admin',
        consorcio: 'Consorcio Santa Fe 3200',
      },
      eca: 'MAICON Mantenimiento',
      rtCalle: 'dev-ma-2',
      mes: '2026-11',
      estado: 'Recorrida',
      estadoOperativo: 'Reparación Urgente',
      alertaCritica: {
        id: 'ALT-URG-1',
        tipo: 'REPARACION_URGENTE',
        titulo: 'REPARACIÓN URGENTE: Anomalías Graves Detectadas Operando',
        motivo: 'Freno electromagnético con deslizamiento crítico de 18cm y cables deshilachados',
        checklist: [
          {
            item: 'Freno electromagnético',
            estado: 'Critico',
            observaciones: 'Deslizamiento severo de 18 cm con carga',
          },
          {
            item: 'Cables de tracción',
            estado: 'Falla',
            observaciones: 'Deshilachado en torones centrales',
          },
        ],
        fechaDeteccion: '2026-11-06T09:15:00Z',
      },
      visita: null,
    };

    it('Criterio 1: Si un ascensor es marcado como Fuera de Servicio, muestra alerta titilante roja con motivo y fotografia de la cabina trabada', () => {
      const html = renderToString(
        React.createElement(AlertasCriticas, {
          maquinas: [maquinaFueraDeServicio],
        }),
      );

      // Clases y estructura de alerta titilante roja
      expect(html).toContain('alerta-fuera-de-servicio');
      expect(html).toContain('alerta-titilante-roja');
      expect(html).toContain('FUERA DE SERVICIO');

      // Motivo
      expect(html).toContain('Cabina trabada mecánicamente a 40cm del piso 4 con riesgo de atrapamiento');
      expect(html).toContain('data-testid="motivo-fuera-de-servicio"');

      // Fotografía de la cabina trabada
      expect(html).toContain('data-testid="contenedor-foto-cabina-trabada"');
      expect(html).toContain('data-testid="foto-cabina-trabada"');
      expect(html).toContain('src="https://fotos.local/cabina-trabada.jpg"');
      expect(html).toContain('alt="Fotografía de la cabina trabada"');
    });

    it('Criterio 2: Si presenta anomalías graves operando, exhibe cartel naranja gigante de Reparacion Urgente con detalle del checklist', () => {
      const html = renderToString(
        React.createElement(AlertasCriticas, {
          maquinas: [maquinaReparacionUrgente],
        }),
      );

      // Cartel naranja gigante
      expect(html).toContain('cartel-reparacion-urgente-gigante');
      expect(html).toContain('data-testid="cartel-reparacion-urgente"');
      expect(html).toContain('CARTEL GIGANTE: REPARACIÓN URGENTE');

      // Motivo de anomalías graves operando
      expect(html).toContain('Freno electromagnético con deslizamiento crítico de 18cm y cables deshilachados');
      expect(html).toContain('data-testid="motivo-reparacion-urgente"');

      // Detalle del checklist
      expect(html).toContain('data-testid="checklist-anomalias-graves"');
      expect(html).toContain('Freno electromagnético');
      expect(html).toContain('Deslizamiento severo de 18 cm con carga');
      expect(html).toContain('Cables de tracción');
      expect(html).toContain('Deshilachado en torones centrales');
      expect(html).toContain('CRITICO');
      expect(html).toContain('FALLA');
    });

    it('no renderiza alertas si todas las máquinas operan de forma normal sin alertas', () => {
      const maquinaNormal: MaquinaEca = {
        ...maquinaFueraDeServicio,
        estadoOperativo: 'Normal',
        alertaCritica: null,
      };

      const html = renderToString(
        React.createElement(AlertasCriticas, {
          maquinas: [maquinaNormal],
        }),
      );

      expect(html).toBe('');
    });

    it('RF-02 Criterio 1: El portal provee boton para Descargar Remito de Notificacion con el informe y fotos de la falla', () => {
      const html = renderToString(
        React.createElement(AlertasCriticas, {
          maquinas: [maquinaFueraDeServicio, maquinaReparacionUrgente],
        }),
      );

      expect(html).toContain('data-testid="btn-descargar-remito-MAQ-FDS-1"');
      expect(html).toContain('data-testid="btn-descargar-remito-MAQ-URG-1"');
      expect(html).toContain('Descargar Remito de Notificación');
    });

    it('RF-02 Criterio 2: Al descargarse el remito, el sistema registra y exhibe automaticamente la fecha, hora y usuario para el acuse legal de MAICON S.R.L.', () => {
      const maquinaConAcuse: MaquinaEca = {
        ...maquinaReparacionUrgente,
        alertaCritica: {
          ...maquinaReparacionUrgente.alertaCritica!,
          acuseRecibo: {
            fechaHora: '2026-11-06T10:15:00.000Z',
            usuario: 'operador.legal@maicon.com.ar',
          },
        },
      };

      const html = renderToString(
        React.createElement(AlertasCriticas, {
          maquinas: [maquinaConAcuse],
        }),
      );

      expect(html).toContain('data-testid="acuse-recibo-MAQ-URG-1"');
      expect(html).toContain('Acuse de Recibo Legal Registrado');
      expect(html).toContain('operador.legal@maicon.com.ar');
      expect(html).toContain('MAICON Mantenimiento');
    });
  });

  describe('descargarRemitoTecnico API client', () => {
    it('llama a /api/eca/remito/:alertaId y devuelve el remito con acuse legal', async () => {
      const mockRemito = {
        id: 'REM-ALT-1',
        alertaId: 'ALT-1',
        maquinaId: 'MAQ-1',
        codigoAGC: 'M1',
        nombreMaquina: 'M1: Ascensor Principal',
        edificio: {
          direccion: 'Av. Santa Fe 3200',
          consorcio: 'Santa Fe 3200',
          administracion: 'Palermo Admin',
        },
        eca: 'MAICON Mantenimiento',
        tipoAlerta: 'REPARACION_URGENTE',
        titulo: 'Reparación Urgente',
        motivo: 'Freno deslizando',
        fechaDeteccion: '2026-11-06T09:15:00Z',
        acuseLegal: {
          registrado: true,
          fechaHora: '2026-11-06T10:30:00Z',
          usuario: 'operador.legal@maicon.com.ar',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRemito,
      } as Response);

      const res = await descargarRemitoTecnico(
        'ALT-1',
        'operador.legal@maicon.com.ar',
      );
      expect(res.ok).toBe(true);
      expect(res.data?.id).toBe('REM-ALT-1');
      expect(res.data?.acuseLegal.registrado).toBe(true);
      expect(res.data?.acuseLegal.usuario).toBe('operador.legal@maicon.com.ar');
    });
  });

  describe('enviarAlertaWhatsApp API client (HU-11 / RF-01)', () => {
    it('consume /api/whatsapp/enviar-alerta con el payload formal', async () => {
      const mockResult = {
        ok: true,
        idMensaje: 'WA-MSG-998877',
        telefonoDestino: '+5491144009988',
        mensajeFormateado: 'Alerta formal WhatsApp',
        intentos: 1,
        timestampEnvio: '2026-11-06T10:30:00Z',
        tiempoRespuestaMs: 45,
        estadoEntrega: 'entregado' as const,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResult,
      } as Response);

      const res = await enviarAlertaWhatsApp({
        telefonoDestino: '+5491144009988',
        nombreEca: 'MAICON Mantenimiento',
        consorcio: 'Consorcio Santa Fe 3200',
        equipo: 'M1: Ascensor Frontal',
        estado: 'Reparación Urgente',
        detalle: 'Deslizamiento crítico en freno',
      });

      expect(res.ok).toBe(true);
      expect(res.data?.idMensaje).toBe('WA-MSG-998877');
      expect(res.data?.estadoEntrega).toBe('entregado');
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/whatsapp/enviar-alerta',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('renderiza botón de despacho WhatsApp en componente AlertasCriticas', () => {
      const maquinaAlerta: MaquinaEca = {
        id: 'MAQ-TEST-WA',
        codigoAGC: 'M1',
        nombre: 'M1: Ascensor Test',
        edificio: {
          id: 'E-1',
          direccion: 'Av. Callao 850',
          administracion: 'Admin',
          consorcio: 'Consorcio Callao',
        },
        eca: 'MAICON Mantenimiento',
        rtCalle: 'dev-ma-2',
        mes: '2026-11',
        estado: 'Recorrida',
        estadoOperativo: 'Reparación Urgente',
        alertaCritica: {
          id: 'ALT-WA-1',
          tipo: 'REPARACION_URGENTE',
          titulo: 'Alerta Urgente',
          motivo: 'Freno descalibrado',
          fechaDeteccion: '2026-11-06T09:00:00Z',
        },
        visita: null,
      };

      const html = renderToString(
        React.createElement(AlertasCriticas, {
          maquinas: [maquinaAlerta],
        }),
      );

      expect(html).toContain('data-testid="btn-whatsapp-MAQ-TEST-WA"');
      expect(html).toContain('Despachar Alerta WhatsApp');
    });
  });

  describe('triggerAlertaWhatsAppInmediata API client (HU-11 / RF-02)', () => {
    it('dispara /api/whatsapp/trigger-alerta-critica y verifica tiempo < 5s y enlace directo', async () => {
      const mockTrigger = {
        ok: true,
        idMensaje: 'WA-AUTO-101',
        telefonoDestino: '+5491144009988',
        duracionMs: 38,
        menorA5Segundos: true,
        timestampDisparo: '2026-11-06T10:30:00Z',
        enlaceDirecto: 'https://localhost:8050/api/eca/remito/ALT-001/informe',
        mensajeFormateado: 'Texto con https://localhost:8050/api/eca/remito/ALT-001/informe',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTrigger,
      } as Response);

      const res = await triggerAlertaWhatsAppInmediata('ALT-001');
      expect(res.ok).toBe(true);
      expect(res.data?.menorA5Segundos).toBe(true);
      expect(res.data?.duracionMs).toBeLessThan(5000);
      expect(res.data?.enlaceDirecto).toContain('/api/eca/remito/ALT-001/informe');
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/whatsapp/trigger-alerta-critica',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  describe('HU-11 / RF-03: No informar como entregado un WhatsApp que no se envió', () => {
    const payloadBase = {
      telefonoDestino: '+5491144009988',
      nombreEca: 'MAICON Mantenimiento',
      consorcio: 'Consorcio Santa Fe 3200',
      equipo: 'M1: Ascensor Frontal',
      estado: 'Reparación Urgente',
      detalle: 'Deslizamiento crítico en freno',
    };

    it('enviarAlertaWhatsApp propaga el motivo exacto cuando la API responde HTTP 503 no_configurado', async () => {
      const msg = 'El envío por WhatsApp no está configurado: no hay proveedor de mensajería activo.';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          statusCode: 503,
          ok: false,
          estadoEntrega: 'no_configurado',
          message: msg,
          error: msg,
        }),
      } as unknown as Response);

      const res = await enviarAlertaWhatsApp(payloadBase);
      expect(res.ok).toBe(false);
      expect(res.error).toBe(msg);
      expect(res.data?.estadoEntrega).toBe('no_configurado');
    });

    it('enviarAlertaWhatsApp rechaza respuestas con ok: false o estadoEntrega no_configurado aunque HTTP sea 2xx', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          ok: false,
          idMensaje: '',
          estadoEntrega: 'no_configurado',
          error: 'Sin proveedor activo',
        }),
      } as unknown as Response);

      const res = await enviarAlertaWhatsApp(payloadBase);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Sin proveedor activo');
    });

    it('triggerAlertaWhatsAppInmediata devuelve ok: false con el motivo cuando envioRealizado es false', async () => {
      const motivo = 'El envío por WhatsApp no está configurado: no hay proveedor de mensajería activo.';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          ok: false,
          envioRealizado: false,
          estado: 'no_realizado',
          estadoEntrega: 'no_configurado',
          idMensaje: '',
          motivo,
        }),
      } as unknown as Response);

      const res = await triggerAlertaWhatsAppInmediata('ALT-MAICON-001');
      expect(res.ok).toBe(false);
      expect(res.error).toBe(motivo);
      expect(res.data?.estado).toBe('no_realizado');
    });

    it('AccionesAlertaCritica muestra el motivo del rechazo y no muestra "WhatsApp Despachado" cuando falló', () => {
      const maquinaAlerta: MaquinaEca = {
        id: 'MAQ-RF03-ERR',
        codigoAGC: 'M1',
        nombre: 'M1: Ascensor Principal',
        edificio: {
          id: 'E-RF03',
          direccion: 'Av. Callao 850',
          administracion: 'Admin',
          consorcio: 'Consorcio Callao',
        },
        eca: 'MAICON Mantenimiento',
        rtCalle: 'dev-ma-2',
        mes: '2026-11',
        estado: 'Recorrida',
        estadoOperativo: 'Reparación Urgente',
        alertaCritica: {
          id: 'ALT-RF03-ERR',
          tipo: 'REPARACION_URGENTE',
          titulo: 'Alerta Urgente',
          motivo: 'Freno descalibrado',
          fechaDeteccion: '2026-11-11T10:00:00Z',
        },
        visita: null,
      };

      const html = renderToString(
        React.createElement(AccionesAlertaCritica, {
          maquina: maquinaAlerta,
          alertaId: 'ALT-RF03-ERR',
          descargandoId: null,
          enviandoWaId: null,
          waError: 'El envío por WhatsApp no está configurado: no hay proveedor de mensajería activo.',
          remitoClassName: 'btn-remito-naranja',
          onDescargarRemito: () => undefined,
          onEnviarWhatsApp: () => undefined,
        }),
      );

      expect(html).toContain('data-testid="whatsapp-error-MAQ-RF03-ERR"');
      expect(html).toContain('Envío no realizado: El envío por WhatsApp no está configurado');
      expect(html).not.toContain('WhatsApp Despachado');
      expect(html).not.toContain('data-testid="whatsapp-status-MAQ-RF03-ERR"');
    });
  });
});
