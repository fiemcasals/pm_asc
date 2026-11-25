import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRepository, PgChatRepository } from './chat.repository';

@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    {
      provide: ChatRepository,
      useClass: PgChatRepository,
    },
  ],
  exports: [ChatService, ChatRepository],
})
export class ChatModule {}
