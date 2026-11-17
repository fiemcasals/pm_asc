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

  // Desde afuera se entra siempre por la web, que redirige /api: por eso la API escucha
  // sólo en loopback salvo que API_HOST diga otra cosa (en Docker, la red del contenedor).
  await app.listen(config.port, config.host);

  const logger = new Logger('Bootstrap');
  logger.log(`API escuchando en http://${config.host}:${config.port}/api (${config.nodeEnv})`);
  logger.log(
    config.corsOrigins.length > 0
      ? `CORS habilitado para: ${config.corsOrigins.join(', ')}`
      : 'CORS deshabilitado',
  );
  if (config.authSecretGenerado) {
    logger.warn(
      'AUTH_JWT_SECRET no está cargado: se generó uno al azar. Las sesiones no sobreviven a un reinicio de la API.',
    );
  }
}

void bootstrap();
