import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FallasCriticasService } from '../src/fallas-criticas/fallas-criticas.service';
import { FirmanteService } from '../src/firmante/firmante.service';

// HU-06 RF-04 (servicio): la alerta de falla crítica va al Firmante del edificio y la primera apertura queda registrada.
const MAQUINA = 'MAQ-CORRIENTES-M1'; // Firmante: gonza

describe('Alerta de falla crítica: Firmante asignado y primera apertura (HU-06 RF-04)', () => {
  let service: FallasCriticasService;
  const informar = () => service.registrarInforme({ maquinaId: MAQUINA, inspector: 'rt1', fallasCriticas: ['PARACAIDAS_ANOMALIA'] }).informe;
  const secretaria = { usuario: 'sec1', rol: 'secretaria' };

  beforeEach(() => {
    service = new FallasCriticasService(new FirmanteService());
  });

  describe('criterio 1: el Firmante asignado al edificio ve la alerta', () => {
    it('el evento trae el Firmante asignado y todavía no tiene quién la abrió', () => {
      informar();

      const evento = service.listarEventosCriticos(secretaria)[0];

      expect(evento).toMatchObject({ firmanteUsername: 'gonza', abiertaPor: null, abiertaEn: null });
    });

    it('un Firmante ve sólo las alertas de sus edificios; la Secretaría y el Administrador, todas', () => {
      informar();

      expect(service.listarEventosCriticos({ usuario: 'gonza', rol: 'firmante' })).toHaveLength(1);
      expect(service.listarEventosCriticos({ usuario: 'GONZA', rol: 'firmante' })).toHaveLength(1); // sin distinguir mayúsculas
      expect(service.listarEventosCriticos({ usuario: 'otro.firmante', rol: 'firmante' })).toEqual([]);
      expect(service.listarEventosCriticos(secretaria)).toHaveLength(1);
      expect(service.listarEventosCriticos({ usuario: 'admin1', rol: 'administrador' })).toHaveLength(1);
    });
  });

  describe('criterio 3: la alerta registra qué usuario la abrió primero, con fecha y hora', () => {
    it('la primera apertura queda registrada y se ve en la lista', () => {
      const informe = informar();

      const apertura = service.abrir(informe.id, secretaria);

      expect(apertura).toMatchObject({ abiertaPor: 'sec1', primera: true });
      expect(Number.isNaN(Date.parse(apertura.abiertaEn))).toBe(false);
      expect(service.listarEventosCriticos(secretaria)[0]).toMatchObject({ abiertaPor: 'sec1', abiertaEn: apertura.abiertaEn });
    });

    it('una segunda apertura (de otro usuario) no cambia nada y devuelve la primera', () => {
      const informe = informar();
      const primera = service.abrir(informe.id, secretaria);

      const segunda = service.abrir(informe.id, { usuario: 'gonza', rol: 'firmante' });

      expect(segunda).toEqual({ abiertaPor: 'sec1', abiertaEn: primera.abiertaEn, primera: false });
      expect(service.listarEventosCriticos(secretaria)[0].abiertaPor).toBe('sec1');
    });

    it('un Firmante sólo abre las alertas de sus edificios (403 las demás); una alerta que no existe da 404', () => {
      const informe = informar();

      expect(() => service.abrir(informe.id, { usuario: 'otro.firmante', rol: 'firmante' })).toThrow(ForbiddenException);
      expect(service.listarEventosCriticos(secretaria)[0].abiertaPor).toBeNull();
      expect(() => service.abrir('INF-NO-EXISTE', secretaria)).toThrow(NotFoundException);
    });

    it('un informe sin fallas críticas no es una alerta: no se puede abrir (404)', () => {
      const comun = service.registrarInforme({ maquinaId: MAQUINA, inspector: 'rt1', fallasCriticas: ['TABLERO_FUERA_DE_NORMA'] }).informe;

      expect(() => service.abrir(comun.id, secretaria)).toThrow(NotFoundException);
    });
  });

  describe('criterio 2: al abrir la alerta se avisa por el canal para que deje de sonar en todas las pantallas', () => {
    it('la primera apertura emite el aviso; las siguientes no', () => {
      const informe = informar();
      const avisos: { informeId: string; abiertaPor: string }[] = [];
      service.aperturas$().subscribe((a) => avisos.push({ informeId: a.informeId, abiertaPor: a.abiertaPor }));

      service.abrir(informe.id, secretaria);
      service.abrir(informe.id, { usuario: 'otra.sec', rol: 'secretaria' });

      expect(avisos).toEqual([{ informeId: informe.id, abiertaPor: 'sec1' }]);
    });
  });
});
