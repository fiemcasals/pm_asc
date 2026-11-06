import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadConfig } from './config';
import { loadEnvFileInto } from './env-file';

// En desarrollo las variables viven en el .env de la raíz del repo.
loadEnvFileInto(process.env);

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.register(config));
  configureApp(app, config);

  // Sólo escucha en la máquina local; desde afuera se entra por la web (proxy /api).
  await app.listen(config.port, '127.0.0.1');

  const logger = new Logger('Bootstrap');
  logger.log(`API escuchando en http://127.0.0.1:${config.port}/api (${config.nodeEnv})`);
  logger.log(
    config.corsOrigins.length > 0
      ? `CORS habilitado para: ${config.corsOrigins.join(', ')}`
      : 'CORS deshabilitado',
  );
}

void bootstrap();
