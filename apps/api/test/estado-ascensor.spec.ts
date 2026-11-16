import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmanteService } from '../src/firmante/firmante.service';
import { ParadasService } from '../src/paradas/paradas.service';

// HU-06 RF-05 (servicio): el RT marca el estado, el Firmante lo confirma y volver a Normal exige una nueva inspección con foto.
const MAQUINA = 'MAQ-CORRIENTES-M1'; // Firmante: gonza
const FOTO = 'data:image/jpeg;base64,AAAA';
const gonza = { usuario: 'gonza', rol: 'firmante' };

describe('Estado del ascensor: el RT lo marca y el Firmante lo confirma (HU-06 RF-05)', () => {
  let firmante: FirmanteService;
  let service: ParadasService;
  const maquina = () => firmante.getMaquinas().find((m) => m.id === MAQUINA)!;
  const marcar = (estado?: string) => service.registrar({ maquinaId: MAQUINA, estado, causa: 'Ruido fuerte al subir', fotos: [FOTO] }, 'rt1');

  beforeEach(() => {
    firmante = new FirmanteService();
    service = new ParadasService(firmante);
  });

  describe('criterio 1: el RT marca «Reparación Urgente» o «Fuera de Servicio», queda pendiente y se avisa', () => {
    it.each(['Reparación Urgente', 'Fuera de Servicio'])('«%s» queda «Pendiente de confirmación» y avisa a la Secretaría y al Firmante', (estado) => {
      const r = marcar(estado);

      expect(r).toMatchObject({ estadoMarcado: estado, confirmacion: 'Pendiente de confirmación', estado: `${estado} — Pendiente de confirmación`, avisadoA: ['secretaria', 'firmante:gonza'] });
      expect(maquina()).toMatchObject({ estadoOperativo: estado, confirmacionEstado: 'Pendiente de confirmación' });
    });

    it('sin indicar el estado se toma «Fuera de Servicio» (lo de HU-17 RF-03); un estado que no existe → 400', () => {
      expect(marcar().estadoMarcado).toBe('Fuera de Servicio');
      expect(() => marcar('Normal')).toThrow(BadRequestException);
      expect(() => marcar('Roto')).toThrow(BadRequestException);
    });
  });

  describe('criterio 2: sólo el Firmante asignado confirma o rechaza', () => {
    it('el Firmante asignado confirma: el estado queda vigente', () => {
      const r = marcar('Reparación Urgente');

      const confirmado = service.resolver(r.id, 'confirmar', gonza);

      expect(confirmado).toMatchObject({ confirmacion: 'Confirmado', estado: 'Reparación Urgente — Confirmado', resueltoPor: 'gonza' });
      expect(maquina()).toMatchObject({ estadoOperativo: 'Reparación Urgente', confirmacionEstado: 'Confirmado' });
    });

    it('el Firmante asignado rechaza (con motivo): el equipo vuelve a Normal', () => {
      const r = marcar('Fuera de Servicio');

      const rechazado = service.resolver(r.id, 'rechazar', gonza, '  Funciona, fue una falsa alarma ');

      expect(rechazado).toMatchObject({ confirmacion: 'Rechazado', motivoRechazo: 'Funciona, fue una falsa alarma' });
      expect(maquina()).toMatchObject({ estadoOperativo: 'Normal', confirmacionEstado: 'Rechazado' });
    });

    it('rechazar sin motivo → 400 y sigue pendiente', () => {
      const r = marcar();

      expect(() => service.resolver(r.id, 'rechazar', gonza, '   ')).toThrow(BadRequestException);
      expect(maquina().confirmacionEstado).toBe('Pendiente de confirmación');
    });

    it.each([
      ['la Secretaría', { usuario: 'sec1', rol: 'secretaria' }],
      ['el Administrador', { usuario: 'admin1', rol: 'administrador' }],
      ['el RT de Calle', { usuario: 'rt1', rol: 'rt_calle' }],
      ['la ECA', { usuario: 'eca1', rol: 'eca' }],
      ['un Firmante de otro edificio', { usuario: 'otro.firmante', rol: 'firmante' }],
    ])('%s no confirma ni rechaza (403) y no cambia nada', (_n, quien) => {
      const r = marcar();

      expect(() => service.resolver(r.id, 'confirmar', quien)).toThrow(ForbiddenException);
      expect(() => service.resolver(r.id, 'rechazar', quien, 'x')).toThrow(ForbiddenException);
      expect(maquina().confirmacionEstado).toBe('Pendiente de confirmación');
    });

    it('un reporte ya resuelto no se resuelve de nuevo (409) y uno que no existe da 404', () => {
      const r = marcar();
      service.resolver(r.id, 'confirmar', gonza);

      expect(() => service.resolver(r.id, 'rechazar', gonza, 'x')).toThrow(ConflictException);
      expect(() => service.resolver('PAR-NO-EXISTE', 'confirmar', gonza)).toThrow(NotFoundException);
    });

    it('un Firmante ve sólo los reportes de sus edificios', () => {
      marcar();

      expect(service.listar(gonza)).toHaveLength(1);
      expect(service.listar({ usuario: 'otro.firmante', rol: 'firmante' })).toEqual([]);
      expect(service.listar({ usuario: 'sec1', rol: 'secretaria' })).toHaveLength(1);
    });
  });

  describe('criterio 4: volver a Normal exige una nueva inspección del RT con al menos una foto', () => {
    const confirmarEstado = () => service.resolver(marcar('Fuera de Servicio').id, 'confirmar', gonza);

    it('sin foto → 400 y el estado no cambia', () => {
      confirmarEstado();

      expect(() => service.normalizar(MAQUINA, {}, 'rt1')).toThrow(BadRequestException);
      expect(() => service.normalizar(MAQUINA, { fotos: [] }, 'rt1')).toThrow(BadRequestException);
      expect(() => service.normalizar(MAQUINA, { fotos: ['', '  '] }, 'rt1')).toThrow(BadRequestException);
      expect(maquina().estadoOperativo).toBe('Fuera de Servicio');
    });

    it('con al menos una foto vuelve a Normal y se puede volver a marcar', () => {
      confirmarEstado();

      const r = service.normalizar(MAQUINA, { fotos: [FOTO] }, 'rt1');

      expect(r).toMatchObject({ estadoOperativo: 'Normal', reportadoPor: 'rt1', fotos: 1 });
      expect(maquina()).toMatchObject({ estadoOperativo: 'Normal', confirmacionEstado: undefined });
      expect(marcar('Reparación Urgente').confirmacion).toBe('Pendiente de confirmación');
    });

    it('mientras el estado está pendiente de confirmación no se puede volver a Normal (409); un equipo que ya está Normal da 409; uno inexistente 404', () => {
      marcar();
      expect(() => service.normalizar(MAQUINA, { fotos: [FOTO] }, 'rt1')).toThrow(ConflictException);

      const otra = new ParadasService(new FirmanteService());
      expect(() => otra.normalizar('MAQ-CALLAO-M1', { fotos: [FOTO] }, 'rt1')).toThrow(ConflictException); // ya es normal
      expect(() => otra.normalizar('NO-EXISTE', { fotos: [FOTO] }, 'rt1')).toThrow(NotFoundException);
    });
  });
});
