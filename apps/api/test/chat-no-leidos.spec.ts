import { BadRequestException } from '@nestjs/common';
import { InMemoryChatRepository } from '../src/chat/chat.repository';
import { ChatService } from '../src/chat/chat.service';
import { validarLectura } from '../src/chat/chat.validacion';
import { UsuarioAutenticado } from '../src/auth/auth.types';

// HU-19 RF-09 — el chat marca lo que no leíste: contador por conversación y en total, lo leído se guarda por usuario, y nadie cuenta lo ajeno.
const ANA: UsuarioAutenticado = { id: '11111111-1111-4111-8111-111111111111', usuario: 'rt.ana', rol: 'rt_calle', eca: null };
const BETO: UsuarioAutenticado = { id: '22222222-2222-4222-8222-222222222222', usuario: 'rt.beto', rol: 'rt_calle', eca: null };
const CARLA: UsuarioAutenticado = { id: '33333333-3333-4333-8333-333333333333', usuario: 'rt.carla', rol: 'firmante', eca: null };
const DORA: UsuarioAutenticado = { id: '44444444-4444-4444-8444-444444444444', usuario: 'sec.dora', rol: 'secretaria', eca: null };

describe('No leídos del chat (HU-19 RF-09)', () => {
  let repo: InMemoryChatRepository;
  let service: ChatService;

  beforeEach(() => {
    repo = new InMemoryChatRepository();
    repo.setContactos([ANA, BETO, CARLA, DORA].map((u) => ({ id: u.id, usuario: u.usuario, nombre: u.usuario, rol: u.rol })));
    service = new ChatService(repo);
  });

  const alGrupo = (de: UsuarioAutenticado, texto: string) => service.enviarMensaje({ tipoSala: 'global', contenido: texto }, de);
  const aPrivado = (de: UsuarioAutenticado, para: UsuarioAutenticado, texto: string) => service.enviarMensaje({ tipoSala: 'directo', destinatarioId: para.id, contenido: texto }, de);
  const noLeidosDe = async (quien: UsuarioAutenticado) => Object.fromEntries((await service.obtenerCanales(quien)).map((c) => [c.id, c.noLeidos]));

  describe('criterio 1: contador por conversación', () => {
    it('cada conversación de la lista trae sus mensajes sin leer: los del grupo y los que le escribió cada compañero', async () => {
      await alGrupo(ANA, 'g1');
      await alGrupo(ANA, 'g2');
      await alGrupo(CARLA, 'g3');
      await aPrivado(ANA, BETO, 'p1');
      await aPrivado(ANA, BETO, 'p2');
      await aPrivado(CARLA, BETO, 'p3');
      const beto = await noLeidosDe(BETO);
      expect(beto.global).toBe(3);
      expect(beto[ANA.id]).toBe(2);
      expect(beto[CARLA.id]).toBe(1);
      expect(beto[DORA.id]).toBe(0);
    });

    it('sin mensajes, todos los contadores son 0 (no faltan ni son nulos)', async () => {
      const canales = await service.obtenerCanales(BETO);
      expect(canales.length).toBe(4);
      expect(canales.every((c) => c.noLeidos === 0)).toBe(true);
    });

    it('la lista sigue empezando por el grupo general', async () => {
      await aPrivado(ANA, BETO, 'hola');
      expect((await service.obtenerCanales(BETO))[0].id).toBe('global');
    });

    it('un mensaje nuevo suma uno al contador', async () => {
      await aPrivado(ANA, BETO, 'a');
      expect((await noLeidosDe(BETO))[ANA.id]).toBe(1);
      await aPrivado(ANA, BETO, 'b');
      expect((await noLeidosDe(BETO))[ANA.id]).toBe(2);
    });
  });

  describe('criterio 2: el total', () => {
    it('suma el grupo y los privados', async () => {
      await alGrupo(ANA, 'g1');
      await aPrivado(ANA, BETO, 'p1');
      await aPrivado(CARLA, BETO, 'p2');
      expect(await service.contarNoLeidosTotal(BETO)).toBe(3);
    });

    it('lo que escribió alguien que ya no es contacto no cuenta en el total (no se podría abrir para leerlo)', async () => {
      await aPrivado(ANA, BETO, 'p1');
      await alGrupo(ANA, 'g1');
      repo.setContactos([BETO, CARLA, DORA].map((u) => ({ id: u.id, usuario: u.usuario, nombre: u.usuario, rol: u.rol })));
      expect(await service.contarNoLeidosTotal(BETO)).toBe(1);
    });
  });

  describe('criterio 3: al ver una conversación su contador vuelve a cero, y lo propio no cuenta', () => {
    it('los mensajes que uno mismo envía nunca cuentan como no leídos', async () => {
      await alGrupo(BETO, 'mío 1');
      await aPrivado(BETO, ANA, 'mío 2');
      expect(await service.contarNoLeidosTotal(BETO)).toBe(0);
      expect(Object.values(await noLeidosDe(BETO)).every((n) => n === 0)).toBe(true);
    });

    it('marcar leído hasta el último mensaje deja el contador en cero y devuelve lo que queda y el total', async () => {
      await aPrivado(ANA, BETO, 'p1');
      const ultimo = await aPrivado(ANA, BETO, 'p2');
      await alGrupo(CARLA, 'g1');
      const r = await service.marcarLeido(BETO, ANA.id, ultimo.id);
      expect(r).toEqual({ sala: ANA.id, noLeidos: 0, total: 1 });
      expect((await noLeidosDe(BETO))[ANA.id]).toBe(0);
      expect((await noLeidosDe(BETO)).global).toBe(1);
    });

    it('un mensaje que llega después de marcar vuelve a contar', async () => {
      const m = await aPrivado(ANA, BETO, 'p1');
      await service.marcarLeido(BETO, ANA.id, m.id);
      await aPrivado(ANA, BETO, 'p2');
      expect((await noLeidosDe(BETO))[ANA.id]).toBe(1);
    });

    it('marcar leído hasta un mensaje intermedio deja sin leer los posteriores', async () => {
      const m1 = await alGrupo(ANA, 'g1');
      await alGrupo(ANA, 'g2');
      await alGrupo(ANA, 'g3');
      expect((await service.marcarLeido(BETO, 'global', m1.id)).noLeidos).toBe(2);
    });

    it('la lectura solo avanza: marcar un mensaje más viejo no vuelve a dejar sin leer los que ya se leyeron', async () => {
      const m1 = await alGrupo(ANA, 'g1');
      await alGrupo(ANA, 'g2');
      const m3 = await alGrupo(ANA, 'g3');
      await service.marcarLeido(BETO, 'global', m3.id);
      const r = await service.marcarLeido(BETO, 'global', m1.id);
      expect(r.noLeidos).toBe(0);
    });

    it('leer una conversación no toca las demás', async () => {
      const g = await alGrupo(ANA, 'g1');
      await aPrivado(ANA, BETO, 'p1');
      await service.marcarLeido(BETO, 'global', g.id);
      expect(await noLeidosDe(BETO)).toMatchObject({ global: 0, [ANA.id]: 1 });
    });

    it('lo que lee uno no lo lee otro: cada usuario tiene su propio punto de lectura', async () => {
      const g = await alGrupo(ANA, 'g1');
      await service.marcarLeido(BETO, 'global', g.id);
      expect((await noLeidosDe(BETO)).global).toBe(0);
      expect((await noLeidosDe(CARLA)).global).toBe(1);
    });

    it('los identificadores de la conversación y del mensaje pueden venir en mayúsculas', async () => {
      const m = await aPrivado(ANA, BETO, 'p1');
      const r = await service.marcarLeido(BETO, ANA.id.toUpperCase(), m.id.toUpperCase());
      expect(r).toMatchObject({ sala: ANA.id, noLeidos: 0 });
    });
  });

  describe('lo que se rechaza', () => {
    it('marcar leído un mensaje que no es de esa conversación responde 400', async () => {
      const delGrupo = await alGrupo(ANA, 'g1');
      const privado = await aPrivado(ANA, BETO, 'p1');
      await expect(service.marcarLeido(BETO, ANA.id, delGrupo.id)).rejects.toThrow(/no pertenece a esa conversaci/);
      await expect(service.marcarLeido(BETO, 'global', privado.id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.marcarLeido(BETO, CARLA.id, privado.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un mensaje que no existe responde 400', async () => {
      await expect(service.marcarLeido(BETO, 'global', '00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no hay conversación privada con uno mismo', async () => {
      const m = await aPrivado(ANA, BETO, 'p1');
      await expect(service.marcarLeido(BETO, BETO.id, m.id)).rejects.toThrow(/con uno mismo/);
    });
  });

  describe('criterio 5: nadie cuenta ni lee lo ajeno', () => {
    it('un tercero no tiene contadores por los privados de otros, ni suma al total', async () => {
      await aPrivado(ANA, BETO, 'secreto 1');
      await aPrivado(BETO, ANA, 'secreto 2');
      const carla = await noLeidosDe(CARLA);
      expect(Object.values(carla).every((n) => n === 0)).toBe(true);
      expect(await service.contarNoLeidosTotal(CARLA)).toBe(0);
    });

    it('la que escribe un privado no lo tiene como no leído, y el destinatario sí solo en la conversación con ella', async () => {
      await aPrivado(ANA, BETO, 'p1');
      expect(await noLeidosDe(ANA)).toMatchObject({ [BETO.id]: 0 });
      expect(await noLeidosDe(BETO)).toMatchObject({ [ANA.id]: 1, [CARLA.id]: 0, [DORA.id]: 0 });
    });

    it('un tercero no puede marcar leído un mensaje de un privado ajeno', async () => {
      const m = await aPrivado(ANA, BETO, 'secreto');
      await expect(service.marcarLeido(CARLA, ANA.id, m.id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.marcarLeido(CARLA, BETO.id, m.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el repositorio solo cuenta los privados dirigidos al usuario', async () => {
      await aPrivado(ANA, BETO, 'p1');
      expect(await repo.contarNoLeidos(CARLA.id)).toEqual({});
      expect(await repo.contarNoLeidos(ANA.id)).toEqual({});
      expect(await repo.contarNoLeidos(BETO.id)).toEqual({ [ANA.id]: 1 });
    });
  });
});

describe('validarLectura', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  it('acepta el grupo o un compañero con el mensaje leído', () => {
    expect(validarLectura({ sala: 'global', hasta: ID })).toEqual({ sala: 'global', hasta: ID });
    expect(validarLectura({ sala: ID, hasta: ID })).toEqual({ sala: ID, hasta: ID });
  });
  it.each([null, undefined, [], 'texto', 5])('un cuerpo que no es un objeto (%p) se rechaza', (c) => {
    expect(() => validarLectura(c)).toThrow(/tiene que ser un objeto/);
  });
  it.each([undefined, null, ''])('sin conversación (%p) se rechaza (no se toma por el grupo)', (sala) => {
    expect(() => validarLectura({ sala, hasta: ID })).toThrow(/Falta indicar la conversaci/);
  });
  it.each(['abc', 'GLOBAL', 5, {}, ["global"]])('una conversación inválida (%p) se rechaza', (sala) => {
    expect(() => validarLectura({ sala, hasta: ID })).toThrow(/conversaci[oó]n pedida no es v[aá]lida/);
  });
  it.each([undefined, null, '', 'abc', 5, {}, [ID]])('un mensaje leído inválido (%p) se rechaza', (hasta) => {
    expect(() => validarLectura({ sala: 'global', hasta })).toThrow(/mensaje le[ií]do no es un identificador/);
  });
});
