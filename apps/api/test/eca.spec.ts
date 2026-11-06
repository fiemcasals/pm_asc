import { EcaService } from '../src/eca/eca.service';
import { FirmanteService } from '../src/firmante/firmante.service';

describe('EcaService', () => {
  let ecaService: EcaService;
  let firmanteService: FirmanteService;

  beforeEach(() => {
    firmanteService = new FirmanteService();
    ecaService = new EcaService(firmanteService);
  });

  describe('resolverEca', () => {
    it('resuelve la ECA por defecto si no se pasa identificador', () => {
      expect(ecaService.resolverEca()).toBe('Conservación Porteña S.R.L.');
      expect(ecaService.resolverEca('')).toBe('Conservación Porteña S.R.L.');
    });

    it('resuelve alias conocidos', () => {
      expect(ecaService.resolverEca('porteña')).toBe('Conservación Porteña S.R.L.');
      expect(ecaService.resolverEca('san martin')).toBe('Elevadores San Martín');
      expect(ecaService.resolverEca('maicon')).toBe('MAICON Mantenimiento');
    });
  });

  describe('getMaquinasFlota', () => {
    it('retorna únicamente las máquinas de la ECA especificada', async () => {
      const flotaPortena = await ecaService.getMaquinasFlota('Conservación Porteña S.R.L.');
      expect(flotaPortena.length).toBe(2);
      expect(flotaPortena.every((m) => m.eca === 'Conservación Porteña S.R.L.')).toBe(true);

      const flotaMaicon = await ecaService.getMaquinasFlota('MAICON Mantenimiento');
      expect(flotaMaicon.length).toBe(2);
      expect(flotaMaicon.every((m) => m.eca === 'MAICON Mantenimiento')).toBe(true);
    });

    it('soporta filtrado por mes', async () => {
      const nov = await ecaService.getMaquinasFlota('Conservación Porteña S.R.L.', '2026-11');
      expect(nov.length).toBe(2);

      const dic = await ecaService.getMaquinasFlota('Conservación Porteña S.R.L.', '2026-12');
      expect(dic.length).toBe(0);
    });
  });

  describe('getCobertura', () => {
    it('calcula correctamente el porcentaje de inspección y cobertura', async () => {
      const cobertura = await ecaService.getCobertura('Conservación Porteña S.R.L.', '2026-11');
      expect(cobertura.eca).toBe('Conservación Porteña S.R.L.');
      expect(cobertura.mes).toBe('2026-11');
      expect(cobertura.totalMaquinas).toBe(2);
      expect(cobertura.inspeccionadas).toBe(1); // M1 recorrida, M2 pendiente
      expect(cobertura.firmadas).toBe(0); // ninguna firmada aún
      expect(cobertura.pendientes).toBe(1);
      expect(cobertura.porcentajeInspeccionadas).toBe(50.0);
      expect(cobertura.porcentajeFirmadas).toBe(0.0);
    });

    it('actualiza el porcentaje de cobertura cuando se autoriza una firma en el mes', async () => {
      // Autorizamos la máquina M1 en FirmanteService
      await firmanteService.autorizarFirma(
        { maquinaId: 'MAQ-CORRIENTES-M1' },
        'gonza',
      );

      const cobertura = await ecaService.getCobertura('Conservación Porteña S.R.L.', '2026-11');
      expect(cobertura.firmadas).toBe(1);
      expect(cobertura.porcentajeFirmadas).toBe(50.0);
      expect(cobertura.porcentajeCobertura).toBe(50.0);
    });

    it('maneja flotas sin máquinas devolviendo 0% sin errores', async () => {
      const cobertura = await ecaService.getCobertura('ECA Inexistente', '2026-11');
      expect(cobertura.totalMaquinas).toBe(0);
      expect(cobertura.inspeccionadas).toBe(0);
      expect(cobertura.firmadas).toBe(0);
      expect(cobertura.porcentajeInspeccionadas).toBe(0);
      expect(cobertura.porcentajeFirmadas).toBe(0);
      expect(cobertura.porcentajeCobertura).toBe(0);
    });
  });

  describe('getAlertasCriticas', () => {
    it('retorna las máquinas con alertas de Fuera de Servicio y Reparación Urgente', async () => {
      const alertasMaicon = await ecaService.getAlertasCriticas('MAICON Mantenimiento');
      expect(alertasMaicon.length).toBe(2);

      const fds = alertasMaicon.find((a) => a.estadoOperativo === 'Fuera de Servicio');
      expect(fds).toBeDefined();
      expect(fds?.alerta.tipo).toBe('FUERA_DE_SERVICIO');
      expect(fds?.alerta.fotografiaCabinaTrabada).toBeTruthy();
      expect(fds?.alerta.motivo).toContain('Cabina trabada');

      const urg = alertasMaicon.find((a) => a.estadoOperativo === 'Reparación Urgente');
      expect(urg).toBeDefined();
      expect(urg?.alerta.tipo).toBe('REPARACION_URGENTE');
      expect(urg?.alerta.checklist?.length).toBeGreaterThan(0);
      expect(urg?.alerta.checklist?.[0].estado).toBe('Critico');
    });

    it('retorna la alerta de cabina trabada para Conservación Porteña', async () => {
      const alertasPortena = await ecaService.getAlertasCriticas('Conservación Porteña S.R.L.');
      expect(alertasPortena.length).toBe(1);
      expect(alertasPortena[0].alerta.tipo).toBe('FUERA_DE_SERVICIO');
      expect(alertasPortena[0].alerta.fotografiaCabinaTrabada).toBeTruthy();
    });
  });
});
