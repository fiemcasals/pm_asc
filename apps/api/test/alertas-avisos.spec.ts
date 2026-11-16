import { EcaService } from '../src/eca/eca.service';
import { FirmanteService } from '../src/firmante/firmante.service';

// HU-10 RF-04 (servicio, sin HTTP ni base): una alerta sin acuse genera un recordatorio a la ECA a las 24 h y un aviso a la
// Secretaría a las 48 h, una sola vez cada uno. Alertas de ejemplo: ALT-CP-001 se detectó el 6/11/2026 08:30Z (Conservación
// Porteña), ALT-MAICON-001 a las 09:15Z y ALT-MAICON-002 a las 07:45Z (MAICON Mantenimiento).
const CP = 'ALT-CP-001';
const M1 = 'ALT-MAICON-001';
const M2 = 'ALT-MAICON-002';
const t = (iso: string) => new Date(iso);

describe('Recordatorio a las 24 h y aviso a la Secretaría a las 48 h sin acuse (HU-10 RF-04)', () => {
  let firmante: FirmanteService;
  let service: EcaService;
  const tipos = async (alertaId: string) => (await service.getHistorialAlerta(alertaId)).map((e) => e.tipo);
  const acusar = (alertaId: string, fechaHora: string) => {
    firmante.getMaquinas().find((m) => m.alertaCritica?.id === alertaId)!.alertaCritica!.acuseRecibo = { fechaHora, usuario: 'eca.test' };
  };

  beforeEach(() => {
    firmante = new FirmanteService();
    service = new EcaService(firmante);
  });

  describe('criterio 1: a las 24 h sin acuse hay un recordatorio a la ECA, en el historial de la alerta', () => {
    it('antes de las 24 h no hay nada; a las 24 h aparece el recordatorio con la ECA y el edificio', async () => {
      await service.procesarAvisos(t('2026-11-07T08:29:59Z'));
      expect(await tipos(CP)).toEqual([]);

      await service.procesarAvisos(t('2026-11-07T08:30:00Z'));

      const historial = await service.getHistorialAlerta(CP);
      expect(historial).toHaveLength(1);
      expect(historial[0]).toMatchObject({ tipo: 'recordatorio_eca_24h', eca: 'Conservación Porteña S.R.L.', edificio: 'Consorcio Corrientes 1234', fecha: '2026-11-07T08:30:00.000Z' });
      expect(historial[0].mensaje).toContain('24 horas sin acuse');
      expect(await tipos(M2)).toEqual(['recordatorio_eca_24h']); // ya pasaron 24 h de la de las 07:45
      expect(await tipos(M1)).toEqual([]); // la de las 09:15 todavía no
    });

    it('el recordatorio no es todavía un aviso a la Secretaría', async () => {
      await service.procesarAvisos(t('2026-11-07T12:00:00Z'));

      expect(await service.getAvisosSecretaria(t('2026-11-07T12:00:00Z'))).toEqual([]);
    });
  });

  describe('criterio 2: a las 48 h sin acuse hay un aviso en la Secretaría con el edificio y la ECA', () => {
    it('a las 48 h aparece el aviso (y antes no)', async () => {
      expect(await service.getAvisosSecretaria(t('2026-11-08T07:44:59Z'))).toEqual([]); // 1 s antes de las 48 h de la primera alerta (07:45)

      const avisos = await service.getAvisosSecretaria(t('2026-11-08T08:30:00Z'));

      expect(avisos.map((a) => a.alertaId).sort()).toEqual([CP, M2].sort()); // CP a las 08:30 y MAICON-002 desde las 07:45
      const delCP = avisos.find((a) => a.alertaId === CP)!;
      expect(delCP).toMatchObject({ eca: 'Conservación Porteña S.R.L.', edificio: 'Consorcio Corrientes 1234', fecha: '2026-11-08T08:30:00.000Z' });
      expect(delCP.mensaje).toContain('no acusó recibo en 48 horas');
      expect((await tipos(CP))).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']);
    });
  });

  describe('criterio 3: si la ECA acusa recibo antes, no se envía el recordatorio ni el aviso', () => {
    it('acuse antes de las 24 h: ninguno de los dos, aunque pase mucho tiempo', async () => {
      acusar(M2, '2026-11-06T20:00:00Z'); // 12 h después de detectada

      await service.procesarAvisos(t('2026-11-20T00:00:00Z'));

      expect(await tipos(M2)).toEqual([]);
      expect((await service.getAvisosSecretaria(t('2026-11-20T00:00:00Z'))).map((a) => a.alertaId)).not.toContain(M2);
    });

    it('acuse entre las 24 h y las 48 h: el recordatorio ya salía a las 24 h, pero no hay aviso a la Secretaría', async () => {
      acusar(M2, '2026-11-07T15:00:00Z'); // 31 h después

      await service.procesarAvisos(t('2026-11-20T00:00:00Z'));

      expect(await tipos(M2)).toEqual(['recordatorio_eca_24h']);
    });

    it('acuse después de las 48 h: los dos ya correspondían', async () => {
      acusar(M2, '2026-11-09T15:00:00Z');

      await service.procesarAvisos(t('2026-11-20T00:00:00Z'));

      expect(await tipos(M2)).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']);
    });

    it('el acuse de una alerta no frena los avisos de las otras', async () => {
      acusar(M2, '2026-11-06T20:00:00Z');

      await service.procesarAvisos(t('2026-11-20T00:00:00Z'));

      expect(await tipos(CP)).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']);
      expect(await tipos(M1)).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']);
    });
  });

  describe('criterio 4: cada recordatorio y aviso se envía una sola vez por alerta', () => {
    it('procesar muchas veces, a distintas horas, no repite ni cambia la fecha del primero', async () => {
      await service.procesarAvisos(t('2026-11-07T10:00:00Z'));
      await service.procesarAvisos(t('2026-11-07T11:00:00Z'));
      await service.procesarAvisos(t('2026-11-08T10:00:00Z'));
      await service.procesarAvisos(t('2026-11-12T10:00:00Z'));
      await service.procesarAvisos(t('2026-11-12T10:00:00Z'));

      const historial = await service.getHistorialAlerta(CP);
      expect(historial.map((e) => e.tipo)).toEqual(['recordatorio_eca_24h', 'aviso_secretaria_48h']);
      expect(historial[0].fecha).toBe('2026-11-07T10:00:00.000Z'); // la del primer proceso, no la del último
      expect((await service.getAvisosSecretaria(t('2026-11-12T10:00:00Z'))).filter((a) => a.alertaId === CP)).toHaveLength(1);
    });
  });

  it('el historial de una alerta que no existe da 404', async () => {
    await expect(service.getHistorialAlerta('ALT-NO-EXISTE')).rejects.toThrow(/No se encontró alerta crítica/);
  });
});
