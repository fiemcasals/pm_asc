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

      const resumen = service.getHistorialConsorcio('consorcio-historial');
      expect(resumen.totalAdvertencias).toBe(1);
      expect(resumen.ultimaAdvertencia).toBe(1);
      expect(resumen.bloqueadoPorTerceraVisita).toBe(false);
      expect(resumen.historial).toHaveLength(1);
    });
  });
});
