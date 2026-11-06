import { DatabaseService } from '../src/database/database.service';
import { EcaService } from '../src/eca/eca.service';
import { FirmanteService } from '../src/firmante/firmante.service';

// HU-10 RF-03 (servicio, sin HTTP): el acuse se guarda ANTES de marcarse en memoria.
const ALERTA = 'ALT-MAICON-001';

function acuseEnMemoria(firmante: FirmanteService, alertaId = ALERTA) {
  return firmante.getMaquinas().find((m) => m.alertaCritica?.id === alertaId)?.alertaCritica?.acuseRecibo ?? null;
}

/** Una base que sólo sabe query(), con el comportamiento que se le indique. */
function baseConQuery(query: jest.Mock) {
  return { query } as unknown as DatabaseService;
}

describe('EcaService.registrarAcuseRecibo (HU-10 RF-03)', () => {
  let firmante: FirmanteService;

  beforeEach(() => {
    firmante = new FirmanteService();
  });

  describe('con base de datos', () => {
    it('guarda primero y recién después marca el acuse en memoria', async () => {
      const orden: string[] = [];
      const query = jest.fn(async (_texto: string, _params?: unknown[]) => {
        orden.push(`INSERT (acuse en memoria: ${acuseEnMemoria(firmante) === null ? 'no' : 'sí'})`);
        return [];
      });
      const ecaService = new EcaService(firmante, baseConQuery(query));

      const res = await ecaService.registrarAcuseRecibo(ALERTA, 'qa.valido');

      expect(res.ok).toBe(true);
      expect(orden).toEqual(['INSERT (acuse en memoria: no)']); // al guardar todavía no estaba marcado
      expect(acuseEnMemoria(firmante)?.usuario).toBe('qa.valido'); // y después sí
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][1]).toEqual(
        expect.arrayContaining([ALERTA, 'qa.valido', `/api/eca/remito/${ALERTA}`]),
      );
    });

    it('si el INSERT falla, el error sube y no queda marcado nada en memoria', async () => {
      const query = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
      const ecaService = new EcaService(firmante, baseConQuery(query));

      await expect(ecaService.registrarAcuseRecibo(ALERTA, 'qa.basecaida')).rejects.toThrow('ECONNREFUSED');

      expect(acuseEnMemoria(firmante)).toBeNull();
    });

    it('el remito tampoco se arma si el acuse no se pudo guardar', async () => {
      const query = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
      const ecaService = new EcaService(firmante, baseConQuery(query));

      await expect(ecaService.getRemitoTecnico(ALERTA, 'operador.legal@maicon.com.ar')).rejects.toThrow('ECONNREFUSED');

      expect(acuseEnMemoria(firmante)).toBeNull();
    });

    it('conserva el error original (con su SQLSTATE) para que el filtro global lo traduzca', async () => {
      const original = Object.assign(new Error('invalid byte sequence'), { code: '22021' });
      const ecaService = new EcaService(firmante, baseConQuery(jest.fn().mockRejectedValue(original)));

      await expect(ecaService.registrarAcuseRecibo(ALERTA, 'qa\u0000')).rejects.toBe(original);
    });

    it('una alerta inexistente da 404 sin tocar la base', async () => {
      const query = jest.fn();
      const ecaService = new EcaService(firmante, baseConQuery(query));

      await expect(ecaService.registrarAcuseRecibo('ALT-NO-EXISTE', 'x')).rejects.toThrow('No se encontró alerta crítica');

      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('criterio 5 — sin base de datos configurada', () => {
    it('el acuse se sigue registrando sólo en memoria, como hasta ahora', async () => {
      const ecaService = new EcaService(firmante); // sin DatabaseService

      const res = await ecaService.registrarAcuseRecibo(ALERTA, 'qa.sinbase');

      expect(res.ok).toBe(true);
      expect(res.acuse.usuario).toBe('qa.sinbase');
      expect(acuseEnMemoria(firmante)?.usuario).toBe('qa.sinbase');
    });
  });
});
