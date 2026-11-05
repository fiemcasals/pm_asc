import { DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from './config';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health/health.controller';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }, DatabaseService],
    };
  }
}
