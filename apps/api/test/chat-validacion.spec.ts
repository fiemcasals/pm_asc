import { BadRequestException } from '@nestjs/common';
import { InMemoryChatRepository } from '../src/chat/chat.repository';
import { ChatService } from '../src/chat/chat.service';
import { LIMITE_CONTENIDO, LIMITE_MAQUINA } from '../src/chat/chat.types';
import { esUuid, validarMensaje, validarSala } from '../src/chat/chat.validacion';
import { UsuarioAutenticado } from '../src/auth/auth.types';

// HU-19 RF-04 — la API del chat rechaza con un mensaje claro lo que no corresponde.
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_CON_LETRAS = 'ABCDEF12-3456-4789-8ABC-DEF012345678';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

const rechaza = (fn: () => unknown, fragmento: RegExp | string) => {
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(BadRequestException);
  const mensaje = String((error as BadRequestException).message);
  expect(mensaje).toMatch(typeof fragmento === 'string' ? new RegExp(fragmento, 'i') : fragmento);
};

describe('esUuid', () => {
  it.each([UUID_A, UUID_CON_LETRAS, UUID_CON_LETRAS.toLowerCase(), '00000000-0000-4000-8000-000000000000'])('acepta %s (mayúsculas o minúsculas)', (v) => expect(esUuid(v)).toBe(true));
  it.each(['', 'abc', 'global', '1111111-1111-4111-8111-111111111111', `${UUID_A}x`, ` ${UUID_A}`, 123, null, undefined, {}, []])('rechaza %p', (v) => expect(esUuid(v)).toBe(false));
});

describe('validarSala (criterio 6)', () => {
  it.each([[undefined], [null], ['']])('sin conversación pedida (%p) es el grupo general', (s) => expect(validarSala(s)).toBe('global'));
  it('acepta «global» y el identificador de un compañero', () => {
    expect(validarSala('global')).toBe('global');
    expect(validarSala(UUID_A)).toBe(UUID_A);
    expect(validarSala(UUID_CON_LETRAS)).toBe(UUID_CON_LETRAS);
  });
  it.each(['abc', 'GLOBAL', 'global ', "' OR 1=1 --", '../global', '123', 5, {}, ['global', 'global'], [UUID_A]])('rechaza %p con 400 y un mensaje claro', (s) => {
    rechaza(() => validarSala(s), /conversaci[oó]n pedida no es v[aá]lida/);
  });
});

