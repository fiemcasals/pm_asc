import { BadRequestException } from '@nestjs/common';
import { FirmanteService } from '../src/firmante/firmante.service';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { WhatsAppFormatterService } from '../src/whatsapp/whatsapp-formatter.service';
import { WhatsAppTriggerService } from '../src/whatsapp/whatsapp-trigger.service';
import { MensajeAlertaWhatsAppInput } from '../src/whatsapp/whatsapp.types';

describe('WhatsApp Module (HU-11 / RF-01)', () => {
  let formatter: WhatsAppFormatterService;
  let connector: WhatsAppConnectorService;

  beforeEach(() => {
    formatter = new WhatsAppFormatterService();
    connector = new WhatsAppConnectorService(formatter);
  });

  describe('Criterio 1: Plantilla Formal de Alerta Crítica (WhatsAppFormatterService)', () => {
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

      // Verificación de campos requeridos por el Criterio 1
      expect(texto).toContain('MAICON Mantenimiento'); // nombre ECA
      expect(texto).toContain('Consorcio Santa Fe 3200'); // consorcio
      expect(texto).toContain('M1: Ascensor Frontal'); // equipo
      expect(texto).toContain('REPARACIÓN URGENTE'); // estado
      expect(texto).toContain('Freno electromagnético con deslizamiento crítico'); // detalle
      expect(texto).toContain('https://localhost:8050/api/eca/remito/ALT-MAICON-001'); // link al remito
      expect(texto).toContain('MAICON S.R.L.'); // membrete formal
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

  describe('Criterio 2: Conector de API de WhatsApp y Reintentos (WhatsAppConnectorService)', () => {
    const alerta: MensajeAlertaWhatsAppInput = {
      telefonoDestino: '+54 9 11 9988-7766',
      nombreEca: 'Conservación Porteña S.R.L.',
      consorcio: 'Consorcio Corrientes 1234',
      equipo: 'M2: Ascensor de Servicio',
      estado: 'Fuera de Servicio',
      detalle: 'Cabina trabada a 40cm del piso 4 con acuñamiento forzado.',
      remitoUrl: 'https://localhost:8050/api/eca/remito/ALT-CP-001',
    };

    it('realiza el envío exitoso hacia la API de WhatsApp con tracking y estado entregado', async () => {
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
            // Falla en los primeros dos intentos
            throw new Error('Network socket timeout hacia WhatsApp API');
          }
          // Éxito en el tercer intento
          return { status: 200, body: { id: 'wamid-123' } };
        },
      });

      const res = await connector.enviarMensajeAlerta(alerta, 3, 10);

      expect(res.ok).toBe(true);
      expect(res.intentos).toBe(3);
      expect(llamadas).toBe(3);
      expect(res.estadoEntrega).toBe('entregado');
    });

    it('maneja el caso de fallas persistentes agotando reintentos sin lanzar excepción no capturada', async () => {
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
    });
  });

  describe('HU-11 / RF-02: Disparo Automático Inmediato (< 5s) de WhatsApp con Link Directo', () => {
    let firmanteService: FirmanteService;
    let triggerService: WhatsAppTriggerService;

    beforeEach(() => {
      firmanteService = new FirmanteService();
      triggerService = new WhatsAppTriggerService(connector, firmanteService);
    });

    it('Criterio 1: al consolidarse un informe crítico, el disparo hacia WhatsApp se ejecuta en menos de 5 segundos comprobables', async () => {
      const res = await triggerService.dispararAlertaInmediata({
        alertaId: 'ALT-MAICON-001',
        telefonoDestino: '+5491144009988',
      });

      expect(res.ok).toBe(true);
      expect(res.menorA5Segundos).toBe(true);
      expect(res.duracionMs).toBeLessThan(5000);
      expect(res.idMensaje).toContain('WA-MSG-');
      expect(res.telefonoDestino).toBe('+5491144009988');
    });

    it('Criterio 2: el mensaje incluye un enlace directo y funcional a las fotos y al informe técnico firmado para celular', async () => {
      const res = await triggerService.dispararAlertaInmediata({
        alertaId: 'ALT-MAICON-001',
        telefonoDestino: '+5491144009988',
      });

      expect(res.enlaceDirecto).toContain('/api/eca/remito/ALT-MAICON-001/informe');
      expect(res.mensajeFormateado).toContain(res.enlaceDirecto);
      expect(res.mensajeFormateado).toContain('Informe y Fotos');
    });
  });
});
