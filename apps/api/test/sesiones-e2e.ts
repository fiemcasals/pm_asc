import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';

/** Las tres ECA de los datos de demostración (FirmanteService). */
export const ECA_PORTENA = 'Conservación Porteña S.R.L.';
export const ECA_MAICON = 'MAICON Mantenimiento';
export const ECA_SAN_MARTIN = 'Elevadores San Martín';

export const PASSWORD_E2E = 'Clave-Segura-2026';

export type NombreSesion = Rol | 'ecaPortena' | 'ecaMaicon' | 'ecaMaicon2' | 'ecaSanMartin' | 'ecaParcial' | 'ecaMayusculas' | 'ecaSinAsignar';

/** Los usuarios de prueba: uno por rol, y un usuario ECA por cada ECA de los datos de demostración. */
const USUARIOS: { clave: NombreSesion; usuario: string; rol: Rol; eca: string | null }[] = [
  { clave: 'administrador', usuario: 'admin.e2e', rol: 'administrador', eca: null },
  { clave: 'secretaria', usuario: 'secretaria.e2e', rol: 'secretaria', eca: null },
  { clave: 'rt_calle', usuario: 'rt.e2e', rol: 'rt_calle', eca: null },
  { clave: 'firmante', usuario: 'firmante.e2e', rol: 'firmante', eca: null },
  { clave: 'ecaPortena', usuario: 'eca.portena@e2e', rol: 'eca', eca: ECA_PORTENA },
  { clave: 'ecaMaicon', usuario: 'eca.maicon@e2e', rol: 'eca', eca: ECA_MAICON },
  { clave: 'ecaSanMartin', usuario: 'eca.sanmartin@e2e', rol: 'eca', eca: ECA_SAN_MARTIN },
  // Otro usuario de la misma ECA de MAICON: para comprobar que el primero que acusa recibo es el que queda.
  { clave: 'ecaMaicon2', usuario: 'eca.maicon2@e2e', rol: 'eca', eca: ECA_MAICON },
  // Casos límite del aislamiento: una ECA cuyo nombre es parte del de otra («MAICON» dentro de «MAICON Mantenimiento») y un usuario ECA sin ECA.
  { clave: 'ecaParcial', usuario: 'eca.parcial@e2e', rol: 'eca', eca: 'MAICON' },
  // El RLS de la base distingue mayúsculas: el filtro de la API también.
  { clave: 'ecaMayusculas', usuario: 'eca.mayusculas@e2e', rol: 'eca', eca: 'MAICON MANTENIMIENTO' },
  { clave: 'ecaSinAsignar', usuario: 'eca.sinasignar@e2e', rol: 'eca', eca: null },
];

/** El usuario (login) de cada sesión de prueba, para comprobar a nombre de quién queda un registro. */
export const USUARIO_DE: Record<NombreSesion, string> = Object.fromEntries(USUARIOS.map((u) => [u.clave, u.usuario])) as Record<NombreSesion, string>;

/**
 * Crea en el repositorio de usuarios en memoria un usuario por rol (y uno por ECA) e ingresa con cada uno por la API real.
 * Devuelve el token de acceso de cada sesión, para mandarlo como `Authorization: Bearer <token>`.
 */
export async function crearSesiones(app: INestApplication, usuarios: InMemoryUsuariosRepository): Promise<Record<NombreSesion, string>> {
  const hash = await bcrypt.hash(PASSWORD_E2E, 4);
  const tokens = {} as Record<NombreSesion, string>;
  for (const u of USUARIOS) {
    await usuarios.crear({ usuario: u.usuario, nombre: u.usuario, rol: u.rol, passwordHash: hash, eca: u.eca });
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: u.usuario, password: PASSWORD_E2E });
    if (res.status !== 200 && res.status !== 201) throw new Error(`No se pudo ingresar como ${u.usuario}: ${res.status} ${JSON.stringify(res.body)}`);
    tokens[u.clave] = res.body.accessToken;
  }
  return tokens;
}

export const bearer = (token: string): string => `Bearer ${token}`;
