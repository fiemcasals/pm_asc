import { NotFoundException } from '@nestjs/common';
import { UsuarioAutenticado } from '../src/auth/auth.types';
import { FirmanteService } from '../src/firmante/firmante.service';
import { ParadasService } from '../src/paradas/paradas.service';

// HU-17 RF-12: la lista de reportes de parada no lleva imágenes; la foto se pide aparte, con permiso.
const MAQUINA = 'MAQ-CORRIENTES-M1'; // ECA «Conservación Porteña S.R.L.», Firmante «gonza»
const ECA_DE_LA_MAQUINA = 'Conservación Porteña S.R.L.';
const BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const FOTO = `data:image/jpeg;base64,${BYTES.toString('base64')}`;

const usuario = (rol: UsuarioAutenticado['rol'], nombre: string, eca: string | null = null): UsuarioAutenticado => ({ id: `id-${nombre}`, usuario: nombre, rol, eca });

describe('Reportes de parada sin imágenes y con la foto aparte (HU-17 RF-12)', () => {
  let firmante: FirmanteService;
  let service: ParadasService;
  beforeEach(() => {
    firmante = new FirmanteService();
    service = new ParadasService(firmante);
  });
  const registrar = (foto: string = FOTO, maquinaId = MAQUINA, por = 'rt1') => service.registrar({ maquinaId, causa: 'Cabina trabada', fotos: [foto, FOTO] }, por);

  describe('criterio 1: la lista trae la cantidad de fotos y ninguna imagen', () => {
    it('cada reporte tiene `fotos` (cuántas) y `fotoRuta`, y no tiene `fotoUrl`', async () => {
      const r = await registrar();

      const [fila] = service.listar();

      expect(fila).toMatchObject({ id: r.id, fotos: 2, fotoRuta: `/api/paradas/${r.id}/foto` });
      expect('fotoUrl' in fila).toBe(false);
    });

    it('ni en la lista ni en el reporte hay una imagen (base64 o data URL)', async () => {
      await registrar();

      const lista = JSON.stringify(service.listar());

      expect(lista).not.toContain('base64');
      expect(lista).not.toContain('data:image');
    });

    it('la respuesta de guardar el reporte tampoco repite la imagen que el RT acaba de mandar', async () => {
      const r = await registrar();

      expect(JSON.stringify(r)).not.toContain('base64');
      expect(r.fotoRuta).toBe(`/api/paradas/${r.id}/foto`);
    });

    it('la respuesta de confirmar o de rechazar un reporte tampoco lleva la imagen', async () => {
      const a = await registrar();
      const confirmado = await service.resolver(a.id, 'confirmar', { usuario: 'gonza', rol: 'firmante' });
      expect(JSON.stringify(confirmado)).not.toContain('base64');
      expect(confirmado.fotoRuta).toBe(`/api/paradas/${a.id}/foto`);

      const b = await registrar(FOTO, 'MAQ-SANTAFE-M1');
      const rechazado = await service.resolver(b.id, 'rechazar', { usuario: 'gonza', rol: 'firmante' }, 'No era una falla');
      expect(JSON.stringify(rechazado)).not.toContain('base64');
    });

    it('reenviar el mismo reporte desde el celular (mismo clientReportId) devuelve el que ya estaba, también sin imagen', async () => {
      const cuerpo = { maquinaId: MAQUINA, causa: 'Cabina trabada', fotos: [FOTO], clientReportId: 'cli-12345678' };
      const primero = await service.registrar(cuerpo, 'rt1');

      const reintento = await service.registrar(cuerpo, 'rt1');

      expect(reintento.id).toBe(primero.id);
      expect(JSON.stringify(reintento)).not.toContain('base64');
    });

    it('el reporte se guarda con su imagen: lo que sale por la API es una vista, no lo guardado', async () => {
      await registrar();

      // La imagen no se perdió: sigue guardada y se sirve por obtenerFoto.
      const foto = service.obtenerFoto(service.listar()[0].id, usuario('secretaria', 's1'));
      expect(foto.datos.equals(BYTES)).toBe(true);
    });

    it('una dirección web en lugar de una imagen no se puede servir: fotoRuta es null y sigue sin imagen en la lista', async () => {
      const r = await registrar('https://fotos.example/cabina.jpg');

      expect(r.fotoRuta).toBeNull();
      expect(JSON.stringify(service.listar())).not.toContain('https://fotos.example');
      expect(() => service.obtenerFoto(r.id, usuario('secretaria', 's1'))).toThrow(NotFoundException);
    });
  });

  describe('criterio 2: la foto se sirve aparte, a quien puede ver el reporte', () => {
    it('devuelve los bytes de la foto y su tipo', async () => {
      const r = await registrar();

      const foto = service.obtenerFoto(r.id, usuario('secretaria', 's1'));

      expect(foto.tipo).toBe('image/jpeg');
      expect(foto.datos.equals(BYTES)).toBe(true);
    });

    it.each([
      ['png', 'image/png'],
      ['webp', 'image/webp'],
    ])('también sirve una imagen %s', async (ext, tipo) => {
      const r = await registrar(`data:image/${ext};base64,${BYTES.toString('base64')}`);

      expect(service.obtenerFoto(r.id, usuario('administrador', 'a1')).tipo).toBe(tipo);
    });

    it('la Secretaría y el Administrador ven la de cualquier reporte', async () => {
      const r = await registrar();

      for (const u of [usuario('secretaria', 's1'), usuario('administrador', 'a1')]) {
        expect(service.obtenerFoto(r.id, u).datos.equals(BYTES)).toBe(true);
      }
    });

    it('el Firmante de ese edificio la ve; otro Firmante, no (404)', async () => {
      const r = await registrar();

      expect(service.obtenerFoto(r.id, usuario('firmante', 'gonza')).datos.equals(BYTES)).toBe(true);
      expect(service.obtenerFoto(r.id, usuario('firmante', 'GONZA')).datos.equals(BYTES)).toBe(true);
      expect(() => service.obtenerFoto(r.id, usuario('firmante', 'otro.firmante'))).toThrow(NotFoundException);
    });

    it('la ECA del equipo la ve; otra ECA, una ECA con un nombre parecido o un usuario ECA sin empresa, no (404)', async () => {
      const r = await registrar();

      expect(service.obtenerFoto(r.id, usuario('eca', 'eca1', ECA_DE_LA_MAQUINA)).datos.equals(BYTES)).toBe(true);
      for (const eca of ['Elevadores San Martín', 'Conservación', 'CONSERVACIÓN PORTEÑA S.R.L.', '', null]) {
        expect(() => service.obtenerFoto(r.id, usuario('eca', 'eca2', eca))).toThrow(NotFoundException);
      }
    });

    it('el RT de Calle que lo cargó la ve; otro RT, no (404)', async () => {
      const r = await registrar(FOTO, MAQUINA, 'rt1');

      expect(service.obtenerFoto(r.id, usuario('rt_calle', 'rt1')).datos.equals(BYTES)).toBe(true);
      expect(() => service.obtenerFoto(r.id, usuario('rt_calle', 'rt2'))).toThrow(NotFoundException);
    });

    it('un reporte que no existe da 404, igual que uno que no se puede ver: no se revela cuál es cuál', async () => {
      const r = await registrar();

      const mensaje = (trabajo: () => unknown): string => {
        try {
          trabajo();
        } catch (e) {
          expect(e).toBeInstanceOf(NotFoundException);
          return (e as NotFoundException).message;
        }
        throw new Error('tenía que dar 404');
      };

      const sinPermiso = mensaje(() => service.obtenerFoto(r.id, usuario('rt_calle', 'rt2')));
      const inexistente = mensaje(() => service.obtenerFoto('PAR-no-existe', usuario('secretaria', 's1')));

      expect(sinPermiso).toBe(inexistente);
      expect(sinPermiso).toBe('No hay una foto para ese reporte.');
    });
  });

  describe('la alerta de la máquina', () => {
    it('lleva la ruta de la foto, y conserva la imagen para el remito, el aviso y el backoffice', async () => {
      const r = await registrar();

      const alerta = firmante.getMaquinas().find((m) => m.id === MAQUINA)!.alertaCritica!;

      expect(alerta.fotoRuta).toBe(`/api/paradas/${r.id}/foto`);
      expect(alerta.fotografiaCabinaTrabada).toBe(FOTO);
    });

    it('después de un reinicio (se cargan los reportes guardados), la alerta vuelve a llevar la ruta', async () => {
      const guardados: unknown[] = [];
      const repo = {
        leer: async () => structuredClone(guardados) as never,
        guardar: async (r: unknown) => void guardados.push(structuredClone(r)),
      };
      const a = new ParadasService(firmante, repo as never);
      const r = await a.registrar({ maquinaId: MAQUINA, causa: 'x', fotos: [FOTO] }, 'rt1');
      const otroFirmante = new FirmanteService();
      const b = new ParadasService(otroFirmante, repo as never);

      await b.onApplicationBootstrap();

      expect(otroFirmante.getMaquinas().find((m) => m.id === MAQUINA)!.alertaCritica!.fotoRuta).toBe(`/api/paradas/${r.id}/foto`);
      expect(JSON.stringify(b.listar())).not.toContain('base64');
    });
  });
});