describe('validarMensaje', () => {
  describe('el cuerpo y el tipo de sala (criterio 2)', () => {
    it.each([null, undefined, [], 'texto', 5, true])('un cuerpo que no es un objeto (%p) se rechaza', (cuerpo) => {
      rechaza(() => validarMensaje(cuerpo), /tiene que ser un objeto/);
    });
    it.each(['xyz', 'GLOBAL', 'Directo', '', null, undefined, 5, {}, ['global']])('un tipo de sala «%p» se rechaza', (tipoSala) => {
      rechaza(() => validarMensaje({ tipoSala, contenido: 'hola' }), /tipo de sala tiene que ser/);
    });
    it('sin tipo de sala se rechaza', () => rechaza(() => validarMensaje({ contenido: 'hola' }), /tipo de sala/));
    it('«global» y «directo» se aceptan', () => {
      expect(validarMensaje({ tipoSala: 'global', contenido: 'hola' }).tipoSala).toBe('global');
      expect(validarMensaje({ tipoSala: 'directo', destinatarioId: UUID_A, contenido: 'hola' }).tipoSala).toBe('directo');
    });
  });

  describe('el destinatario (criterio 1)', () => {
    it.each(['no-es-uuid', '123', "' OR 1=1 --", 5, {}, [UUID_A], 'x'.repeat(40)])('un destinatario «%p» que no es un identificador se rechaza', (destinatarioId) => {
      rechaza(() => validarMensaje({ tipoSala: 'directo', destinatarioId, contenido: 'hola' }), /destinatario no es un identificador/);
    });
    it('un identificador se acepta y pasa tal cual', () => {
      expect(validarMensaje({ tipoSala: 'directo', destinatarioId: UUID_A, contenido: 'hola' }).destinatarioId).toBe(UUID_A);
    });
    it('sin destinatario en un privado pasa: lo rechaza el servicio con su propio mensaje', () => {
      expect(validarMensaje({ tipoSala: 'directo', contenido: 'hola' }).destinatarioId).toBeNull();
    });
    it('en el grupo general el destinatario se ignora (aunque venga basura)', () => {
      expect(validarMensaje({ tipoSala: 'global', destinatarioId: 'basura', contenido: 'hola' }).destinatarioId).toBeNull();
    });
  });

  describe('el contenido (criterio 4)', () => {
    it.each([123, true, {}, [], ['hola'], { a: 1 }])('un contenido que no es texto (%p) se rechaza', (contenido) => {
      rechaza(() => validarMensaje({ tipoSala: 'global', contenido }), /contenido del mensaje tiene que ser texto/);
    });
    it(`exactamente ${LIMITE_CONTENIDO} caracteres se acepta y uno más se rechaza`, () => {
      expect(validarMensaje({ tipoSala: 'global', contenido: 'a'.repeat(LIMITE_CONTENIDO) }).contenido).toHaveLength(LIMITE_CONTENIDO);
      rechaza(() => validarMensaje({ tipoSala: 'global', contenido: 'a'.repeat(LIMITE_CONTENIDO + 1) }), new RegExp(`no puede superar los ${LIMITE_CONTENIDO} caracteres`));
    });
    it('el largo se mide sin los espacios de los costados', () => {
      expect(() => validarMensaje({ tipoSala: 'global', contenido: `  ${'a'.repeat(LIMITE_CONTENIDO)}   ` })).not.toThrow();
      rechaza(() => validarMensaje({ tipoSala: 'global', contenido: `  ${'a'.repeat(LIMITE_CONTENIDO)}b   ` }), /no puede superar/);
    });
    it('un mensaje enorme (100.000 caracteres) se rechaza', () => {
      rechaza(() => validarMensaje({ tipoSala: 'global', contenido: 'a'.repeat(100_000) }), /no puede superar/);
    });
    it.each([undefined, null, ''])('sin texto (%p) pasa: puede ser una foto sola, y lo exige el servicio', (contenido) => {
      expect(validarMensaje({ tipoSala: 'global', contenido, adjuntoUrl: PNG }).contenido).toBe('');
    });
  });

  describe('el adjunto (criterio 5)', () => {
    it.each([PNG, 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', 'data:image/webp;base64,UklGRhoAAABXRUJQ', 'data:image/png;base64,AAAA', 'data:image/jpeg;base64,AA=='])('una imagen PNG, JPEG o WEBP en base64 se acepta (%s)', (adjuntoUrl) => {
      expect(validarMensaje({ tipoSala: 'global', contenido: 'foto', adjuntoUrl }).adjuntoUrl).toBe(adjuntoUrl);
    });
    it.each([
      'javascript:alert(1)',
      'http://example.com/pixel.png',
      'https://example.com/foto.jpg',
      '//example.com/foto.jpg',
      'data:text/html;base64,PGgxPmhvbGE8L2gxPg==',
      'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
      'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      'data:application/pdf;base64,JVBERi0=',
      'data:image/png;base64,',
      'data:image/png;base64,@@@@',
      'data:image/png,AAAA',
      'data:image/png;base64,AAAA\nAAAA',
      'data:image/png;charset=utf-8;base64,AAAA',
      'DATA:IMAGE/PNG;base64,AAAA',
      'file:///etc/passwd',
      'AAAA',
      ' data:image/png;base64,AAAA',
      'data:image/png;base64,AAAA ',
      123,
      true,
      {},
      [],
      [PNG],
    ])('un adjunto que no es una imagen en base64 (%p) se rechaza', (adjuntoUrl) => {
      rechaza(() => validarMensaje({ tipoSala: 'global', contenido: 'x', adjuntoUrl }), /adjunto tiene que ser una imagen PNG, JPEG o WEBP/);
    });
    it.each([undefined, null, ''])('sin adjunto (%p) pasa', (adjuntoUrl) => {
      expect(validarMensaje({ tipoSala: 'global', contenido: 'hola', adjuntoUrl }).adjuntoUrl).toBeNull();
    });
    // HU-19 RF-05: el tope de la foto es 600 KB ya decodificada (la pantalla la reduce antes de enviarla)
    it('una foto de hasta 600 KB se valida sin problema', () => {
      const justa = `data:image/jpeg;base64,${'A'.repeat((600 * 1024 * 4) / 3)}`;
      expect(validarMensaje({ tipoSala: 'global', contenido: 'foto', adjuntoUrl: justa }).adjuntoUrl).toBe(justa);
    });

    it('una foto de más de 600 KB (8 MB sin reducir) se rechaza con el motivo', () => {
      const grande = `data:image/jpeg;base64,${'A'.repeat(8 * 1024 * 1024)}`;
      expect(() => validarMensaje({ tipoSala: 'global', contenido: 'foto', adjuntoUrl: grande })).toThrow(/demasiado pesada: puede pesar hasta 600 KB/);
    });
  });

  describe('el edificio (criterio 3)', () => {
    it.each(['abc', '123', 'consorcio-123', "' OR 1=1 --", 5, {}, [UUID_A], UUID_A.slice(1)])('un edificio «%p» que no es un identificador se rechaza', (consorcioId) => {
      rechaza(() => validarMensaje({ tipoSala: 'global', contenido: 'x', consorcioId }), /edificio elegido no es v[aá]lido/);
    });
    it('un identificador se acepta', () => expect(validarMensaje({ tipoSala: 'global', contenido: 'x', consorcioId: UUID_A }).consorcioId).toBe(UUID_A));
    it.each([undefined, null, ''])('sin edificio (%p) pasa', (consorcioId) => expect(validarMensaje({ tipoSala: 'global', contenido: 'x', consorcioId }).consorcioId).toBeNull());
  });

  describe('la referencia de la máquina', () => {
    it(`hasta ${LIMITE_MAQUINA} caracteres se acepta y uno más se rechaza`, () => {
      expect(validarMensaje({ tipoSala: 'global', contenido: 'x', maquinaRef: 'M'.repeat(LIMITE_MAQUINA) }).maquinaRef).toHaveLength(LIMITE_MAQUINA);
      rechaza(() => validarMensaje({ tipoSala: 'global', contenido: 'x', maquinaRef: 'M'.repeat(LIMITE_MAQUINA + 1) }), new RegExp(`hasta ${LIMITE_MAQUINA} caracteres`));
    });
    it.each([5, true, {}, ['M1']])('una referencia que no es texto (%p) se rechaza', (maquinaRef) => {
      rechaza(() => validarMensaje({ tipoSala: 'global', contenido: 'x', maquinaRef }), /referencia de la m[aá]quina/);
    });
    it.each([undefined, null, ''])('sin referencia (%p) pasa', (maquinaRef) => expect(validarMensaje({ tipoSala: 'global', contenido: 'x', maquinaRef }).maquinaRef).toBeNull());
  });

  it('un mensaje completo y válido sale con todos sus campos', () => {
    expect(validarMensaje({ tipoSala: 'directo', destinatarioId: UUID_A, contenido: 'hola', adjuntoUrl: PNG, consorcioId: UUID_B, maquinaRef: 'M1', otraCosa: 'se ignora' })).toEqual({
      tipoSala: 'directo',
      destinatarioId: UUID_A,
      contenido: 'hola',
      adjuntoUrl: PNG,
      consorcioId: UUID_B,
      maquinaRef: 'M1',
    });
  });
});

