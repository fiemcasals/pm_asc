import { BadRequestException } from '@nestjs/common';
import { CHECKLIST_SOLAPAS, obtenerFallasCriticasDefinidas } from '../src/checklist/checklist.config';
import { renderInforme } from '../src/fallas-criticas/fallas-criticas.controller';
import { FallasCriticasService } from '../src/fallas-criticas/fallas-criticas.service';
import { FirmanteService } from '../src/firmante/firmante.service';

// HU-06 RF-03: la lista de fallas críticas que definió el cliente (P3 y P6).
const TRACCION = 'MAQ-CORRIENTES-M1'; // de tracción (sin tipo: se toma como tracción)
const HIDRAULICA = 'MAQ-CORRIENTES-M2'; // hidráulica

/** La lista del cliente: código → zona. "Limitador anulado" sigue como crítico hasta que MAICON responda (ver la tarjeta). */
const LISTA_DEL_CLIENTE: Record<string, string> = {
  CABLES_DESGASTADOS: 'sala_maquinas',
  CORTE_FUERZA_MOTRIZ_NO_ACTUA: 'sala_maquinas',
  ACEITE_BATEA_INSUFICIENTE: 'sala_maquinas',
  LIMITADOR_ANULADO: 'sala_maquinas',
  BOTON_PARE_FALLA: 'cabina',
  PARACAIDAS_ANOMALIA: 'cabina',
  DESTRABE_MANUAL_TRABADO_INEXISTENTE: 'accesos',
  CERRADURA_NO_TRABA: 'accesos',
  CONTACTO_ELECTRICO_PUENTEADO_FALLA: 'accesos',
  ESPACIO_ENTRE_PUERTAS_MAYOR_12CM: 'accesos',
  INSTALACIONES_AJENAS_SI: 'caja',
  ESPACIOS_CON_ABERTURAS: 'caja',
  LIMITES_FALLAN_ANULADOS: 'caja',
  STOP_FOSA_DEFICIENTE_INEXISTENTE: 'fosa',
};

const QUITADAS = ['PERDIDA_ACEITE_CRITICA', 'LIMITADOR_DEFICIENTE', 'TABLERO_FUERA_DE_NORMA', 'PUERTA_TIJERA', 'ALARMA', 'PISO_MADERA', 'BARANDA_TECHO', 'EXTENSION_CABLES'];

