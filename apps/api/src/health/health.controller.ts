import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service';

export interface HealthResponse {
  status: 'ok' | 'error';
  api: 'ok';
  db: {
    status: 'ok' | 'error';
    postgis: string | null;
    error?: string;
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    try {
      const { postgis } = await this.database.checkHealth();
      return { status: 'ok', api: 'ok', db: { status: 'ok', postgis } };
    } catch {
      // La API responde, pero sin base de datos el sistema no está operativo: 503.
      res.status(503);
      return {
        status: 'error',
        api: 'ok',
        db: { status: 'error', postgis: null, error: 'No se pudo conectar a la base de datos' },
      };
    }
  }
}