describe('Reglas del servicio que dependen de los datos (HU-19 RF-04)', () => {
  const rt: UsuarioAutenticado = { id: UUID_A, usuario: 'rt.ana', rol: 'rt_calle', eca: null };
  let repo: InMemoryChatRepository;
  let service: ChatService;

  beforeEach(() => {
    repo = new InMemoryChatRepository();
    repo.setContactos([
      { id: UUID_A, usuario: 'rt.ana', nombre: 'Ana', rol: 'rt_calle' },
      { id: UUID_B, usuario: 'firmante', nombre: 'Firmante', rol: 'firmante' },
    ]);
    service = new ChatService(repo);
  });

  it('criterio 1: un privado a alguien que no es contacto (no existe, está inactivo o es de otro rol) se rechaza con 400 y no se guarda', async () => {
    const desconocido = '33333333-3333-4333-8333-333333333333';
    await expect(service.enviarMensaje({ tipoSala: 'directo', destinatarioId: desconocido, contenido: 'hola' }, rt)).rejects.toThrow(/no existe o no es un contacto del chat/);
    await expect(service.enviarMensaje({ tipoSala: 'directo', destinatarioId: desconocido, contenido: 'hola' }, rt)).rejects.toBeInstanceOf(BadRequestException);
    expect((await repo.listarMensajes(desconocido, rt.id)).mensajes).toEqual([]);
  });

  it('un privado a un contacto se guarda', async () => {
    const msg = await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: UUID_B, contenido: 'hola' }, rt);
    expect(msg.destinatarioId).toBe(UUID_B);
  });

  it('un privado a sí mismo sigue rechazándose con su mensaje', async () => {
    await expect(service.enviarMensaje({ tipoSala: 'directo', destinatarioId: UUID_A, contenido: 'hola' }, rt)).rejects.toThrow(/ti mismo/);
  });

  it('criterio 3: un edificio que no existe se rechaza con 400 y no se guarda; uno que existe se acepta', async () => {
    await expect(service.enviarMensaje({ tipoSala: 'global', contenido: 'x', consorcioId: UUID_B }, rt)).rejects.toThrow(/edificio elegido no existe/);
    expect((await repo.listarMensajes('global', rt.id)).mensajes).toEqual([]);
    repo.setConsorcios([UUID_B]);
    const msg = await service.enviarMensaje({ tipoSala: 'global', contenido: 'x', consorcioId: UUID_B }, rt);
    expect(msg.consorcioId).toBe(UUID_B);
  });

  it('criterio 3: el edificio también se controla en un privado', async () => {
    await expect(service.enviarMensaje({ tipoSala: 'directo', destinatarioId: UUID_B, contenido: 'x', consorcioId: UUID_B }, rt)).rejects.toThrow(/edificio elegido no existe/);
    expect((await repo.listarMensajes(UUID_B, rt.id)).mensajes).toEqual([]);
    repo.setConsorcios([UUID_B]);
    await expect(service.enviarMensaje({ tipoSala: 'directo', destinatarioId: UUID_B, contenido: 'x', consorcioId: UUID_B }, rt)).resolves.toBeDefined();
  });

  it('el repositorio no toma a nadie como contacto de sí mismo ni a quien no está en la lista', async () => {
    expect(await repo.esContacto(UUID_A, UUID_A)).toBe(false);
    expect(await repo.esContacto(UUID_A, UUID_B)).toBe(true);
    expect(await repo.esContacto(UUID_A, '33333333-3333-4333-8333-333333333333')).toBe(false);
  });

  it('sin edificio no se consulta nada: un mensaje común se guarda', async () => {
    await expect(service.enviarMensaje({ tipoSala: 'global', contenido: 'hola' }, rt)).resolves.toBeDefined();
  });
});
