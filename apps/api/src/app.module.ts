import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController, ConsentimientoController, UsuariosController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { RELOJ, relojDelSistema } from './auth/auth.types';
import { Mailer } from './auth/mailer';
import { PgUsuariosRepository } from './auth/pg-usuarios.repository';
import { RolesGuard } from './auth/roles.guard';
import { UsuariosRepository } from './auth/usuarios.repository';
import { APP_CONFIG, AppConfig } from './config';
import { ChecklistController } from './checklist/checklist.controller';
import { ChecklistService } from './checklist/checklist.service';
import { ConsorciosController } from './consorcios/consorcios.controller';
import { ConsorciosRepository } from './consorcios/consorcios.repository';
import { ImportadorAgcService } from './consorcios/importador-agc.service';
import { PgConsorciosRepository } from './consorcios/pg-consorcios.repository';
import { DatabaseService } from './database/database.service';
import { EcaContextMiddleware } from './database/eca-context.middleware';
import { RlsContextInterceptor } from './database/rls-context.interceptor';
import { SeguridadRlsController } from './database/seguridad-rls.controller';
import { EcaController } from './eca/eca.controller';
import { EcaService } from './eca/eca.service';
import { RemitoPdfService } from './eca/remito-pdf.service';
import { FallasCriticasController } from './fallas-criticas/fallas-criticas.controller';
import { FallasCriticasService } from './fallas-criticas/fallas-criticas.service';
import { FirmanteController } from './firmante/firmante.controller';
import { FirmanteService } from './firmante/firmante.service';
import { HealthController } from './health/health.controller';
import { PgSemaforoRepository } from './semaforo/pg-semaforo.repository';
import { SemaforoController } from './semaforo/semaforo.controller';
import { SemaforoRepository } from './semaforo/semaforo.repository';
import { SemaforoService } from './semaforo/semaforo.service';
import { AvisosController } from './avisos/avisos.controller';
import { AvisosService } from './avisos/avisos.service';
import { InformeAvisoController } from './avisos/informe-aviso.controller';
import { PdfLegalFallaService } from './avisos/pdf-legal-falla.service';
import { WhatsAppConnectorService } from './whatsapp/whatsapp-connector.service';
import { WhatsAppWebhookController } from './whatsapp/whatsapp-webhook.controller';
import { WhatsAppWebhookService } from './whatsapp/whatsapp-webhook.service';
import { WhatsAppFormatterService } from './whatsapp/whatsapp-formatter.service';
import { WhatsAppTriggerService } from './whatsapp/whatsapp-trigger.service';
import { WhatsAppController } from './whatsapp/whatsapp.controller';
import { RecorridoController, VisitasFallidasController } from './visitas-fallidas/visitas-fallidas.controller';
import { VisitasFallidasRepository } from './visitas-fallidas/visitas-fallidas.repository';
import { PgVisitasFallidasRepository } from './visitas-fallidas/pg-visitas-fallidas.repository';
import { ParadasController } from './paradas/paradas.controller';
import { ParadasService } from './paradas/paradas.service';
import { InformesController } from './informes/informes.controller';
import { InformesRepository, PgInformesRepository } from './informes/informes.repository';
import { InformesService } from './informes/informes.service';
import { BackofficeController } from './backoffice/backoffice.controller';
import { BackofficeService } from './backoffice/backoffice.service';
import { PgRemitosRepository, RemitosRepository } from './backoffice/remitos.repository';
import { PgReclamosRepository, ReclamosRepository } from './backoffice/reclamos.repository';
import { IniciosController } from './inicios-inspeccion/inicios.controller';
import { IniciosRepository, } from './inicios-inspeccion/inicios.repository';
import { PgIniciosRepository } from './inicios-inspeccion/inicios.repository';
import { IniciosService } from './inicios-inspeccion/inicios.service';
import { RtMapaController } from './rt-mapa/rt-mapa.controller';
import { PgRtMapaRepository, RtMapaRepository } from './rt-mapa/rt-mapa.repository';
import { RtMapaService } from './rt-mapa/rt-mapa.service';
import { HorariosController } from './horarios/horarios.controller';
import { HorariosRepository } from './horarios/horarios.repository';
import { PgHorariosRepository } from './horarios/pg-horarios.repository';
import { HorariosService } from './horarios/horarios.service';
import { PagosController } from './pagos/pagos.controller';
import { PagosRepository } from './pagos/pagos.repository';
import { PgPagosRepository } from './pagos/pg-pagos.repository';
import { PagosService } from './pagos/pagos.service';
import { VisitasFallidasService } from './visitas-fallidas/visitas-fallidas.service';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(EcaContextMiddleware)
      .forRoutes(
        ConsorciosController,
        VisitasFallidasController,
        RecorridoController,
        EcaController,
        FirmanteController,
        FallasCriticasController,
        SeguridadRlsController,
        SemaforoController,
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
        WhatsAppWebhookController,
        AvisosController,
        InformeAvisoController,
        VisitasFallidasController,
        RecorridoController,
        ParadasController,
        PagosController,
        HorariosController,
        RtMapaController,
        IniciosController,
        BackofficeController,
        InformesController,
        FallasCriticasController,
        SeguridadRlsController,
        SemaforoController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        DatabaseService,
        { provide: RELOJ, useValue: relojDelSistema },
        { provide: UsuariosRepository, useClass: PgUsuariosRepository },
        Mailer,
        AuthService,
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor },
        { provide: ConsorciosRepository, useClass: PgConsorciosRepository },
        ImportadorAgcService,
        { provide: VisitasFallidasRepository, useClass: PgVisitasFallidasRepository },
        FirmanteService,
        ChecklistService,
        EcaService,
        RemitoPdfService,
        WhatsAppFormatterService,
        WhatsAppConnectorService,
        WhatsAppTriggerService,
        WhatsAppWebhookService,
        PdfLegalFallaService,
        AvisosService,
        VisitasFallidasService,
        ParadasService,
        { provide: PagosRepository, useClass: PgPagosRepository },
        PagosService,
        { provide: HorariosRepository, useClass: PgHorariosRepository },
        HorariosService,
        { provide: RtMapaRepository, useClass: PgRtMapaRepository },
        RtMapaService,
        { provide: IniciosRepository, useClass: PgIniciosRepository },
        IniciosService,
        { provide: RemitosRepository, useClass: PgRemitosRepository },
        { provide: ReclamosRepository, useClass: PgReclamosRepository },
        BackofficeService,
        { provide: InformesRepository, useClass: PgInformesRepository },
        InformesService,
        FallasCriticasService,
        { provide: SemaforoRepository, useClass: PgSemaforoRepository },
        SemaforoService,
      ],
    };
  }
}
