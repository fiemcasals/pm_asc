import { InMemoryChatRepository, ROLES_DEL_CHAT } from '../src/chat/chat.repository';
import { ChatService } from '../src/chat/chat.service';
import { UsuarioAutenticado } from '../src/auth/auth.types';

// HU-19 RF-03 — la Secretaría figura como contacto del chat y sus privados se leen y se responden.
const rt: UsuarioAutenticado = { id: 'u-rt', usuario: 'rt.ana', rol: 'rt_calle', eca: null };
const secretaria: UsuarioAutenticado = { id: 'u-sec', usuario: 'secretaria.laura', rol: 'secretaria', eca: null };
const firmante: UsuarioAutenticado = { id: 'u-fir', usuario: 'firmante.carlos', rol: 'firmante', eca: null };

describe('Contactos del chat con la Secretaría (HU-19 RF-03)', () => {
  let repo: InMemoryChatRepository;
  let service: ChatService;

  beforeEach(() => {
    repo = new InMemoryChatRepository();
    repo.setContactos([
      { id: rt.id, usuario: rt.usuario, nombre: 'Ana Gómez', rol: 'rt_calle' },
      { id: secretaria.id, usuario: secretaria.usuario, nombre: 'Laura Pérez', rol: 'secretaria' },
      { id: firmante.id, usuario: firmante.usuario, nombre: 'Carlos Ruiz', rol: 'firmante' },
      { id: 'u-adm', usuario: 'admin', nombre: 'Administrador', rol: 'administrador' },
    ]);
    service = new ChatService(repo);
  });

  it('criterio 1: la lista de un Técnico RT incluye a la Secretaría como contacto directo, con su rol', async () => {
    const canales = await service.obtenerCanales(rt);
    const sec = canales.find((c) => c.id === secretaria.id);
    expect(sec).toBeDefined();
    expect(sec).toMatchObject({ tipo: 'directo', rol: 'secretaria', nombre: 'Laura Pérez' });
  });

  it('criterio 1: Firmante y Administrador también la tienen, y la Secretaría no se ve a sí misma', async () => {
    expect((await service.obtenerCanales(firmante)).some((c) => c.id === secretaria.id)).toBe(true);
    const admin: UsuarioAutenticado = { id: 'u-adm', usuario: 'admin', rol: 'administrador', eca: null };
    expect((await service.obtenerCanales(admin)).some((c) => c.id === secretaria.id)).toBe(true);
    const suyos = await service.obtenerCanales(secretaria);
    expect(suyos.some((c) => c.id === secretaria.id)).toBe(false);
    // …pero sí ve a los otros tres roles.
    expect(suyos.filter((c) => c.tipo === 'directo').map((c) => c.rol).sort()).toEqual(['administrador', 'firmante', 'rt_calle']);
  });

  it('criterio 2: lo que un RT le escribe a la Secretaría lo ve ella al abrir el chat con ese RT', async () => {
    await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: secretaria.id, contenido: 'Secretaría, falta el acuse de Corrientes 1234' }, rt);
    const vistos = await service.obtenerMensajes(rt.id, secretaria);
    expect(vistos.map((m) => m.contenido)).toEqual(['Secretaría, falta el acuse de Corrientes 1234']);
    const canalDeRtParaSecretaria = (await service.obtenerCanales(secretaria)).find((c) => c.id === rt.id);
    expect(canalDeRtParaSecretaria?.ultimoMensaje).toBe('Secretaría, falta el acuse de Corrientes 1234');
  });

  it('criterio 3: lo que la Secretaría le escribe a un RT aparece en el chat del RT con ella, y la respuesta vuelve', async () => {
    await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: rt.id, contenido: 'Ana, pasá por Cabildo 1540' }, secretaria);
    const delLadoDelRt = (await service.obtenerCanales(rt)).find((c) => c.id === secretaria.id);
    expect(delLadoDelRt?.ultimoMensaje).toBe('Ana, pasá por Cabildo 1540');
    expect((await service.obtenerMensajes(secretaria.id, rt)).map((m) => m.contenido)).toEqual(['Ana, pasá por Cabildo 1540']);

    await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: secretaria.id, contenido: 'Voy ahora' }, rt);
    expect((await service.obtenerMensajes(rt.id, secretaria)).map((m) => m.contenido)).toEqual(['Ana, pasá por Cabildo 1540', 'Voy ahora']);
  });

  it('criterio 4: el Firmante no ve el privado entre el RT y la Secretaría, ni abriendo su chat con cualquiera de los dos', async () => {
    await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: secretaria.id, contenido: 'privado entre RT y Secretaría' }, rt);
    expect(await service.obtenerMensajes(rt.id, firmante)).toEqual([]);
    expect(await service.obtenerMensajes(secretaria.id, firmante)).toEqual([]);
    expect(await service.obtenerMensajes('global', firmante)).toEqual([]);
    const canalesFirmante = await service.obtenerCanales(firmante);
    expect(canalesFirmante.every((c) => !c.ultimoMensaje)).toBe(true);
  });
});

describe('Quién usa el chat y quién puede ser contacto es lo mismo (HU-19 RF-03, criterio 5)', () => {
  it('los roles del chat son Técnico RT, Firmante, Administrador y Secretaría; la ECA queda afuera', () => {
    expect([...ROLES_DEL_CHAT].sort()).toEqual(['administrador', 'firmante', 'rt_calle', 'secretaria']);
    expect(ROLES_DEL_CHAT).not.toContain('eca');
  });

  it('los contactos de ejemplo del repositorio en memoria incluyen a la Secretaría y a ningún rol fuera del chat', async () => {
    const repo = new InMemoryChatRepository();
    const contactos = await repo.listarContactos('nadie');
    expect(contactos.some((c) => c.rol === 'secretaria')).toBe(true);
    expect(contactos.every((c) => ROLES_DEL_CHAT.includes(c.rol))).toBe(true);
  });
});
