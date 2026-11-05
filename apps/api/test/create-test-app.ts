import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppConfig, loadConfig } from '../src/config';
import { DatabaseService } from '../src/database/database.service';

/** Base de datos simulada: responde como un PostgreSQL con PostGIS 3.4 o falla a pedido. */
export function fakeDatabase(opts: { fail?: boolean } = {}): Pick<DatabaseService, 'checkHealth'> {
  return {
    checkHealth: async () => {
      if (opts.fail) throw new Error('connection refused');
      return { postgis: '3.4.3' };
    },
  };
}

export async function createTestApp(
  env: NodeJS.ProcessEnv,
  database = fakeDatabase(),
): Promise<{ app: INestApplication; config: AppConfig }> {
  const config = loadConfig(env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(DatabaseService)
    .useValue(database)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, config);
  await app.init();
  return { app, config };
}
