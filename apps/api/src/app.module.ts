import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController, ConsentimientoController, UsuariosController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { RELOJ, relojDelSistema } from './auth/auth.types';
import { PgUsuariosRepository } from './auth/pg-usuarios.repository';
import { RolesGuard } from './auth/roles.guard';
import { UsuariosRepository } from './auth/usuarios.repository';
import { APP_CONFIG, AppConfig } from './config';
import { ChecklistController } from './checklist/checklist.controller';
import { ChecklistService } from './checklist/checklist.service';
import { ConsorciosController } from './consorcios/consorcios.controller';
import { ConsorciosRepository } from './consorcios/consorcios.repository';
import { PgConsorciosRepository } from './consorcios/pg-consorcios.repository';
import { DatabaseService } from './database/database.service';
import { EcaContextMiddleware } from './database/eca-context.middleware';
import { RlsContextInterceptor } from './database/rls-context.interceptor';
import { SeguridadRlsController } from './database/seguridad-rls.controller';
import { EcaController } from './eca/eca.controller';
import { EcaService } from './eca/eca.service';
import { FallasCriticasController } from './fallas-criticas/fallas-criticas.controller';
import { FallasCriticasService } from './fallas-criticas/fallas-criticas.service';
import { FirmanteController } from './firmante/firmante.controller';
import { FirmanteService } from './firmante/firmante.service';
import { HealthController } from './health/health.controller';
import { WhatsAppConnectorService } from './whatsapp/whatsapp-connector.service';
import { WhatsAppFormatterService } from './whatsapp/whatsapp-formatter.service';
import { WhatsAppTriggerService } from './whatsapp/whatsapp-trigger.service';
import { WhatsAppController } from './whatsapp/whatsapp.controller';
import { VisitasFallidasController } from './visitas-fallidas/visitas-fallidas.controller';
import { VisitasFallidasRepository } from './visitas-fallidas/visitas-fallidas.repository';
import { PgVisitasFallidasRepository } from './visitas-fallidas/pg-visitas-fallidas.repository';
import { VisitasFallidasService } from './visitas-fallidas/visitas-fallidas.service';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(EcaContextMiddleware)
      .forRoutes(
        ConsorciosController,
        VisitasFallidasController,
        EcaController,
        FirmanteController,
        FallasCriticasController,
        SeguridadRlsController,
        HealthController,
      );
  }

  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        UsuariosController,
        ConsentimientoController,
        ConsorciosController,
        ChecklistController,
        FirmanteController,
        EcaController,
        WhatsAppController,
        VisitasFallidasController,
        FallasCriticasController,
        SeguridadRlsController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        DatabaseService,
        { provide: RELOJ, useValue: relojDelSistema },
        { provide: UsuariosRepository, useClass: PgUsuariosRepository },
        AuthService,
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor },
        { provide: ConsorciosRepository, useClass: PgConsorciosRepository },
        { provide: VisitasFallidasRepository, useClass: PgVisitasFallidasRepository },
        FirmanteService,
        ChecklistService,
        EcaService,
        WhatsAppFormatterService,
        WhatsAppConnectorService,
        WhatsAppTriggerService,
        VisitasFallidasService,
        FallasCriticasService,
      ],
    };
  }
}
