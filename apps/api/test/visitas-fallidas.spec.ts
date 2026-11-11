import { BadRequestException } from '@nestjs/common';
import { VisitasFallidasService } from '../src/visitas-fallidas/visitas-fallidas.service';

describe('VisitasFallidasService (HU-07 / RF-01)', () => {
  let service: VisitasFallidasService;

  beforeEach(() => {
    service = new VisitasFallidasService();
  });

  describe('Criterio 1: Validación de Reporte de Visita Fallida', () => {
    it('rechaza si el cuerpo es nulo o indefinido', async () => {
      await expect(service.registrarVisitaFallida(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza si falta el consorcioId', async () => {
      await expect(
        service.registrarVisitaFallida({
          consorcioId: '',
          fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-1.jpg',
          gps: { latitud: -34.6037, longitud: -58.3816 },
        }),
      ).rejects.toThrow(/consorcioId.*obligatorio/i);
    });

    it('rechaza si falta la fotografía del frente del edificio', async () => {
      await expect(
        service.registrarVisitaFallida({
          consorcioId: 'consorcio-123',
          fotoFrenteUrl: '   ',
          gps: { latitud: -34.6037, longitud: -58.3816 },
        }),
      ).rejects.toThrow(/fotografía del frente.*obligatoria/i);
    });

    it('rechaza si faltan las coordenadas GPS congeladas o son inválidas', async () => {
      await expect(
        service.registrarVisitaFallida({
          consorcioId: 'consorcio-123',
          fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-1.jpg',
          gps: null as any,
        }),
      ).rejects.toThrow(/coordenadas GPS.*obligatorias/i);

      await expect(
        service.registrarVisitaFallida({
          consorcioId: 'consorcio-123',
          fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-1.jpg',
          gps: { latitud: NaN, longitud: -58.3816 },
        }),
      ).rejects.toThrow(/coordenadas GPS.*obligatorias/i);
    });

    it('acepta y registra la visita fallida cuando se proveen foto y GPS válidos', async () => {
      const res = await service.registrarVisitaFallida({
        consorcioId: 'consorcio-callao',
        motivo: 'Encargado ausente sin respuesta en portería',
        fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-callao.jpg',
        gps: { latitud: -34.5989, longitud: -58.3912, precision: 4.2 },
        inspector: 'Inspector Juan Pérez (RT Calle)',
      });

      expect(res).toBeDefined();
      expect(res.id).toMatch(/^VF-/);
      expect(res.consorcioId).toBe('consorcio-callao');
      expect(res.fotoFrenteUrl).toBe('https://storage.maicon.com.ar/fotos/frente-callao.jpg');
      expect(res.gps.latitud).toBe(-34.5989);
      expect(res.gps.longitud).toBe(-58.3912);
      expect(res.numeroAdvertencia).toBe(1);
    });
  });

  describe('Criterio 2: Notificación Formal por Correo a Administración (Advertencias 1 y 2)', () => {
    it('al registrar Advertencia 1, envía correo formal con membrete MAICON a la administración', async () => {
      const res = await service.registrarVisitaFallida({
        consorcioId: 'consorcio-corrientes',
        motivo: 'Sin acceso a sala de máquinas',
        fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-corrientes.jpg',
        gps: { latitud: -34.6037, longitud: -58.3816 },
        emailAdministracion: 'administracion@corrientes1234.com.ar',
      });

      expect(res.numeroAdvertencia).toBe(1);
      expect(res.emailNotificacion).toBeDefined();
      expect(res.emailNotificacion!.destinatario).toBe('administracion@corrientes1234.com.ar');
      expect(res.emailNotificacion!.remitente).toBe('notificaciones@maicon.com.ar');
      expect(res.emailNotificacion!.asunto).toContain('Advertencia 1');
      expect(res.emailNotificacion!.cuerpo).toContain('MAICON S.R.L.');
      expect(res.emailNotificacion!.cuerpo).toContain('-34.603700');
      expect(res.emailNotificacion!.cuerpo).toContain('frente-corrientes.jpg');
      expect(res.emailNotificacion!.cuerpo).toContain('recargo reglamentario del 45%');
      expect(res.emailNotificacion!.estado).toBe('enviado');
    });

    it('al registrar Advertencia 2 (reincidencia), despacha formalmente Advertencia 2 por correo', async () => {
      // 1ra visita fallida
      await service.registrarVisitaFallida({
        consorcioId: 'consorcio-reincidente',
        fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-1.jpg',
        gps: { latitud: -34.6000, longitud: -58.3800 },
        emailAdministracion: 'admin@reincidente.com.ar',
      });

      // 2da visita fallida
      const res2 = await service.registrarVisitaFallida({
        consorcioId: 'consorcio-reincidente',
        fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-2.jpg',
        gps: { latitud: -34.6001, longitud: -58.3801 },
        emailAdministracion: 'admin@reincidente.com.ar',
      });

      expect(res2.numeroAdvertencia).toBe(2);
      expect(res2.emailNotificacion).toBeDefined();
      expect(res2.emailNotificacion!.asunto).toContain('Advertencia 2');
      expect(res2.emailNotificacion!.cuerpo).toContain('ADVERTENCIA 2 DE 3');
      expect(res2.emailNotificacion!.estado).toBe('enviado');
    });

    it('mantiene historial y permite consultar advertencias acumuladas por consorcio', async () => {
      await service.registrarVisitaFallida({
        consorcioId: 'consorcio-historial',
        fotoFrenteUrl: 'https://storage.maicon.com.ar/fotos/frente-a.jpg',
        gps: { latitud: -34.60, longitud: -58.38 },
      });

      const resumen = await service.getHistorialConsorcio('consorcio-historial');
      expect(resumen.totalAdvertencias).toBe(1);
      expect(resumen.ultimaAdvertencia).toBe(1);
      expect(resumen.bloqueadoPorTerceraVisita).toBe(false);
      expect(resumen.historial).toHaveLength(1);
    });
  });

  describe('HU-07 / RF-02: Bloqueo por Advertencia 3 y Cálculo de Recargo del 45%', () => {
    describe('Criterio 1: Bloqueo por Advertencia 3 y Aviso Cobro de Tercer Visita Habilitado', () => {
      it('al acumularse la 3ra visita fallida, el edificio queda bloqueado exhibiendo el aviso Cobro de Tercer Visita Habilitado', async () => {
        const consorcioId = 'consorcio-bloqueo-3';

        // 1ra visita fallida -> Advertencia 1
        const r1 = await service.registrarVisitaFallida({
          consorcioId,
          fotoFrenteUrl: 'https://storage.maicon.com.ar/frente-1.jpg',
          gps: { latitud: -34.6037, longitud: -58.3816 },
        });
        expect(r1.numeroAdvertencia).toBe(1);

        // 2da visita fallida -> Advertencia 2
        const r2 = await service.registrarVisitaFallida({
          consorcioId,
          fotoFrenteUrl: 'https://storage.maicon.com.ar/frente-2.jpg',
          gps: { latitud: -34.6038, longitud: -58.3817 },
        });
        expect(r2.numeroAdvertencia).toBe(2);

        // 3ra visita fallida -> Advertencia 3
        const r3 = await service.registrarVisitaFallida({
          consorcioId,
          fotoFrenteUrl: 'https://storage.maicon.com.ar/frente-3.jpg',
          gps: { latitud: -34.6039, longitud: -58.3818 },
        });
        expect(r3.numeroAdvertencia).toBe(3);

        // Comprobación de estado bloqueado y aviso oficial
        const historial = await service.getHistorialConsorcio(consorcioId);
        expect(historial.totalAdvertencias).toBe(3);
        expect(historial.ultimaAdvertencia).toBe(3);
        expect(historial.bloqueadoPorTerceraVisita).toBe(true);
        expect(historial.recargoAplicable).toBe(true);
        expect(historial.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');

        // Comprobación de endpoint de consulta de bloqueo
        const bloqueo = await service.getBloqueoConsorcio(consorcioId);
        expect(bloqueo.bloqueado).toBe(true);
        expect(bloqueo.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');
        expect(bloqueo.totalAdvertencias).toBe(3);
        expect(bloqueo.porcentajeRecargo).toBe(45);
      });
    });

    describe('Criterio 2: Módulo de Facturación Mensual y Suma Automática de Recargo del 45% Extra', () => {
      it('no aplica recargo si el consorcio tiene menos de 3 advertencias', async () => {
        const consorcioId = 'consorcio-sin-recargo';
        await service.registrarVisitaFallida({
          consorcioId,
          fotoFrenteUrl: 'https://storage.maicon.com.ar/frente.jpg',
          gps: { latitud: -34.60, longitud: -58.38 },
        });

        const liquidacion = await service.liquidarMaquina({
          consorcioId,
          referenciaAgc: 'M1',
          montoBase: 100000,
        });

        expect(liquidacion.recargoAplicado).toBe(false);
        expect(liquidacion.porcentajeRecargo).toBe(0);
        expect(liquidacion.montoRecargo).toBe(0);
        expect(liquidacion.montoTotal).toBe(100000);
        expect(liquidacion.avisoCobro).toBeNull();
      });

      it('al acumularse la Advertencia 3, suma automáticamente el recargo del 45% extra a la liquidación de la máquina', async () => {
        const consorcioId = 'consorcio-facturacion-recargo';

        // Registrar 3 visitas fallidas
        for (let i = 1; i <= 3; i++) {
          await service.registrarVisitaFallida({
            consorcioId,
            fotoFrenteUrl: `https://storage.maicon.com.ar/frente-${i}.jpg`,
            gps: { latitud: -34.6037, longitud: -58.3816 },
          });
        }

        const montoBase = 200000;
        const liquidacion = await service.liquidarMaquina({
          consorcioId,
          maquinaId: 'maq-asc-1',
          referenciaAgc: 'M1',
          periodo: '2026-11',
          montoBase,
        });

        expect(liquidacion.totalAdvertencias).toBe(3);
        expect(liquidacion.bloqueadoPorTerceraVisita).toBe(true);
        expect(liquidacion.recargoAplicado).toBe(true);
        expect(liquidacion.porcentajeRecargo).toBe(45);
        expect(liquidacion.montoRecargo).toBe(90000); // 200000 * 0.45
        expect(liquidacion.montoTotal).toBe(290000); // 200000 + 90000
        expect(liquidacion.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');
        expect(liquidacion.detalleConceptos).toHaveLength(2);
        expect(liquidacion.detalleConceptos[1].concepto).toContain('Recargo 45% extra');
      });

      it('permite liquidar el consorcio completo sumando el 45% extra a cada máquina si corresponde', async () => {
        const consorcioId = 'consorcio-completo-recargo';

        for (let i = 1; i <= 3; i++) {
          await service.registrarVisitaFallida({
            consorcioId,
            fotoFrenteUrl: `https://storage.maicon.com.ar/frente-${i}.jpg`,
            gps: { latitud: -34.60, longitud: -58.38 },
          });
        }

        const liqConsorcio = await service.liquidarConsorcio(consorcioId, '2026-11', 150000);
        expect(liqConsorcio.bloqueadoPorTerceraVisita).toBe(true);
        expect(liqConsorcio.avisoCobro).toBe('Cobro de Tercer Visita Habilitado');
        expect(liqConsorcio.totalMaquinas).toBe(2);
        expect(liqConsorcio.subtotalBase).toBe(300000);
        expect(liqConsorcio.totalRecargos).toBe(135000); // 2 * (150000 * 0.45) = 135000
        expect(liqConsorcio.totalGeneral).toBe(435000); // 300000 + 135000
      });
    });
  });
});
