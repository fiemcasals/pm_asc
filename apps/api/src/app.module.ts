import { DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from './config';
import { ConsorciosController } from './consorcios/consorcios.controller';
import { ConsorciosRepository } from './consorcios/consorcios.repository';
import { PgConsorciosRepository } from './consorcios/pg-consorcios.repository';
import { DatabaseService } from './database/database.service';
import { EcaController } from './eca/eca.controller';
import { EcaService } from './eca/eca.service';
import { FirmanteController } from './firmante/firmante.controller';
import { FirmanteService } from './firmante/firmante.service';
import { HealthController } from './health/health.controller';
import { WhatsAppConnectorService } from './whatsapp/whatsapp-connector.service';
import { WhatsAppFormatterService } from './whatsapp/whatsapp-formatter.service';
import { WhatsAppController } from './whatsapp/whatsapp.controller';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        ConsorciosController,
        FirmanteController,
        EcaController,
        WhatsAppController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        DatabaseService,
        { provide: ConsorciosRepository, useClass: PgConsorciosRepository },
        FirmanteService,
        EcaService,
        WhatsAppFormatterService,
        WhatsAppConnectorService,
      ],
    };
  }
}