describe('Lista de fallas críticas del cliente (HU-06 RF-03)', () => {
  let service: FallasCriticasService;
  const informe = (maquinaId: string, fallasCriticas: string[]) =>
    service.registrarInforme({ maquinaId, inspector: 'Ing. Prueba', fallasCriticas });

  beforeEach(() => {
    service = new FallasCriticasService(new FirmanteService());
  });

  describe('el catálogo del checklist es exactamente la lista del cliente', () => {
    it('tiene las 14 fallas críticas, cada una en su zona', () => {
      const catalogo = Object.fromEntries(obtenerFallasCriticasDefinidas().map((f) => [f.codigoFallaCritica, f.solapaId]));

      expect(catalogo).toEqual(LISTA_DEL_CLIENTE);
    });

    it('las zonas son Sala de Máquinas, Cabina, Accesos, Caja y Fosa', () => {
      expect([...new Set(obtenerFallasCriticasDefinidas().map((f) => f.solapaNombre))]).toEqual(['Sala de Máquinas', 'Cabina', 'Accesos', 'Caja', 'Fosa']);
    });

    it('lo que el cliente sacó no es crítico en el checklist: pérdida de aceite, limitador deficiente, tablero, puerta tijera, alarma, piso, baranda y extensión de cables', () => {
      const opciones = (itemId: string) =>
        CHECKLIST_SOLAPAS.flatMap((s) => s.subgrupos.flatMap((g) => g.items.filter((i) => i.id === itemId).flatMap((i) => i.opciones)));

      for (const itemId of ['perdida_aceite', 'tablero_control', 'alarma_cabina', 'piso_madera', 'baranda_techo', 'extension_cables']) {
        const ops = opciones(itemId);
        expect(ops.length).toBeGreaterThan(0);
        expect(ops.filter((o) => o.esFallaCritica)).toEqual([]);
      }
      expect(opciones('limitador_velocidad').find((o) => o.id === 'deficiente')?.esFallaCritica).toBe(false);
      expect(opciones('puerta_cabina').concat(opciones('puerta_tijera')).filter((o) => o.id === 'puerta_tijera').every((o) => !o.esFallaCritica)).toBe(true);
    });
  });

  describe('criterio 1: cada ítem de la lista genera la alerta de Falla Crítica', () => {
    it.each(Object.keys(LISTA_DEL_CLIENTE))('%s se acepta y emite la alerta', (codigo) => {
      const maquina = codigo === 'ACEITE_BATEA_INSUFICIENTE' ? HIDRAULICA : TRACCION;

      const res = informe(maquina, [codigo]);

      expect(res.eventoEmitido).toBe(true);
      expect(res.informe.fallasCriticas).toEqual([codigo]);
      expect(res.informe.fallasComunes).toEqual([]);
      expect(service.listarEventosCriticos().map((e) => e.fallas[0])).toContain(codigo);
    });

    it('varias fallas juntas generan una sola alerta con todas', () => {
      const res = informe(TRACCION, ['PARACAIDAS_ANOMALIA', 'STOP_FOSA_DEFICIENTE_INEXISTENTE', 'CERRADURA_NO_TRABA']);

      expect(res.eventoEmitido).toBe(true);
      expect(res.informe.fallasCriticas).toHaveLength(3);
      expect(service.listarEventosCriticos()).toHaveLength(1);
    });
  });

  describe('criterio 2: lo que el cliente sacó se registra como falla común y no genera alerta crítica', () => {
    it.each(QUITADAS)('%s queda como falla común, sin alerta', (codigo) => {
      const res = informe(TRACCION, [codigo]);

      expect(res.eventoEmitido).toBe(false);
      expect(res.informe.fallasCriticas).toEqual([]);
      expect(res.informe.fallasComunes).toEqual([codigo]);
      expect(service.listarEventosCriticos()).toEqual([]);
    });

    it('en un informe mezclado, sólo las críticas generan la alerta; las comunes quedan registradas', () => {
      const res = informe(TRACCION, ['TABLERO_FUERA_DE_NORMA', 'BOTON_PARE_FALLA', 'PISO_MADERA', 'TABLERO_FUERA_DE_NORMA']);

      expect(res.eventoEmitido).toBe(true);
      expect(res.informe.fallasCriticas).toEqual(['BOTON_PARE_FALLA']);
      expect(res.informe.fallasComunes).toEqual(['TABLERO_FUERA_DE_NORMA', 'PISO_MADERA']); // sin repetir
      expect(service.listarEventosCriticos()[0].fallas).toEqual(['BOTON_PARE_FALLA']);
    });
  });

  describe('criterio 3: «Aceite de batea insuficiente» sólo en máquinas hidráulicas', () => {
    it('en una máquina de tracción responde 400 con el motivo y no registra nada', () => {
      expect(() => informe(TRACCION, ['ACEITE_BATEA_INSUFICIENTE'])).toThrow(BadRequestException);
      try {
        informe(TRACCION, ['ACEITE_BATEA_INSUFICIENTE']);
      } catch (err) {
        const respuesta = (err as BadRequestException).getResponse() as { errores: string[] };
        expect(respuesta.errores[0]).toContain('Aceite de batea');
        expect(respuesta.errores[0]).toContain('sólo aplica a máquinas hidraulico');
      }
      expect(service.listarEventosCriticos()).toEqual([]);
    });

    it('en una hidráulica se acepta', () => {
      expect(informe(HIDRAULICA, ['ACEITE_BATEA_INSUFICIENTE']).eventoEmitido).toBe(true);
    });

    it('si el informe mezcla una falla válida y el aceite en una máquina de tracción, no se registra nada', () => {
      expect(() => informe(TRACCION, ['PARACAIDAS_ANOMALIA', 'ACEITE_BATEA_INSUFICIENTE'])).toThrow(BadRequestException);
      expect(service.listarEventosCriticos()).toEqual([]);
    });
  });

  describe('criterio 4: la alerta muestra el nombre legible de cada falla, agrupada por zona', () => {
    it('el evento trae cada falla con su nombre y su zona, en el orden de las zonas', () => {
      const res = informe(TRACCION, ['STOP_FOSA_DEFICIENTE_INEXISTENTE', 'PARACAIDAS_ANOMALIA', 'CABLES_DESGASTADOS', 'CERRADURA_NO_TRABA']);

      const evento = service.listarEventosCriticos()[0];
      expect(evento.fallasDetalle.map((d) => `${d.zona} | ${d.nombre}`)).toEqual([
        'Sala de Máquinas | Cables de tracción desgastados',
        'Cabina | Paracaídas: Anomalía',
        'Accesos | Cerradura: No traba',
        'Fosa | Stop de fosa: DEFICIENTE / INEXISTENTE',
      ]);
      expect(res.informe.fallasCriticasDetalle).toEqual(evento.fallasDetalle);
    });

    it('el informe legible agrupa las fallas por zona y lista aparte las comunes', () => {
      const res = informe(TRACCION, ['PARACAIDAS_ANOMALIA', 'BOTON_PARE_FALLA', 'STOP_FOSA_DEFICIENTE_INEXISTENTE', 'ALARMA']);

      const html = renderInforme(res.informe);

      expect(html.indexOf('<h3>Cabina</h3>')).toBeGreaterThan(-1);
      expect(html.indexOf('<h3>Cabina</h3>')).toBeLessThan(html.indexOf('<h3>Fosa</h3>'));
      expect(html).toContain('Paracaídas: Anomalía');
      expect(html).toContain('Otras fallas (no críticas)');
      expect(html).toContain('<li>ALARMA</li>');
    });
  });
});
