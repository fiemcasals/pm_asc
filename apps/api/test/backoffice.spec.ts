import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FirmanteService } from '../src/firmante/firmante.service';
import { BackofficeService } from '../src/backoffice/backoffice.service';
import { normalizar, paginar } from '../src/backoffice/backoffice.logic';
import { InMemoryReclamosRepository } from '../src/backoffice/reclamos.repository';
import { InMemoryRemitosRepository } from '../src/backoffice/remitos.repository';

// HU-05 RF-01: monitoreo paginado y filtrable, y registro del remito a la ECA.
// Los 5 equipos de demostración, de lo más reciente a lo más antiguo: Callao M1 (5/11 14:15), Santa Fe M2 (5/11 09:45), Santa Fe M1 (5/11 09:00),
// Corrientes M1 (4/11) y, al final, Corrientes M2 que todavía no tiene visita.
const ORDEN = ['MAQ-CALLAO-M1', 'MAQ-SANTAFE-M2', 'MAQ-SANTAFE-M1', 'MAQ-CORRIENTES-M1', 'MAQ-CORRIENTES-M2'];

describe('Monitoreo del backoffice (HU-05 RF-01)', () => {
  let service: BackofficeService;
  let remitos: InMemoryRemitosRepository;
  const ids = async (q: Record<string, unknown> = {}) => (await service.monitoreo(q)).items.map((f) => f.maquinaId);

  beforeEach(() => {
    remitos = new InMemoryRemitosRepository();
    service = new BackofficeService(new FirmanteService(), remitos, new InMemoryReclamosRepository());
  });

  describe('criterio 1: listado paginado filtrable por dirección, ECA e inspector, con estado de visita', () => {
    it('sin filtros trae los 5 equipos, lo más reciente primero y los que no tienen visita al final', async () => {
      const p = await service.monitoreo({});

      expect(p).toMatchObject({ total: 5, pagina: 1, porPagina: 20, totalPaginas: 1 });
      expect(p.items.map((f) => f.maquinaId)).toEqual(ORDEN);
    });

    it('cada fila trae dirección, ECA, inspector, estado de visita, fecha, firmante y estado operativo', async () => {
      const callao = (await service.monitoreo({})).items[0];

      expect(callao).toEqual({
        id: 'VIS-2026-11-201', maquinaId: 'MAQ-CALLAO-M1', codigoAGC: 'M1', equipo: expect.any(String), direccion: 'Av. Callao 850, CABA', consorcio: expect.any(String),
        eca: 'Elevadores San Martín', inspector: 'germanG', estadoVisita: 'Advertencia', fecha: '2026-11-05T14:15:00.000Z', estadoOperativo: 'Normal',
        firmante: 'gonza', autorizada: false, rechazada: false, alertaCritica: false, remito: null,
        administracion: expect.any(String), reclamo: null, fotos: expect.any(Number), itemsChecklist: 0,
      });
    });

    it('un equipo sin visita trae el RT asignado como inspector, sin fecha y con id «sin-visita:…»', async () => {
      const f = (await service.monitoreo({ pagina: '1' })).items.at(-1)!;

      expect(f).toMatchObject({ id: 'sin-visita:MAQ-CORRIENTES-M2', inspector: 'dev-ma-2', fecha: null, estadoVisita: 'Pendiente de Visita', estadoOperativo: 'Fuera de Servicio', alertaCritica: true });
    });

    it.each([
      ['dirección', { direccion: 'corrientes' }, ['MAQ-CORRIENTES-M1', 'MAQ-CORRIENTES-M2']],
      ['dirección sin importar tildes ni mayúsculas', { direccion: 'CORRIÉNTES 1234' }, ['MAQ-CORRIENTES-M1', 'MAQ-CORRIENTES-M2']],
      ['una parte de la dirección', { direccion: 'santa fe' }, ['MAQ-SANTAFE-M2', 'MAQ-SANTAFE-M1']],
      ['ECA (sin tildes)', { eca: 'PORTENA' }, ['MAQ-CORRIENTES-M1', 'MAQ-CORRIENTES-M2']],
      ['otra ECA', { eca: 'san martin' }, ['MAQ-CALLAO-M1']],
      ['inspector', { inspector: 'german' }, ['MAQ-CALLAO-M1']],
      ['inspector con varias visitas', { inspector: 'dev-ma-2' }, ['MAQ-SANTAFE-M2', 'MAQ-SANTAFE-M1', 'MAQ-CORRIENTES-M1', 'MAQ-CORRIENTES-M2']],
      ['estado Recorrida', { estado: 'Recorrida' }, ['MAQ-SANTAFE-M2', 'MAQ-SANTAFE-M1', 'MAQ-CORRIENTES-M1']],
      ['estado Advertencia', { estado: 'Advertencia' }, ['MAQ-CALLAO-M1']],
      ['estado Pendiente de Visita', { estado: 'Pendiente de Visita' }, ['MAQ-CORRIENTES-M2']],
    ])('filtra por %s', async (_n, q, esperados) => {
      expect(await ids(q)).toEqual(esperados);
    });

    it('los filtros se combinan con «y»', async () => {
      expect(await ids({ eca: 'maicon', estado: 'Recorrida' })).toEqual(['MAQ-SANTAFE-M2', 'MAQ-SANTAFE-M1']);
      expect(await ids({ direccion: 'corrientes', inspector: 'dev-ma-2', estado: 'Recorrida' })).toEqual(['MAQ-CORRIENTES-M1']);
      expect(await ids({ direccion: 'callao', eca: 'maicon' })).toEqual([]);
    });

    it('un filtro vacío o de espacios no filtra; sin coincidencias → lista vacía con total 0', async () => {
      expect(await ids({ direccion: '', eca: '   ' })).toEqual(ORDEN);
      expect(await service.monitoreo({ direccion: 'no existe' })).toMatchObject({ total: 0, totalPaginas: 1, items: [] });
    });

    it('pagina: 2 por página son 3 páginas (2, 2 y 1) y una página de más viene vacía con el total correcto', async () => {
      const p1 = await service.monitoreo({ porPagina: '2' });
      const p2 = await service.monitoreo({ porPagina: '2', pagina: '2' });
      const p3 = await service.monitoreo({ porPagina: '2', pagina: '3' });
      const p4 = await service.monitoreo({ porPagina: '2', pagina: '4' });

      expect([p1, p2, p3].map((p) => p.items.length)).toEqual([2, 2, 1]);
      expect([...p1.items, ...p2.items, ...p3.items].map((f) => f.maquinaId)).toEqual(ORDEN);
      expect(p1).toMatchObject({ total: 5, totalPaginas: 3, pagina: 1, porPagina: 2 });
      expect(p4).toMatchObject({ total: 5, totalPaginas: 3, pagina: 4, items: [] });
    });

    it('la paginación se aplica sobre el resultado filtrado', async () => {
      const p = await service.monitoreo({ estado: 'Recorrida', porPagina: '2', pagina: '2' });

      expect(p).toMatchObject({ total: 3, totalPaginas: 2 });
      expect(p.items.map((f) => f.maquinaId)).toEqual(['MAQ-CORRIENTES-M1']);
    });

    it.each([
      ['pagina 0', { pagina: '0' }],
      ['pagina negativa', { pagina: '-1' }],
      ['pagina que no es número', { pagina: 'abc' }],
      ['pagina decimal', { pagina: '1.5' }],
      ['porPagina 0', { porPagina: '0' }],
      ['porPagina mayor que 100', { porPagina: '101' }],
      ['estado que no existe', { estado: 'Aprobada' }],
      ['filtro que no es texto', { direccion: ['a', 'b'] }],
    ])('%s → 400', async (_n, q) => {
      await expect(service.monitoreo(q)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('porPagina 100 es válido', async () => {
      expect((await service.monitoreo({ porPagina: '100' })).porPagina).toBe(100);
    });
  });

  describe('criterio 2: registrar el envío del remito a la ECA', () => {
    it('registra quién, cuándo, a qué ECA y de qué visita, y la fila del monitoreo lo muestra', async () => {
      const antes = Date.now();
      const r = await service.enviarRemito({ maquinaId: 'MAQ-CALLAO-M1' }, 'sec1');

      expect(r).toMatchObject({ maquinaId: 'MAQ-CALLAO-M1', visitaId: 'VIS-2026-11-201', eca: 'Elevadores San Martín', direccion: 'Av. Callao 850, CABA', enviadoPor: 'sec1' });
      expect(Date.parse(r.enviadoEn)).toBeGreaterThanOrEqual(antes);
      const fila = (await service.monitoreo({ direccion: 'callao' })).items[0];
      expect(fila.remito).toEqual(r);
      expect((await service.monitoreo({})).items.filter((f) => f.remito).length).toBe(1);
    });

    it('la misma visita no se manda dos veces (409 con el envío anterior)', async () => {
      await service.enviarRemito({ maquinaId: 'MAQ-CALLAO-M1' }, 'sec1');

      await expect(service.enviarRemito({ maquinaId: 'MAQ-CALLAO-M1' }, 'sec2')).rejects.toThrow(/ya se mandó a Elevadores San Martín el .* \(sec1\)/);
      expect(remitos.remitos).toHaveLength(1);
    });

    it('un equipo «Pendiente de Visita» no tiene remito para mandar (409)', async () => {
      await expect(service.enviarRemito({ maquinaId: 'MAQ-CORRIENTES-M2' }, 'sec1')).rejects.toThrow(/todavía no tiene una visita hecha/);
      expect(remitos.remitos).toHaveLength(0);
    });

    it('si se indica la visita tiene que ser la vigente del equipo (409); la correcta se acepta', async () => {
      await expect(service.enviarRemito({ maquinaId: 'MAQ-CALLAO-M1', visitaId: 'VIS-OTRA' }, 'sec1')).rejects.toBeInstanceOf(ConflictException);

      await expect(service.enviarRemito({ maquinaId: 'MAQ-CALLAO-M1', visitaId: 'VIS-2026-11-201' }, 'sec1')).resolves.toBeDefined();
    });

    it.each([[{}], [{ maquinaId: '' }], [{ maquinaId: 5 }], [null], [{ maquinaId: 'MAQ-CALLAO-M1', visitaId: 7 }]])('un cuerpo inválido (%j) → 400', async (cuerpo) => {
      await expect(service.enviarRemito(cuerpo, 'sec1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un equipo que no existe → 404', async () => {
      await expect(service.enviarRemito({ maquinaId: 'NO-EXISTE' }, 'sec1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('se pueden mandar los remitos de distintas visitas', async () => {
      await service.enviarRemito({ maquinaId: 'MAQ-SANTAFE-M1' }, 'sec1');
      await service.enviarRemito({ maquinaId: 'MAQ-SANTAFE-M2' }, 'sec1');

      expect(remitos.remitos.map((r) => r.visitaId).sort()).toEqual(['VIS-2026-11-301', 'VIS-2026-11-302']);
    });
  });
});

describe('helpers del listado', () => {
  it('normalizar saca tildes y mayúsculas y recorta', () => {
    expect(normalizar('  CORRIÉNTES Ñandú ')).toBe('corrientes nandu');
  });
  it('paginar: total 0 da 1 página vacía; el resto se reparte', () => {
    expect(paginar([], 1, 10)).toEqual({ total: 0, pagina: 1, porPagina: 10, totalPaginas: 1, items: [] });
    const filas = Array.from({ length: 25 }, (_, i) => ({ id: String(i) })) as never[];
    expect(paginar(filas, 3, 10)).toMatchObject({ total: 25, totalPaginas: 3 });
    expect(paginar(filas, 3, 10).items).toHaveLength(5);
  });
});
