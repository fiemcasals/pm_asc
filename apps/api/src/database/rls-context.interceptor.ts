import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RolRls, runWithRlsContext } from './rls-context';

type RequestConUsuario = {
  usuario?: {
    id: string;
    usuario: string;
    rol: string;
    eca: string | null;
  };
};

/**
 * Interceptor de contexto RLS:
 * Se ejecuta DESPUÉS de los guards (RolesGuard), por lo que toma el usuario verificado
 * de la sesión (`req.usuario`) e ignora absolutamente cualquier header enviado por el cliente
 * (`x-eca-actual`, `x-rol-actual`, `x-usuario-actual`).
 */
@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestConUsuario>();
    const usuario = req?.usuario;

    let eca: string | null = null;
    let rol: RolRls | null = null;
    let nombreUsuario: string | null = null;
    let esExplicito = false;

    if (usuario) {
      esExplicito = true;
      nombreUsuario = usuario.usuario ?? null;
      rol = usuario.rol as RolRls;
      // Sólo para rol eca se establece la ECA propietaria; RT de Calle, Firmante,
      // Secretaría y Administrador operan sin restringir por eca_nombre fija.
      if (usuario.rol === 'eca') {
        eca = usuario.eca?.trim() || null;
      } else {
        eca = null;
      }
    }

    const ctx = {
      eca,
      rol,
      usuario: nombreUsuario,
      esExplicito,
    };

    return new Observable((subscriber) => {
      runWithRlsContext(ctx, () => {
        const subscription = next.handle().subscribe(subscriber);
        return () => subscription.unsubscribe();
      });
    });
  }
}

