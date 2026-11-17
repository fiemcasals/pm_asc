import { fetchConSesion, leerPerfil } from '../auth/sesion';
import { almacenIdb, type DepsCola } from './cola';

/** La cola con lo real de la app: IndexedDB, la sesión del usuario y su perfil guardado (si cambia de usuario, el envío se frena). */
export function depsDeApp(usuario: string): DepsCola {
  return { usuario, almacen: almacenIdb(), enviar: fetchConSesion, usuarioVigente: () => leerPerfil()?.usuario ?? null };
}
