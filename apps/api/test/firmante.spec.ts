import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FirmanteService } from '../src/firmante/firmante.service';
import { requiereFotoDeCables } from '../src/firmante/firmante.types';

describe('FirmanteService', () => {
  let service: FirmanteService;

  beforeEach(() => {
    service = new FirmanteService();
  });

  describe('getMaquinasDelMes', () => {
    it('retorna la lista de máquinas asignadas al firmante', async () => {
      const maquinas = await service.getMaquinasDelMes('gonza');
      expect(maquinas.length).toBeGreaterThan(0);
      expect(maquinas.every((m) => m.firmanteUsername === 'gonza')).toBe(true);

      const m1 = maquinas.find((m) => m.id === 'MAQ-CORRIENTES-M1');
      expect(m1).toBeDefined();
      expect(m1?.edificio.direccion).toContain('Av. Corrientes 1234');
      expect(m1?.codigoAGC).toBe('M1');
      expect(m1?.estado).toBe('Recorrida');
      expect(m1?.visita?.fotosObligatorias?.cables).toBeTruthy();
      expect(m1?.visita?.fotosObligatorias?.frente).toBeTruthy();
      expect(m1?.visita?.firmaEncargado).toBeTruthy();
    });

    it('permite filtrar por mes', async () => {
      const nov = await service.getMaquinasDelMes('gonza', '2026-11');
      expect(nov.length).toBeGreaterThan(0);

      const dic = await service.getMaquinasDelMes('gonza', '2026-12');
      expect(dic.length).toBe(0);
    });
  });

  describe('autorizarFirma', () => {
    it('rechaza si no se envía maquinaId ni visitaId', async () => {
      await expect(service.autorizarFirma({} as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza con NotFoundException si la máquina no existe', async () => {
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-INEXISTENTE' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la máquina está en estado "Pendiente de Visita"', async () => {
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-CORRIENTES-M2' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-CORRIENTES-M2' }),
      ).rejects.toThrow(/estado Recorrida/);
    });

    it('rechaza si la máquina está en estado "Advertencia"', async () => {
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-CALLAO-M1' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-CALLAO-M1' }),
      ).rejects.toThrow(/estado Recorrida/);
    });

    it('rechaza si faltan fotos obligatorias (ej. falta foto de cables)', async () => {
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-SANTAFE-M2' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-SANTAFE-M2' }),
      ).rejects.toThrow(/fotos obligatorias de cables y frente/);
    });

    it('rechaza si falta la firma del encargado en el informe', async () => {
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-SANTAFE-M1' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.autorizarFirma({ maquinaId: 'MAQ-SANTAFE-M1' }),
      ).rejects.toThrow(/firma del encargado/);
    });

    it('autoriza exitosamente la máquina recorrida con fotos y firma', async () => {
      const res = await service.autorizarFirma(
        { maquinaId: 'MAQ-CORRIENTES-M1' },
        'gonza',
      );

      expect(res.ok).toBe(true);
      expect(res.maquinaId).toBe('MAQ-CORRIENTES-M1');
      expect(res.autorizacion.autorizada).toBe(true);
      expect(res.autorizacion.autorizadoPor).toBe('gonza');
      expect(res.autorizacion.fechaAutorizacion).toBeTruthy();
      expect(res.autorizacion.protocoloAGC).toContain('AGC-2026-AUT-MAQ-CORRIENTES-M1');

      // Verifica que el estado se actualizó en la lista
      const [actualizada] = await service.getMaquinasDelMes('gonza');
      expect(actualizada.visita?.autorizada).toBe(true);
      expect(actualizada.visita?.autorizadoPor).toBe('gonza');
    });
  });

  // HU-08 RF-08: la foto de cables sólo se exige a los equipos con cables de tracción; la del frente, siempre.
  describe('autorizarFirma: la foto de cables y el tipo de equipo (HU-08 RF-08)', () => {
    const FRENTE = 'https://fotos.test/frente.jpg';
    const CABLES = 'https://fotos.test/cables.jpg';
    const FIRMA = 'data:image/svg+xml;base64,PHN2Zy8+';
    /** Deja una máquina como recorrida, con la visita y las fotos que se indiquen, y devuelve su id. */
    const recorrida = async (id: string, tipo: 'traccion' | 'hidraulico' | 'montavehiculos' | undefined, fotos: { cables?: string; frente?: string } | null) => {
      const m = (service as unknown as { maquinas: { id: string; tipo?: string }[] }).maquinas.find((x) => x.id === id)!;
      m.tipo = tipo;
      await service.registrarVisita(id, {
        id: `VIS-${id}`, fecha: '2026-11-20T10:00:00.000Z', inspector: 'rt', estado: 'Recorrida', fotosObligatorias: fotos as never,
        firmaEncargado: FIRMA, nombreEncargado: 'Carlos Rodríguez (Encargado)', autorizada: false,
      });
      return id;
    };

    it('criterio 1: un hidráulico con la foto del frente y la firma se autoriza aunque no tenga foto de cables', async () => {
      const id = await recorrida('MAQ-CORRIENTES-M2', 'hidraulico', { frente: FRENTE });

      const res = await service.autorizarFirma({ maquinaId: id }, 'gonza');

      expect(res.ok).toBe(true);
      expect(res.autorizacion.autorizada).toBe(true);
    });

    it('criterio 1: lo mismo con la foto de cables vacía o nula', async () => {
      for (const cables of ['', '   ', null]) {
        service = new FirmanteService();
        const id = await recorrida('MAQ-CORRIENTES-M2', 'hidraulico', { frente: FRENTE, cables: cables as never });

        await expect(service.autorizarFirma({ maquinaId: id }, 'gonza')).resolves.toMatchObject({ ok: true });
      }
    });

    it('criterio 2: tracción, montavehículos y una máquina sin tipo, sin foto de cables → se rechaza como hoy', async () => {
      for (const tipo of ['traccion', 'montavehiculos', undefined] as const) {
        service = new FirmanteService();
        const id = await recorrida('MAQ-CORRIENTES-M2', tipo, { frente: FRENTE });

        await expect(service.autorizarFirma({ maquinaId: id })).rejects.toThrow(BadRequestException);
        await expect(service.autorizarFirma({ maquinaId: id })).rejects.toThrow('No se puede autorizar: la visita debe contar con fotos obligatorias de cables y frente');
      }
    });

    it('criterio 2: tracción con las dos fotos se autoriza', async () => {
      const id = await recorrida('MAQ-CORRIENTES-M2', 'traccion', { frente: FRENTE, cables: CABLES });

      await expect(service.autorizarFirma({ maquinaId: id }, 'gonza')).resolves.toMatchObject({ ok: true });
    });

    it('criterio 3: sin la foto del frente se rechaza siempre, también un hidráulico', async () => {
      for (const tipo of ['hidraulico', 'traccion'] as const) {
        service = new FirmanteService();
        const id = await recorrida('MAQ-CORRIENTES-M2', tipo, { cables: CABLES });

        await expect(service.autorizarFirma({ maquinaId: id })).rejects.toThrow(BadRequestException);
      }
    });

    it('criterio 3: un hidráulico sin ninguna foto dice que falta la del frente y que un hidráulico no lleva cables', async () => {
      for (const fotos of [null, {}, { frente: '' }]) {
        service = new FirmanteService();
        const id = await recorrida('MAQ-CORRIENTES-M2', 'hidraulico', fotos);

        await expect(service.autorizarFirma({ maquinaId: id })).rejects.toThrow(/foto obligatoria del frente de cabina \(un equipo hidráulico no lleva foto de cables\)/);
      }
    });

    it('requiereFotoDeCables: sólo el hidráulico no la necesita', () => {
      expect(requiereFotoDeCables('hidraulico')).toBe(false);
      expect(requiereFotoDeCables('traccion')).toBe(true);
      expect(requiereFotoDeCables('montavehiculos')).toBe(true);
      expect(requiereFotoDeCables(undefined)).toBe(true);
      expect(requiereFotoDeCables(null)).toBe(true);
    });
  });
});
