import { InMemoryChatRepository } from '../src/chat/chat.repository';
import { ChatService } from '../src/chat/chat.service';
import { UsuarioAutenticado } from '../src/auth/auth.types';

// HU-19 RF-10 — de qué conversaciones hay algo sin leer y cuál fue el último mensaje que le escribió otra persona: de ahí salen los avisos del navegador.
const ANA: UsuarioAutenticado = { id: '11111111-1111-4111-8111-111111111111', usuario: 'rt.ana', rol: 'rt_calle', eca: null };
const BETO: UsuarioAutenticado = { id: '22222222-2222-4222-8222-222222222222', usuario: 'rt.beto', rol: 'rt_calle', eca: null };
const CARLA: UsuarioAutenticado = { id: '33333333-3333-4333-8333-333333333333', usuario: 'rt.carla', rol: 'firmante', eca: null };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

describe('Resumen de lo no leído para avisar (HU-19 RF-10)', () => {
  let repo: InMemoryChatRepository;
  let service: ChatService;

  beforeEach(() => {
    repo = new InMemoryChatRepository();
    repo.setContactos([ANA, BETO, CARLA].map((u) => ({ id: u.id, usuario: u.usuario, nombre: u.usuario, rol: u.rol })));
    service = new ChatService(repo);
  });

  const alGrupo = (de: UsuarioAutenticado, contenido: string, adjuntoUrl?: string) => service.enviarMensaje({ tipoSala: 'global', contenido, adjuntoUrl: adjuntoUrl ?? null }, de);
  const aPrivado = (de: UsuarioAutenticado, para: UsuarioAutenticado, contenido: string, adjuntoUrl?: string) =>
    service.enviarMensaje({ tipoSala: 'directo', destinatarioId: para.id, contenido, adjuntoUrl: adjuntoUrl ?? null }, de);

  it('sin nada sin leer: total 0 y ninguna conversación', async () => {
    expect(await service.resumenNoLeidos(BETO)).toEqual({ total: 0, conversaciones: [] });
  });

  it('cada conversación con algo sin leer trae su cantidad y el ÚLTIMO mensaje que le escribió otra persona', async () => {
    await alGrupo(ANA, 'g1');
    const g2 = await alGrupo(CARLA, 'g2 de Carla');
    await aPrivado(ANA, BETO, 'p1');
    const p2 = await aPrivado(ANA, BETO, 'p2 de Ana');
    const r = await service.resumenNoLeidos(BETO);
    expect(r.total).toBe(4);
    expect(r.conversaciones.map((c) => c.sala)).toEqual(['global', ANA.id]);
    expect(r.conversaciones[0]).toMatchObject({ sala: 'global', noLeidos: 2, ultimoMensaje: { id: g2.id, contenido: 'g2 de Carla' } });
    expect(r.conversaciones[1]).toMatchObject({ sala: ANA.id, noLeidos: 2, ultimoMensaje: { id: p2.id, contenido: 'p2 de Ana' } });
  });

  it('el mensaje trae quién lo escribió, la hora y si tiene foto; y nunca la foto', async () => {
    const m = await aPrivado(ANA, BETO, '', PNG);
    const r = await service.resumenNoLeidos(BETO);
    const ultimo = r.conversaciones[0].ultimoMensaje;
    expect(ultimo).toEqual({ id: m.id, emisorNombre: m.emisorNombre, contenido: '📷 Foto adjunta', conFoto: true, creadoEn: m.creadoEn });
    expect(JSON.stringify(r)).not.toContain('base64');
    expect(Object.keys(ultimo).sort()).toEqual(['conFoto', 'contenido', 'creadoEn', 'emisorNombre', 'id']);
  });

  it('un mensaje sin foto dice conFoto: false', async () => {
    await aPrivado(ANA, BETO, 'solo texto');
    expect((await service.resumenNoLeidos(BETO)).conversaciones[0].ultimoMensaje.conFoto).toBe(false);
  });

  it('del texto largo viajan solo los primeros 200 caracteres', async () => {
    await aPrivado(ANA, BETO, 'a'.repeat(900));
    expect((await service.resumenNoLeidos(BETO)).conversaciones[0].ultimoMensaje.contenido).toHaveLength(200);
  });

  it('lo que uno mismo escribe nunca aparece: si lo último de la conversación es suyo, el último de otro es el anterior', async () => {
    await aPrivado(ANA, BETO, 'de Ana');
    await aPrivado(BETO, ANA, 'respuesta de Beto');
    const r = await service.resumenNoLeidos(BETO);
    expect(r.conversaciones[0].ultimoMensaje.contenido).toBe('de Ana');
    expect((await service.resumenNoLeidos(ANA)).conversaciones[0].ultimoMensaje.contenido).toBe('respuesta de Beto');
    expect(JSON.stringify(await service.resumenNoLeidos(BETO))).not.toContain('respuesta de Beto');
  });

  it('una conversación leída deja de aparecer', async () => {
    const m = await aPrivado(ANA, BETO, 'p1');
    await alGrupo(CARLA, 'g1');
    await service.marcarLeido(BETO, ANA.id, m.id);
    const r = await service.resumenNoLeidos(BETO);
    expect(r.conversaciones.map((c) => c.sala)).toEqual(['global']);
    expect(r.total).toBe(1);
  });

  it('un mensaje nuevo después de leer vuelve a aparecer, con su propio id', async () => {
    const m1 = await aPrivado(ANA, BETO, 'p1');
    await service.marcarLeido(BETO, ANA.id, m1.id);
    const m2 = await aPrivado(ANA, BETO, 'p2');
    const r = await service.resumenNoLeidos(BETO);
    expect(r.conversaciones[0].ultimoMensaje.id).toBe(m2.id);
    expect(r.conversaciones[0].noLeidos).toBe(1);
  });

  it('privacidad: un tercero no recibe nada de los privados de otros', async () => {
    await aPrivado(ANA, BETO, 'secreto');
    await aPrivado(BETO, ANA, 'otro secreto');
    expect(await service.resumenNoLeidos(CARLA)).toEqual({ total: 0, conversaciones: [] });
  });

  it('quien ya no es contacto no aparece (como en el total)', async () => {
    await aPrivado(ANA, BETO, 'p1');
    await alGrupo(CARLA, 'g1');
    repo.setContactos([BETO, CARLA].map((u) => ({ id: u.id, usuario: u.usuario, nombre: u.usuario, rol: u.rol })));
    const r = await service.resumenNoLeidos(BETO);
    expect(r.conversaciones.map((c) => c.sala)).toEqual(['global']);
    expect(r.total).toBe(1);
  });

  it('el total del resumen es el mismo que el de contarNoLeidosTotal', async () => {
    await alGrupo(ANA, 'g1');
    await aPrivado(ANA, BETO, 'p1');
    await aPrivado(CARLA, BETO, 'p2');
    expect((await service.resumenNoLeidos(BETO)).total).toBe(await service.contarNoLeidosTotal(BETO));
  });

  it('si el repositorio no encuentra el mensaje (por ejemplo, se borró entre una consulta y otra), esa conversación no se incluye y el total se mantiene', async () => {
    await aPrivado(ANA, BETO, 'p1');
    repo.ultimoDeOtros = async () => null;
    const r = await service.resumenNoLeidos(BETO);
    expect(r.conversaciones).toEqual([]);
    expect(r.total).toBe(1);
  });

  it('el repositorio devuelve null si no hay nada de otros en esa conversación', async () => {
    expect(await repo.ultimoDeOtros(BETO.id, 'global')).toBeNull();
    await alGrupo(BETO, 'mío');
    expect(await repo.ultimoDeOtros(BETO.id, 'global')).toBeNull();
    expect(await repo.ultimoDeOtros(BETO.id, ANA.id)).toBeNull();
  });
});
