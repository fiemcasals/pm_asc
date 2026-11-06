import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FirmanteService } from '../src/firmante/firmante.service';

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
});
