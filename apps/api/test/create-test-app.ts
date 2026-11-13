import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { Reloj, RELOJ, relojDelSistema } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository, UsuariosRepository } from '../src/auth/usuarios.repository';
import { configureApp } from '../src/app.setup';
import { AppConfig, loadConfig } from '../src/config';
import { Consorcio, ConsorcioInput, ConsorcioMapaItem, ConsorcioResumen } from '../src/consorcios/consorcio.types';
import { ConsorciosRepository } from '../src/consorcios/consorcios.repository';
import { PORCENTAJES_OPERATIVOS, RolesEdificio, RolesInput } from '../src/consorcios/roles.types';
import { DatabaseService } from '../src/database/database.service';
import { SemaforoRepository } from '../src/semaforo/semaforo.repository';
import { EdificioBase, FechaCalendario } from '../src/semaforo/semaforo.types';
import {
  InMemoryVisitasFallidasRepository,
  VisitasFallidasRepository,
} from '../src/visitas-fallidas/visitas-fallidas.repository';

export interface FakeDatabase extends Pick<DatabaseService, 'checkHealth' | 'query'> {
  /** Consultas recibidas por query(), en orden. */
  consultas: { texto: string; params: unknown[] }[];
  /** Si tiene valor, cada query() falla con este error. Se puede cambiar o quitar en medio de una prueba. */
  errorDeQuery: Error | null;
}

/**
 * Base de datos simulada: responde como un PostgreSQL con PostGIS 3.4 o falla a pedido.
 * - `fail`: checkHealth() falla (la base "no responde").
 * - `errorDeQuery`: query() falla con ese error. Sin él, query() registra la consulta y devuelve [].
 */
export function fakeDatabase(opts: { fail?: boolean; errorDeQuery?: Error } = {}): FakeDatabase {
  const fake: FakeDatabase = {
    consultas: [],
    errorDeQuery: opts.errorDeQuery ?? null,
    checkHealth: async () => {
      if (opts.fail) throw new Error('connection refused');
      return { postgis: '3.4.3' };
    },
    query: (async (texto: string, params: unknown[] = []) => {
      fake.consultas.push({ texto, params });
      if (fake.errorDeQuery) throw fake.errorDeQuery;
      return [];
    }) as FakeDatabase['query'],
  };
  return fake;
}

/** Consorcios en memoria: la misma interfaz que PostgreSQL, para las pruebas aisladas. */
export class InMemoryConsorciosRepository extends ConsorciosRepository {
  readonly filas = new Map<string, Consorcio>();
  readonly roles = new Map<string, RolesEdificio>();

  private armar(id: string, datos: ConsorcioInput, createdAt: string): Consorcio {
    return {
      id,
      nombre: datos.nombre,
      direccion: datos.direccion,
      administracion: { ...datos.administracion },
      encargado: { ...datos.encargado },
      pisos: [...datos.pisos],
      ubicacion: datos.ubicacion ? { ...datos.ubicacion } : null,
      maquinas: datos.maquinas.map((m) => ({ id: randomUUID(), ...m })),
      createdAt,
      updatedAt: new Date().toISOString(),
    };
  }

  async crear(datos: ConsorcioInput): Promise<Consorcio> {
    const ficha = this.armar(randomUUID(), datos, new Date().toISOString());
    this.filas.set(ficha.id, ficha);
    return structuredClone(ficha);
  }

  async listar(): Promise<ConsorcioResumen[]> {
    return [...this.filas.values()].map((c) => ({
      id: c.id,
      nombre: c.nombre,
      direccion: c.direccion,
      cantidadMaquinas: c.maquinas.length,
    }));
  }

  async listarParaMapa(): Promise<ConsorcioMapaItem[]> {
    return [...this.filas.values()]
      .filter((c) => c.ubicacion !== null)
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        direccion: c.direccion,
        ubicacion: structuredClone(c.ubicacion!),
        cantidadMaquinas: c.maquinas.length,
      }));
  }

  async obtener(id: string): Promise<Consorcio | null> {
    const ficha = this.filas.get(id);
    return ficha ? structuredClone(ficha) : null;
  }

  async reemplazar(id: string, datos: ConsorcioInput): Promise<Consorcio | null> {
    const actual = this.filas.get(id);
    if (!actual) return null;
    const ficha = this.armar(id, datos, actual.createdAt);
    this.filas.set(id, ficha);
    return structuredClone(ficha);
  }

  async eliminar(id: string): Promise<boolean> {
    this.roles.delete(id);
    return this.filas.delete(id);
  }

  async obtenerRoles(id: string): Promise<RolesEdificio | null> {
    if (!this.filas.has(id)) return null;
    const roles = this.roles.get(id);
    return roles
      ? structuredClone(roles)
      : { consorcioId: id, rtCalle: null, firmante: null, eca: null, actualizadoEn: null };
  }

  async asignarRoles(id: string, datos: RolesInput): Promise<RolesEdificio | null> {
    if (!this.filas.has(id)) return null;
    const roles: RolesEdificio = {
      consorcioId: id,
      rtCalle: { ...datos.rtCalle, porcentaje: PORCENTAJES_OPERATIVOS.rtCalle },
      firmante: { ...datos.firmante, porcentaje: PORCENTAJES_OPERATIVOS.firmante },
      eca: { ...datos.eca, porcentaje: PORCENTAJES_OPERATIVOS.eca },
      actualizadoEn: new Date().toISOString(),
    };
    this.roles.set(id, roles);
    return structuredClone(roles);
  }

  async quitarRoles(id: string): Promise<boolean> {
    return this.roles.delete(id);
  }
}

/** Semáforo en memoria: devuelve los edificios que se le carguen y anota las fechas que le consultaron. */
export class InMemorySemaforoRepository extends SemaforoRepository {
  edificios: EdificioBase[] = [];
  readonly fechasConsultadas: FechaCalendario[] = [];

  async leerEdificios(fecha: FechaCalendario): Promise<EdificioBase[]> {
    this.fechasConsultadas.push(fecha);
    return structuredClone(this.edificios);
  }
}

export async function createTestApp(
  env: NodeJS.ProcessEnv,
  database = fakeDatabase(),
  consorcios: ConsorciosRepository = new InMemoryConsorciosRepository(),
  visitasFallidas: VisitasFallidasRepository = new InMemoryVisitasFallidasRepository(),
  auth: { usuarios?: UsuariosRepository; reloj?: Reloj } = {},
  semaforo: SemaforoRepository = new InMemorySemaforoRepository(),
): Promise<{ app: INestApplication; config: AppConfig }> {
  const config = loadConfig(env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(DatabaseService)
    .useValue(database)
    .overrideProvider(ConsorciosRepository)
    .useValue(consorcios)
    .overrideProvider(VisitasFallidasRepository)
    .useValue(visitasFallidas)
    .overrideProvider(UsuariosRepository)
    .useValue(auth.usuarios ?? new InMemoryUsuariosRepository())
    .overrideProvider(RELOJ)
    .useValue(auth.reloj ?? relojDelSistema)
    .overrideProvider(SemaforoRepository)
    .useValue(semaforo)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, config);
  await app.init();
  return { app, config };
}
