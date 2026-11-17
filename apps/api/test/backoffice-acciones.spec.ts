import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BackofficeService } from '../src/backoffice/backoffice.service';
import { InMemoryReclamosRepository } from '../src/backoffice/reclamos.repository';
import { InMemoryRemitosRepository } from '../src/backoffice/remitos.repository';
import { FirmanteService } from '../src/firmante/firmante.service';

// HU-05 RF-02 (API): detalle de la visita para el visor y reclamo a la administración según el estado de la visita.
describe('Acciones del tablero de monitoreo (HU-05 RF-02)', () => {
  let service: BackofficeService;
  let reclamos: InMemoryReclamosRepository;

  beforeEach(() => {
    reclamos = new InMemoryReclamosRepository();
    service = new BackofficeService(new FirmanteService(), new InMemoryRemitosRepository(), reclamos);
  });

  describe('detalle de la visita (visor de fotos e informe)', () => {
    it('trae las fotos obligatorias (cables y frente) y los datos de la visita', () => {
      const d = service.detalle('MAQ-CORRIENTES-M1');

      expect(d).toMatchObject({ id: 'VIS-2026-11-101', direccion: 'Av. Corrientes 1234, CABA', eca: 'Conservación Porteña S.R.L.', inspector: 'dev-ma-2', estadoVisita: 'Recorrida', fecha: '2026-11-04T10:30:00.000Z', nombreEncargado: 'Carlos Rodríguez (Encargado)' });
      expect(d.fotos).toEqual([
        { etiqueta: 'Cables', url: 'https://storage.nuestrocamino.cloud/fotos/cables-maq-101.jpg' },
        { etiqueta: 'Frente del edificio', url: 'https://storage.nuestrocamino.cloud/fotos/frente-maq-101.jpg' },
      ]);
      expect(d.checklist).toEqual([]);
    });

    it('un equipo con alerta crítica trae el título, el motivo y los ítems del checklist con su estado (Santa Fe M1: 4 ítems)', () => {
      const d = service.detalle('MAQ-SANTAFE-M1');

      expect(d.titulo).toEqual(expect.any(String));
      expect(d.motivo).toEqual(expect.any(String));
      expect(d.checklist).toHaveLength(4);
      for (const c of d.checklist) expect(c).toEqual({ item: expect.any(String), estado: expect.stringMatching(/^(Critico|Falla|Peligro)$/), observaciones: expect.any(String) });
    });

    it('la foto de la cabina trabada se suma a las obligatorias y las fotos vacías no cuentan (Santa Fe M2 tiene vacía la de cables)', () => {
      expect(service.detalle('MAQ-SANTAFE-M2').fotos.map((f) => f.etiqueta)).toEqual(['Frente del edificio', 'Cabina trabada']);
      expect(service.detalle('MAQ-CORRIENTES-M2').fotos.map((f) => f.etiqueta)).toEqual(['Cabina trabada']);
    });

    it('una visita sin fotos ni checklist (Callao M1) trae listas vacías', () => {
      expect(service.detalle('MAQ-CALLAO-M1')).toMatchObject({ fotos: [], checklist: [] });
    });

    it('un equipo sin visita trae el RT como inspector, sin fecha ni fotos, con id «sin-visita:…»', () => {
      expect(service.detalle('MAQ-CORRIENTES-M2')).toMatchObject({ id: 'sin-visita:MAQ-CORRIENTES-M2', inspector: 'dev-ma-2', fecha: null, estadoVisita: 'Pendiente de Visita' });
    });

    it('la columna «Checklist» de la fila cuenta las fotos y los ítems del detalle', async () => {
      const filas = (await service.monitoreo({})).items;
      for (const f of filas) {
        const d = service.detalle(f.maquinaId);
        expect({ fotos: f.fotos, items: f.itemsChecklist }).toEqual({ fotos: d.fotos.length, items: d.checklist.length });
      }
      expect(filas.find((f) => f.maquinaId === 'MAQ-CORRIENTES-M1')).toMatchObject({ fotos: 2, itemsChecklist: 0 });
      expect(filas.find((f) => f.maquinaId === 'MAQ-SANTAFE-M1')).toMatchObject({ fotos: 2, itemsChecklist: 4 });
    });

    it('un equipo que no existe → 404', () => {
      expect(() => service.detalle('NO-EXISTE')).toThrow(NotFoundException);
    });
  });

  describe('«Reclamar a Admin»: sólo una visita con advertencia', () => {
    it('registra quién y cuándo reclamó, a qué administración, y la fila lo muestra', async () => {
      const antes = Date.now();
      const r = await service.reclamarAdmin({ maquinaId: 'MAQ-CALLAO-M1' }, 'sec1');

      expect(r).toMatchObject({ maquinaId: 'MAQ-CALLAO-M1', visitaId: 'VIS-2026-11-201', administracion: expect.any(String), direccion: 'Av. Callao 850, CABA', reclamadoPor: 'sec1' });
      expect(Date.parse(r.reclamadoEn)).toBeGreaterThanOrEqual(antes);
      const fila = (await service.monitoreo({ direccion: 'callao' })).items[0];
      expect(fila.reclamo).toEqual(r);
      expect(fila.administracion).toBe(r.administracion);
    });

    it('la misma visita no se reclama dos veces (409 con el reclamo anterior)', async () => {
      await service.reclamarAdmin({ maquinaId: 'MAQ-CALLAO-M1' }, 'sec1');

      await expect(service.reclamarAdmin({ maquinaId: 'MAQ-CALLAO-M1' }, 'sec2')).rejects.toThrow(/ya se le reclamó a .* el .* \(sec1\)/);
      expect(reclamos.reclamos).toHaveLength(1);
    });

    it.each([
      ['una visita Recorrida', 'MAQ-CORRIENTES-M1'],
      ['un equipo Pendiente de Visita', 'MAQ-CORRIENTES-M2'],
      ['otra visita Recorrida', 'MAQ-SANTAFE-M1'],
    ])('%s no se reclama (409)', async (_n, maquinaId) => {
      await expect(service.reclamarAdmin({ maquinaId }, 'sec1')).rejects.toBeInstanceOf(ConflictException);
      expect(reclamos.reclamos).toHaveLength(0);
    });

    it('un equipo que no existe → 404; sin maquinaId → 400', async () => {
      await expect(service.reclamarAdmin({ maquinaId: 'NO-EXISTE' }, 'sec1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.reclamarAdmin({}, 'sec1')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.reclamarAdmin(null, 'sec1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
