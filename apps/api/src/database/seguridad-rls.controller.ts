import { Controller, Get } from '@nestjs/common';
import { DatabaseService, RlsDiagnostico } from './database.service';

@Controller('seguridad')
export class SeguridadRlsController {
  constructor(private readonly database: DatabaseService) {}

  /** Devuelve diagnóstico en vivo de RLS: rol runtime, ausencia de BYPASSRLS y políticas activas. */
  @Get('rls')
  obtenerEstadoRls(): Promise<RlsDiagnostico> {
    return this.database.inspeccionarRls();
  }
}
