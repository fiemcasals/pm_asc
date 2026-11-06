import { DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from './config';
import { ConsorciosController } from './consorcios/consorcios.controller';
import { ConsorciosRepository } from './consorcios/consorcios.repository';
import { PgConsorciosRepository } from './consorcios/pg-consorcios.repository';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health/health.controller';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, ConsorciosController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        DatabaseService,
        { provide: ConsorciosRepository, useClass: PgConsorciosRepository },
      ],
    };
  }
}
