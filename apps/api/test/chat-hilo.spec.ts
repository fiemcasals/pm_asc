import { BadRequestException } from '@nestjs/common';
import { InMemoryChatRepository } from '../src/chat/chat.repository';
import { ChatService } from '../src/chat/chat.service';
import { LIMITE_HILO } from '../src/chat/chat.types';
import { UsuarioAutenticado } from '../src/auth/auth.types';

// HU-19 RF-02 — el hilo muestra siempre los mensajes más nuevos y deja pedir los anteriores.
const ana: UsuarioAutenticado = { id: 'u-ana', usuario: 'rt.ana', rol: 'rt_calle', eca: null };
const beto: UsuarioAutenticado = { id: 'u-beto', usuario: 'rt.beto', rol: 'rt_calle', eca: null };
const carla: UsuarioAutenticado = { id: 'u-carla', usuario: 'rt.carla', rol: 'rt_calle', eca: null };
const UUID_QUE_NO_EXISTE = '00000000-0000-4000-8000-000000000000';

describe('Hilo del chat: los más nuevos, y los anteriores a pedido (HU-19 RF-02)', () => {
  let repo: InMemoryChatRepository;
  let service: ChatService;

  beforeEach(() => {
    repo = new InMemoryChatRepository();
    service = new ChatService(repo);
  });

  const escribirGrupo = async (n: number, desde = 1) => {
    for (let i = desde; i < desde + n; i++) await service.enviarMensaje({ tipoSala: 'global', contenido: `msg ${i}` }, ana);
  };
  const textos = (lista: { contenido: string }[]) => lista.map((m) => m.contenido);
  const numeros = (lista: { contenido: string }[]) => lista.map((m) => Number(m.contenido.replace('msg ', '')));

  it('criterio 1: con más de 200 mensajes el grupo muestra los 200 más nuevos, de más viejo a más nuevo', async () => {
    await escribirGrupo(250);
    const hilo = await service.obtenerMensajes('global', beto);
    expect(hilo).toHaveLength(LIMITE_HILO);
    expect(numeros(hilo)[0]).toBe(51);
    expect(numeros(hilo)[hilo.length - 1]).toBe(250);
    expect(numeros(hilo)).toEqual([...numeros(hilo)].sort((a, b) => a - b));
  });

  it('criterio 1: un mensaje recién enviado aparece en el hilo de todos aunque ya haya más de 200', async () => {
    await escribirGrupo(210);
    await service.enviarMensaje({ tipoSala: 'global', contenido: 'el más nuevo' }, ana);
    for (const quien of [ana, beto, carla]) {
      const hilo = await service.obtenerMensajes('global', quien);
      expect(hilo[hilo.length - 1].contenido).toBe('el más nuevo');
      expect(hilo).toHaveLength(LIMITE_HILO);
    }
  });

  it('criterio 1: lo mismo en un chat privado', async () => {
    for (let i = 1; i <= 230; i++) await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: beto.id, contenido: `msg ${i}` }, ana);
    await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: ana.id, contenido: 'respuesta' }, beto);
    const delLadoDeAna = await service.obtenerMensajes(beto.id, ana);
    const delLadoDeBeto = await service.obtenerMensajes(ana.id, beto);
    expect(delLadoDeAna).toHaveLength(LIMITE_HILO);
    expect(textos(delLadoDeAna)).toEqual(textos(delLadoDeBeto));
    expect(delLadoDeAna[delLadoDeAna.length - 1].contenido).toBe('respuesta');
    expect(numeros(delLadoDeAna.slice(0, -1))[0]).toBe(32);
    // un tercero no ve nada de esa conversación
    expect(await service.obtenerMensajes(ana.id, carla)).toEqual([]);
  });

  it('criterio 2: el último mensaje del hilo es el que la lista de chats muestra como último', async () => {
    await escribirGrupo(230);
    const hilo = await service.obtenerMensajes('global', beto);
    const canales = await service.obtenerCanales(beto);
    expect(canales[0].ultimoMensaje).toBe(hilo[hilo.length - 1].contenido);
    expect(canales[0].ultimoMensaje).toBe('msg 230');
  });

  describe('criterio 3: pedir los anteriores', () => {
    it('hayAnteriores es verdadero recién cuando hay más de 200 (con exactamente 200 es falso)', async () => {
      await escribirGrupo(200);
      expect((await service.obtenerHilo('global', beto)).hayAnteriores).toBe(false);
      await escribirGrupo(1, 201);
      expect((await service.obtenerHilo('global', beto)).hayAnteriores).toBe(true);
    });

    it('con el id del más viejo que se ve, trae los 200 anteriores y vuelve a avisar si quedan más', async () => {
      await escribirGrupo(450);
      const primera = await service.obtenerHilo('global', beto);
      expect(numeros(primera.mensajes)[0]).toBe(251);
      expect(primera.hayAnteriores).toBe(true);

      const segunda = await service.obtenerHilo('global', beto, { antes: primera.mensajes[0].id });
      expect(segunda.mensajes).toHaveLength(LIMITE_HILO);
      expect(numeros(segunda.mensajes)).toEqual(Array.from({ length: 200 }, (_, i) => 51 + i));
      expect(segunda.hayAnteriores).toBe(true);

      const tercera = await service.obtenerHilo('global', beto, { antes: segunda.mensajes[0].id });
      expect(numeros(tercera.mensajes)).toEqual(Array.from({ length: 50 }, (_, i) => 1 + i));
      expect(tercera.hayAnteriores).toBe(false);
    });

    it('lo anterior se pide dentro de la misma conversación: en un privado no aparecen mensajes del grupo ni de otros privados', async () => {
      await escribirGrupo(5);
      for (let i = 1; i <= 3; i++) await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: beto.id, contenido: `priv ${i}` }, ana);
      await service.enviarMensaje({ tipoSala: 'directo', destinatarioId: carla.id, contenido: 'otro privado' }, ana);
      const pagina = await service.obtenerHilo(beto.id, ana);
      expect(textos(pagina.mensajes)).toEqual(['priv 1', 'priv 2', 'priv 3']);
      const antes = await service.obtenerHilo(beto.id, ana, { antes: pagina.mensajes[2].id });
      expect(textos(antes.mensajes)).toEqual(['priv 1', 'priv 2']);
      expect(antes.hayAnteriores).toBe(false);
    });

    it('un mensaje que no existe como punto de partida da una página vacía y sin anteriores', async () => {
      await escribirGrupo(3);
      expect(await service.obtenerHilo('global', beto, { antes: UUID_QUE_NO_EXISTE })).toEqual({ mensajes: [], hayAnteriores: false });
    });

    it('«limite» trae solo los últimos N', async () => {
      await escribirGrupo(30);
      const pagina = await service.obtenerHilo('global', beto, { limite: 10 });
      expect(numeros(pagina.mensajes)).toEqual(Array.from({ length: 10 }, (_, i) => 21 + i));
      expect(pagina.hayAnteriores).toBe(true);
    });
  });

  describe('lo que no es válido se rechaza con 400', () => {
    it.each(['abc', '123', 'no-es-un-id', "' OR 1=1 --"])('«antes» que no es un identificador (%s)', async (antes) => {
      await expect(service.obtenerHilo('global', beto, { antes })).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([0, -5, 201, 1.5, Number.NaN])('«limite» fuera de 1 a 200 (%s)', async (limite) => {
      await expect(service.obtenerHilo('global', beto, { limite })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el tope es el que usa el hilo: pedir exactamente 200 es válido', async () => {
      await expect(service.obtenerHilo('global', beto, { limite: LIMITE_HILO })).resolves.toEqual({ mensajes: [], hayAnteriores: false });
    });
  });
});
