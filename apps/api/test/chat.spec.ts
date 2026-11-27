import { BadRequestException } from '@nestjs/common';
import { ChatService } from '../src/chat/chat.service';
import { InMemoryChatRepository } from '../src/chat/chat.repository';
import { UsuarioAutenticado } from '../src/auth/auth.types';

describe('ChatService', () => {
  let service: ChatService;
  let repo: InMemoryChatRepository;

  const usuarioRt: UsuarioAutenticado = {
    id: 'user-rt-1',
    usuario: 'rt.ana',
    rol: 'rt_calle',
    eca: null,
  };

  const usuarioFirmante: UsuarioAutenticado = {
    id: 'user-firmante-1',
    usuario: 'firmante.carlos',
    rol: 'firmante',
    eca: null,
  };

  beforeEach(() => {
    repo = new InMemoryChatRepository();
    repo.setContactos([
      { id: 'user-rt-1', usuario: 'rt.ana', nombre: 'Ana Gómez', rol: 'rt_calle' },
      { id: 'user-firmante-1', usuario: 'firmante.carlos', nombre: 'Carlos Ruiz', rol: 'firmante' },
      { id: 'user-admin-1', usuario: 'admin', nombre: 'Administrador', rol: 'administrador' },
    ]);
    service = new ChatService(repo);
  });

  describe('obtenerCanales', () => {
    it('devuelve el canal global y los contactos directos excluyendo al propio usuario', async () => {
      const canales = await service.obtenerCanales(usuarioRt);
      expect(canales).toHaveLength(3); // Global + Firmante + Admin
      expect(canales[0].id).toBe('global');
      expect(canales[0].tipo).toBe('global');
      expect(canales.find((c) => c.id === 'user-firmante-1')).toBeDefined();
      expect(canales.find((c) => c.id === 'user-rt-1')).toBeUndefined();
    });
  });

  describe('enviarMensaje', () => {
    it('permite enviar un mensaje de texto a la sala global', async () => {
      const msg = await service.enviarMensaje(
        {
          tipoSala: 'global',
          contenido: 'Hola a todo el equipo de guardia',
        },
        usuarioRt,
      );

      expect(msg.id).toBeDefined();
      expect(msg.tipoSala).toBe('global');
      expect(msg.contenido).toBe('Hola a todo el equipo de guardia');
      expect(msg.emisorId).toBe(usuarioRt.id);
    });

    it('permite enviar un mensaje con foto adjunta y referencia a edificio', async () => {
      repo.setConsorcios(['consorcio-123']); // HU-19 RF-04: el edificio con el que se etiqueta tiene que existir
      const msg = await service.enviarMensaje(
        {
          tipoSala: 'global',
          contenido: 'Falla en polea principal detectada',
          adjuntoUrl: 'data:image/jpeg;base64,samplephoto123',
          consorcioId: 'consorcio-123',
          maquinaRef: 'M1',
        },
        usuarioRt,
      );

      expect(msg.adjuntoUrl).toBe('data:image/jpeg;base64,samplephoto123');
      expect(msg.maquinaRef).toBe('M1');
    });

    it('permite enviar un mensaje privado directo a otro usuario', async () => {
      const msg = await service.enviarMensaje(
        {
          tipoSala: 'directo',
          destinatarioId: 'user-firmante-1',
          contenido: 'Ingeniero, ¿puede revisar la prueba de paracaídas?',
        },
        usuarioRt,
      );

      expect(msg.tipoSala).toBe('directo');
      expect(msg.destinatarioId).toBe('user-firmante-1');
    });

    it('rechaza mensajes sin texto y sin imagen adjunta', async () => {
      await expect(
        service.enviarMensaje(
          {
            tipoSala: 'global',
            contenido: '   ',
          },
          usuarioRt,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza mensaje directo sin destinatario', async () => {
      await expect(
        service.enviarMensaje(
          {
            tipoSala: 'directo',
            contenido: 'Mensaje sin destino',
          },
          usuarioRt,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza enviarse un mensaje privado a sí mismo', async () => {
      await expect(
        service.enviarMensaje(
          {
            tipoSala: 'directo',
            destinatarioId: usuarioRt.id,
            contenido: 'Automensaje',
          },
          usuarioRt,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('obtenerMensajes', () => {
    it('separa los mensajes de la sala global de los chats privados', async () => {
      await service.enviarMensaje({ tipoSala: 'global', contenido: 'Mensaje global 1' }, usuarioRt);
      await service.enviarMensaje(
        { tipoSala: 'directo', destinatarioId: 'user-firmante-1', contenido: 'Mensaje privado a Carlos' },
        usuarioRt,
      );

      const globales = await service.obtenerMensajes('global', usuarioRt);
      expect(globales).toHaveLength(1);
      expect(globales[0].contenido).toBe('Mensaje global 1');

      const privados = await service.obtenerMensajes('user-firmante-1', usuarioRt);
      expect(privados).toHaveLength(1);
      expect(privados[0].contenido).toBe('Mensaje privado a Carlos');
    });
  });
});
