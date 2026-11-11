import { BadRequestException } from '@nestjs/common';
import { FirmanteService } from '../src/firmante/firmante.service';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { WhatsAppFormatterService } from '../src/whatsapp/whatsapp-formatter.service';
import { WhatsAppTriggerService } from '../src/whatsapp/whatsapp-trigger.service';
import {
  MENSAJE_WHATSAPP_NO_CONFIGURADO,
  MensajeAlertaWhatsAppInput,
} from '../src/whatsapp/whatsapp.types';

describe('WhatsApp Module (HU-11 / RF-01, RF-02, RF-03)', () => {
  let formatter: WhatsAppFormatterService;
  let connector: WhatsAppConnectorService;

  beforeEach(() => {
    formatter = new WhatsAppFormatterService();
    connector = new WhatsAppConnectorService(formatter);
  });

  describe('Criterio 1 (RF-01): Plantilla Formal de Alerta Crítica (WhatsAppFormatterService)', () => {
    const alertaValida: MensajeAlertaWhatsAppInput = {
      telefonoDestino: '+5491133445566',
      nombreEca: 'MAICON Mantenimiento',
      consorcio: 'Consorcio Santa Fe 3200 (Av. Santa Fe 3200, CABA)',
      equipo: 'M1: Ascensor Frontal',
      estado: 'Reparación Urgente',
      detalle:
        'Freno electromagnético con deslizamiento crítico de 18cm en prueba de parada con carga. Cables con deshilachado severo.',
      remitoUrl: 'https://localhost:8050/api/eca/remito/ALT-MAICON-001',
      fechaDeteccion: '2026-11-06T09:15:00.000Z',
    };

    it('formatea el mensaje formal conteniendo nombre ECA, consorcio, estado, equipo y detalle', () => {
      const texto = formatter.formatearAlerta(alertaValida);

      expect(texto).toContain('MAICON Mantenimiento');
      expect(texto).toContain('Consorcio Santa Fe 3200');
      expect(texto).toContain('M1: Ascensor Frontal');
      expect(texto).toContain('REPARACIÓN URGENTE');
      expect(texto).toContain('Freno electromagnético con deslizamiento crítico');
      expect(texto).toContain('https://localhost:8050/api/eca/remito/ALT-MAICON-001');
      expect(texto).toContain('MAICON S.R.L.');
      expect(texto).toContain('Aviso legal automático generado conforme ordenanza AGC');
    });

    it('rechaza si falta el nombre de la ECA', () => {
      expect(() =>
        formatter.formatearAlerta({ ...alertaValida, nombreEca: '' }),
      ).toThrow(BadRequestException);
    });

    it('rechaza si falta el consorcio', () => {
      expect(() =>
        formatter.formatearAlerta({ ...alertaValida, consorcio: '  ' }),
      ).toThrow(BadRequestException);
    });

    it('rechaza si falta el estado', () => {
      expect(() =>
        formatter.formatearAlerta({ ...alertaValida, estado: '' }),
      ).toThrow(BadRequestException);
    });

    it('rechaza si falta el equipo', () => {
      expect(() =>
        formatter.formatearAlerta({ ...alertaValida, equipo: '' }),
      ).toThrow(BadRequestException);
    });

    it('rechaza si falta el detalle de la anomalía', () => {
      expect(() =>
        formatter.formatearAlerta({ ...alertaValida, detalle: '' }),
      ).toThrow(BadRequestException);
    });
  });

  describe('Conector de API de WhatsApp (RF-01 + RF-03)', () => {
    const alerta: MensajeAlertaWhatsAppInput = {
      telefonoDestino: '+54 9 11 9988-7766',
      nombreEca: 'Conservación Porteña S.R.L.',
      consorcio: 'Consorcio Corrientes 1234',
      equipo: 'M2: Ascensor de Servicio',
      estado: 'Fuera de Servicio',
      detalle: 'Cabina trabada a 40cm del piso 4 con acuñamiento forzado.',
      remitoUrl: 'https://localhost:8050/api/eca/remito/ALT-CP-001',
    };

    it('RF-03 Criterio 1: sin proveedor configurado no simula entrega, responde error e informa que no está configurado', async () => {
      expect(connector.estaConfigurado()).toBe(false);

      const res = await connector.enviarMensajeAlerta(alerta);

      expect(res.ok).toBe(false);
      expect(res.estadoEntrega).toBe('no_configurado');
      expect(res.estadoEntrega).not.toBe('entregado');
      expect(res.idMensaje).toBe('');
      expect(res.intentos).toBe(0);
      expect(res.error).toBe(MENSAJE_WHATSAPP_NO_CONFIGURADO);

      const historial = connector.getHistorialEnvios();
      expect(historial).toHaveLength(1);
      expect(historial[0]).toMatchObject({
        origen: 'manual',
        ok: false,
        envioRealizado: false,
        estado: 'no_realizado',
        estadoEntrega: 'no_configurado',
        motivo: MENSAJE_WHATSAPP_NO_CONFIGURADO,
      });
    });

    it('realiza el envío exitoso cuando hay proveedor configurado y registra entrega', async () => {
      connector.setTransport({
        postMessage: async () => ({ status: 200, body: { id: 'wamid-ok' } }),
      });
      expect(connector.estaConfigurado()).toBe(true);

      const res = await connector.enviarMensajeAlerta(alerta);

      expect(res.ok).toBe(true);
      expect(res.estadoEntrega).toBe('entregado');
      expect(res.telefonoDestino).toBe('+5491199887766');
      expect(res.idMensaje).toContain('WA-MSG-');
      expect(res.intentos).toBe(1);
      expect(res.mensajeFormateado).toContain('Conservación Porteña S.R.L.');
      expect(res.tiempoRespuestaMs).toBeGreaterThanOrEqual(0);
    });

    it('reintenta automáticamente ante fallas transitorias de red y completa exitosamente', async () => {
      let llamadas = 0;
      connector.setTransport({
        postMessage: async () => {
          llamadas++;
          if (llamadas < 3) {
            throw new Error('Network socket timeout hacia WhatsApp API');
          }
          return { status: 200, body: { id: 'wamid-123' } };
        },
      });

      const res = await connector.enviarMensajeAlerta(alerta, 3, 10);

      expect(res.ok).toBe(true);
      expect(res.intentos).toBe(3);
      expect(llamadas).toBe(3);
      expect(res.estadoEntrega).toBe('entregado');
    });

    it('maneja fallas persistentes agotando reintentos y registrando fallo', async () => {
      connector.setTransport({
        postMessage: async () => {
          throw new Error('Connection refused por endpoint de WhatsApp');
        },
      });

      const res = await connector.enviarMensajeAlerta(alerta, 2, 5);

      expect(res.ok).toBe(false);
      expect(res.estadoEntrega).toBe('fallido');
      expect(res.intentos).toBe(2);
      expect(res.error).toContain('Connection refused');
      expect(connector.getHistorialEnvios()[0].estado).toBe('no_realizado');
    });
  });

  describe('Disparo Automático ante Alerta Crítica (RF-02 + RF-03)', () => {
    let firmanteService: FirmanteService;
    let triggerService: WhatsAppTriggerService;

    beforeEach(() => {
      firmanteService = new FirmanteService();
      triggerService = new WhatsAppTriggerService(connector, firmanteService);
    });

    it('RF-03 Criterio 3: registra el envío automático como no realizado cuando no hay proveedor configurado', async () => {
      const res = await triggerService.dispararAlertaInmediata({
        alertaId: 'ALT-MAICON-001',
        telefonoDestino: '+5491144009988',
      });

      expect(res.ok).toBe(false);
      expect(res.envioRealizado).toBe(false);
      expect(res.estado).toBe('no_realizado');
      expect(res.estadoEntrega).toBe('no_configurado');
      expect(res.estadoEntrega).not.toBe('entregado');
      expect(res.idMensaje).toBe('');
      expect(res.motivo).toBe(MENSAJE_WHATSAPP_NO_CONFIGURADO);

      const historial = connector.getHistorialEnvios('ALT-MAICON-001');
      expect(historial).toHaveLength(1);
      expect(historial[0]).toMatchObject({
        origen: 'automatico',
        alertaId: 'ALT-MAICON-001',
        ok: false,
        envioRealizado: false,
        estado: 'no_realizado',
        estadoEntrega: 'no_configurado',
        motivo: MENSAJE_WHATSAPP_NO_CONFIGURADO,
      });
    });

    it('RF-02 Criterio 1: con proveedor configurado, dispara en menos de 5 segundos comprobables', async () => {
      connector.setTransport({
        postMessage: async () => ({ status: 200, body: { id: 'wamid-trig-1' } }),
      });

      const res = await triggerService.dispararAlertaInmediata({
        alertaId: 'ALT-MAICON-001',
        telefonoDestino: '+5491144009988',
      });

      expect(res.ok).toBe(true);
      expect(res.envioRealizado).toBe(true);
      expect(res.estado).toBe('realizado');
      expect(res.estadoEntrega).toBe('entregado');
      expect(res.menorA5Segundos).toBe(true);
      expect(res.duracionMs).toBeLessThan(5000);
      expect(res.idMensaje).toContain('WA-MSG-');
      expect(res.telefonoDestino).toBe('+5491144009988');
    });

    it('RF-02 Criterio 2: con proveedor configurado, incluye enlace directo a fotos e informe técnico móvil', async () => {
      connector.setTransport({
        postMessage: async () => ({ status: 200, body: { id: 'wamid-trig-2' } }),
      });

      const res = await triggerService.dispararAlertaInmediata({
        alertaId: 'ALT-MAICON-001',
        telefonoDestino: '+5491144009988',
      });

      expect(res.ok).toBe(true);
      expect(res.enlaceDirecto).toContain('/api/eca/remito/ALT-MAICON-001/informe');
      expect(res.mensajeFormateado).toContain(res.enlaceDirecto);
      expect(res.mensajeFormateado).toContain('Informe y Fotos');
    });
  });
});
