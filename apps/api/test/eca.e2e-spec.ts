import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';
import { textoDelPdf } from './pdf-extraer-texto';
import { bearer, crearSesiones, ECA_MAICON, ECA_PORTENA, ECA_SAN_MARTIN, NombreSesion, USUARIO_DE } from './sesiones-e2e';

jest.setTimeout(30_000);

async function arrancar(): Promise<{ app: INestApplication; tokens: Record<NombreSesion, string> }> {
  const usuarios = new InMemoryUsuariosRepository();
  const { app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios });
  return { app, tokens: await crearSesiones(app, usuarios) };
}

describe('EcaController (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  const get = (ruta: string, sesion: NombreSesion) => request(app.getHttpServer()).get(ruta).set('Authorization', bearer(tokens[sesion]));
  const post = (ruta: string, sesion: NombreSesion) => request(app.getHttpServer()).post(ruta).set('Authorization', bearer(tokens[sesion]));

  beforeAll(async () => {
    ({ app, tokens } = await arrancar());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/eca/cobertura', () => {
    it('responde 200 con las métricas y porcentaje de cobertura mensual', async () => {
      const res = await get('/api/eca/cobertura', 'secretaria').set('x-eca-name', ECA_PORTENA).expect(200);

      expect(res.body).toHaveProperty('eca', ECA_PORTENA);
      expect(res.body).toHaveProperty('mes', '2026-11');
      expect(res.body).toHaveProperty('totalMaquinas', 2);
      expect(res.body).toHaveProperty('inspeccionadas', 1);
      expect(res.body).toHaveProperty('firmadas', 0);
      expect(res.body).toHaveProperty('pendientes', 1);
      expect(res.body).toHaveProperty('porcentajeInspeccionadas', 50.0);
      expect(res.body).toHaveProperty('porcentajeFirmadas', 0.0);
      expect(res.body).toHaveProperty('porcentajeCobertura', 0.0);
    });

    it('permite filtrar por mes y consultar otra ECA aliada', async () => {
      const res = await get('/api/eca/cobertura?mes=2026-11', 'secretaria').set('x-eca-name', ECA_SAN_MARTIN).expect(200);

      expect(res.body.eca).toBe(ECA_SAN_MARTIN);
      expect(res.body.totalMaquinas).toBe(1);
      expect(res.body.advertencias).toBe(1);
      expect(res.body.inspeccionadas).toBe(0);
      expect(res.body.porcentajeInspeccionadas).toBe(0);
    });
  });

  describe('GET /api/eca/maquinas', () => {
    it('responde 200 con la lista de máquinas protegida de la ECA', async () => {
      const res = await get('/api/eca/maquinas', 'ecaPortena').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body.every((m: any) => m.eca === ECA_PORTENA)).toBe(true);

      const m1 = res.body.find((m: any) => m.id === 'MAQ-CORRIENTES-M1');
      expect(m1).toBeDefined();
      expect(m1.codigoAGC).toBe('M1');
      expect(m1.estado).toBe('Recorrida');
      expect(m1.edificio.direccion).toContain('Av. Corrientes 1234');
    });

    it('devuelve array vacío si la ECA no tiene máquinas asignadas en ese mes', async () => {
      const res = await get('/api/eca/maquinas?mes=2027-01', 'ecaPortena').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/eca/alertas', () => {
    it('responde 200 con el listado de alertas críticas de la flota', async () => {
      const res = await get('/api/eca/alertas', 'ecaMaicon').expect(200);

      expect(res.body).toHaveProperty('eca', ECA_MAICON);
      expect(res.body).toHaveProperty('mes', '2026-11');
      expect(res.body).toHaveProperty('totalAlertas', 2);
      expect(Array.isArray(res.body.alertas)).toBe(true);
      expect(res.body.alertas.length).toBe(2);

      const fueraDeServicio = res.body.alertas.find((a: any) => a.alerta.tipo === 'FUERA_DE_SERVICIO');
      expect(fueraDeServicio).toBeDefined();
      expect(fueraDeServicio.alerta.fotografiaCabinaTrabada).toBeTruthy();
      expect(fueraDeServicio.alerta.motivo).toBeTruthy();

      const reparacionUrgente = res.body.alertas.find((a: any) => a.alerta.tipo === 'REPARACION_URGENTE');
      expect(reparacionUrgente).toBeDefined();
      expect(Array.isArray(reparacionUrgente.alerta.checklist)).toBe(true);
      expect(reparacionUrgente.alerta.checklist.length).toBeGreaterThan(0);
    });
  });

  describe('RF-02 y RF-06: Descarga de Remito y Acuse Legal', () => {
    it('GET /api/eca/remito/:alertaId descarga el remito técnico en JSON si no se especifica formato', async () => {
      const res = await get('/api/eca/remito/ALT-MAICON-001', 'ecaMaicon').expect(200);

      expect(res.headers['content-disposition']).toContain('attachment; filename="remito-tecnico-ALT-MAICON-001.json"');
      expect(res.body).toHaveProperty('id', 'REM-ALT-MAICON-001');
      expect(res.body).toHaveProperty('alertaId', 'ALT-MAICON-001');
      expect(res.body).toHaveProperty('eca', ECA_MAICON);
      expect(res.body.checklist.length).toBeGreaterThan(0);

      // Verificación de acuse legal registrado automáticamente, a nombre del usuario de la sesión
      expect(res.body.acuseLegal).toHaveProperty('registrado', true);
      expect(res.body.acuseLegal).toHaveProperty('usuario', USUARIO_DE.ecaMaicon);
      expect(res.body.acuseLegal.fechaHora).toBeTruthy();
    });

    it('RF-06: GET /api/eca/remito/:alertaId?formato=pdf genera y descarga el remito oficial en formato PDF', async () => {
      const res = await get('/api/eca/remito/ALT-MAICON-001?formato=pdf', 'ecaMaicon').responseType('blob').expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename="remito-tecnico-M1-ALT-MAICON-001.pdf"');
      expect(res.headers['x-codigo-agc']).toBe('M1');
      expect(res.headers['x-alerta-id']).toBe('ALT-MAICON-001');
      expect(res.headers['x-acuse-usuario']).toBe(encodeURIComponent(USUARIO_DE.ecaMaicon));
      expect(res.headers['x-acuse-fecha-hora']).toBeTruthy();

      const buffer = Buffer.from(res.body);
      expect(buffer.toString('utf-8', 0, 5)).toBe('%PDF-');
      expect(buffer.length).toBeGreaterThan(1000);
    });

    it.each([
      ['ALT-MAICON-001', 'ecaMaicon', 'DIAGNÓSTICO TÉCNICO DE FALLA CRÍTICA: REPARACIÓN URGENTE'],
      ['ALT-CP-001', 'ecaPortena', 'DIAGNÓSTICO TÉCNICO DE FALLA CRÍTICA: FUERA DE SERVICIO: CABINA TRABADA'],
    ] as [string, NombreSesion, string][])('RF-07: el PDF de %s se lee limpio: sin símbolos rotos y con los estados en palabras', async (alertaId, sesion, titulo) => {
      const res = await get(`/api/eca/remito/${alertaId}?formato=pdf`, sesion).responseType('blob').expect(200);

      const texto = textoDelPdf(Buffer.from(res.body));

      expect(texto).toContain(titulo);
      expect(texto).toContain('OK · Acuse Legal Registrado: ');
      expect(texto).toContain('OK · Usuario Notificado: ');
      expect(texto).toContain(USUARIO_DE[sesion]);
      expect(texto).not.toMatch(/[þ&]/);
    });

    it('RF-07: los ítems del checklist del PDF dicen ATENCIÓN con su estado, no un símbolo', async () => {
      const res = await get('/api/eca/remito/ALT-MAICON-001?formato=pdf', 'ecaMaicon').responseType('blob').expect(200);

      const texto = textoDelPdf(Buffer.from(res.body));

      expect(texto).toMatch(/ATENCIÓN · (Critico|Falla)/);
      expect(texto).toContain('CHECKLIST DE SEGURIDAD INSPECCIONADO');
    });

    it('RF-06: GET /api/eca/remito/:alertaId con Accept: application/pdf genera remito en formato PDF', async () => {
      const res = await get('/api/eca/remito/ALT-MAICON-001', 'ecaMaicon').set('Accept', 'application/pdf').responseType('blob').expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('.pdf');
      const buffer = Buffer.from(res.body);
      expect(buffer.toString('utf-8', 0, 5)).toBe('%PDF-');
    });

    it('POST /api/eca/alertas/:alertaId/acuse registra explícitamente el acuse legal, a nombre del usuario de la sesión', async () => {
      const res = await post('/api/eca/alertas/ALT-MAICON-002/acuse', 'ecaMaicon').send({ usuario: 'responsable.guardia@maicon.com.ar' }).expect(201);

      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('alertaId', 'ALT-MAICON-002');
      expect(res.body.acuse).toHaveProperty('usuario', USUARIO_DE.ecaMaicon);
      expect(res.body.acuse.fechaHora).toBeTruthy();
    });

    it('GET /api/eca/remito/:alertaId/informe devuelve vista HTML responsiva para visualización en celular', async () => {
      const res = await request(app.getHttpServer()).get('/api/eca/remito/ALT-MAICON-001/informe').expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('MAICON S.R.L.');
      expect(res.text).toContain('viewport');
      expect(res.text).toContain('Checklist de Seguridad');
    });
  });
});

// HU-15 RF-02 — Portal ECA con sesión: cada ECA ve solo lo suyo.
describe('Portal ECA con sesión (HU-15 RF-02)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  const http = () => request(app.getHttpServer());
  const get = (ruta: string, sesion: NombreSesion) => http().get(ruta).set('Authorization', bearer(tokens[sesion]));
  const post = (ruta: string, sesion: NombreSesion) => http().post(ruta).set('Authorization', bearer(tokens[sesion]));
  /** La alerta tal como la ve la Secretaría: sirve para comprobar si quedó (o no) un acuse. */
  const acuseDe = async (eca: string, alertaId: string) => {
    const res = await get('/api/eca/alertas', 'secretaria').set('x-eca-name', eca).expect(200);
    return res.body.alertas.find((a: any) => a.alerta.id === alertaId).alerta.acuseRecibo;
  };

  beforeEach(async () => {
    ({ app, tokens } = await arrancar());
  });
  afterEach(async () => {
    await app.close();
  });

  describe('criterio 1: sin sesión, 401', () => {
    it.each([
      ['GET', '/api/eca/cobertura'],
      ['GET', '/api/eca/maquinas'],
      ['GET', '/api/eca/alertas'],
      ['GET', '/api/eca/remito/ALT-MAICON-002'],
      ['GET', '/api/eca/remito/ALT-MAICON-002?formato=pdf'],
      ['POST', '/api/eca/alertas/ALT-MAICON-002/acuse'],
    ])('%s %s sin Authorization → 401', async (metodo, ruta) => {
      const res = await (metodo === 'GET' ? http().get(ruta) : http().post(ruta));

      expect(res.status).toBe(401);
    });

    it('con un token inventado también → 401', async () => {
      expect((await http().get('/api/eca/alertas').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
      expect((await http().post('/api/eca/alertas/ALT-MAICON-002/acuse').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
    });

    it('sin sesión no se registra ningún acuse, aunque la URL, el cuerpo o los headers traigan un usuario', async () => {
      await http().get('/api/eca/remito/ALT-MAICON-002?formato=pdf&usuario=intruso@x.com').set('x-eca-user', 'intruso@x.com').set('x-user-id', 'intruso');
      await http().post('/api/eca/alertas/ALT-MAICON-002/acuse').set('x-eca-user', 'intruso@x.com').send({ usuario: 'intruso@x.com' });

      expect(await acuseDe(ECA_MAICON, 'ALT-MAICON-002')).toBeNull();
    });
  });

  describe('criterio 2: un usuario ECA sólo ve y descarga lo de su ECA', () => {
    it('pidiendo otra ECA por header o por parámetro, igual ve la suya (alertas, cobertura y máquinas)', async () => {
      const otra = (r: request.Test) => r.set('x-eca-name', ECA_PORTENA).set('x-eca-id', ECA_PORTENA);

      const alertas = await otra(get(`/api/eca/alertas?eca=${encodeURIComponent(ECA_PORTENA)}`, 'ecaMaicon')).expect(200);
      const cobertura = await otra(get(`/api/eca/cobertura?eca=${encodeURIComponent(ECA_PORTENA)}`, 'ecaMaicon')).expect(200);
      const maquinas = await otra(get(`/api/eca/maquinas?eca=${encodeURIComponent(ECA_PORTENA)}`, 'ecaMaicon')).expect(200);

      expect(alertas.body.eca).toBe(ECA_MAICON);
      expect(alertas.body.alertas.map((a: any) => a.alerta.id).sort()).toEqual(['ALT-MAICON-001', 'ALT-MAICON-002']);
      expect(cobertura.body.eca).toBe(ECA_MAICON);
      expect(maquinas.body.length).toBeGreaterThan(0);
      expect(maquinas.body.every((m: any) => m.eca === ECA_MAICON)).toBe(true);
    });

    it('cada ECA ve sus alertas y no las de las otras', async () => {
      const porteña = await get('/api/eca/alertas', 'ecaPortena').expect(200);
      const sanMartin = await get('/api/eca/alertas', 'ecaSanMartin').expect(200);

      expect(porteña.body.alertas.map((a: any) => a.alerta.id)).toEqual(['ALT-CP-001']);
      expect(sanMartin.body.eca).toBe(ECA_SAN_MARTIN);
      expect(sanMartin.body.alertas).toEqual([]);
    });

    it('la alerta de otra ECA da 404 al pedir el remito (JSON y PDF) y al acusar recibo, y no queda ningún acuse', async () => {
      expect((await get('/api/eca/remito/ALT-CP-001', 'ecaMaicon')).status).toBe(404);
      expect((await get('/api/eca/remito/ALT-CP-001?formato=pdf', 'ecaMaicon')).status).toBe(404);
      expect((await post('/api/eca/alertas/ALT-CP-001/acuse', 'ecaMaicon')).status).toBe(404);

      expect(await acuseDe(ECA_PORTENA, 'ALT-CP-001')).toBeNull();
    });

    it('el 404 de una alerta ajena es igual al de una que no existe (no revela que existe)', async () => {
      const ajena = await get('/api/eca/remito/ALT-CP-001', 'ecaMaicon');
      const inexistente = await get('/api/eca/remito/ALT-NO-EXISTE', 'ecaMaicon');

      expect(ajena.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(ajena.body.message.replace('ALT-CP-001', 'X')).toBe(inexistente.body.message.replace('ALT-NO-EXISTE', 'X'));
    });

    it('la ECA se compara exacta: «MAICON» (parte del nombre de «MAICON Mantenimiento») no ve esa flota', async () => {
      const alertas = await get('/api/eca/alertas', 'ecaParcial').expect(200);
      const maquinas = await get('/api/eca/maquinas', 'ecaParcial').expect(200);
      const cobertura = await get('/api/eca/cobertura', 'ecaParcial').expect(200);

      expect(alertas.body.totalAlertas).toBe(0);
      expect(maquinas.body).toEqual([]);
      expect(cobertura.body.totalMaquinas).toBe(0);
      expect((await get('/api/eca/remito/ALT-MAICON-001', 'ecaParcial')).status).toBe(404);
    });

    it('la ECA se compara exacta también en las mayúsculas, como el RLS de la base: «MAICON MANTENIMIENTO» no ve la flota de «MAICON Mantenimiento»', async () => {
      expect((await get('/api/eca/alertas', 'ecaMayusculas').expect(200)).body.totalAlertas).toBe(0);
      expect((await get('/api/eca/maquinas', 'ecaMayusculas').expect(200)).body).toEqual([]);
      expect((await get('/api/eca/remito/ALT-MAICON-001', 'ecaMayusculas')).status).toBe(404);
    });

    it('un usuario ECA sin ECA asignada recibe 403 con el motivo, en todas las rutas', async () => {
      for (const ruta of ['/api/eca/alertas', '/api/eca/cobertura', '/api/eca/maquinas', '/api/eca/remito/ALT-MAICON-001']) {
        const res = await get(ruta, 'ecaSinAsignar');
        expect([ruta, res.status]).toEqual([ruta, 403]);
        expect(res.body.message).toMatch(/ECA asignada/);
      }
      expect((await post('/api/eca/alertas/ALT-MAICON-001/acuse', 'ecaSinAsignar')).status).toBe(403);
    });
  });

  describe('criterio 3: Secretaría y Administrador ven cualquier ECA; RT y Firmante, 403', () => {
    it.each([
      ['secretaria', ECA_PORTENA, 1],
      ['secretaria', ECA_MAICON, 2],
      ['secretaria', ECA_SAN_MARTIN, 0],
      ['administrador', ECA_PORTENA, 1],
      ['administrador', ECA_MAICON, 2],
      ['administrador', ECA_SAN_MARTIN, 0],
    ] as [NombreSesion, string, number][])('%s elige la ECA «%s» por header y ve %i alerta(s)', async (sesion, eca, alertas) => {
      const res = await get('/api/eca/alertas', sesion).set('x-eca-name', eca).expect(200);

      expect(res.body.eca).toBe(eca);
      expect(res.body.totalAlertas).toBe(alertas);
    });

    it('también puede elegirla con el parámetro eca, en cobertura y máquinas', async () => {
      const cobertura = await get(`/api/eca/cobertura?eca=${encodeURIComponent(ECA_SAN_MARTIN)}`, 'administrador').expect(200);
      const maquinas = await get(`/api/eca/maquinas?eca=${encodeURIComponent(ECA_SAN_MARTIN)}`, 'secretaria').expect(200);

      expect(cobertura.body.eca).toBe(ECA_SAN_MARTIN);
      expect(maquinas.body.every((m: any) => m.eca === ECA_SAN_MARTIN)).toBe(true);
      expect(maquinas.body.length).toBeGreaterThan(0);
    });

    it.each([['rt_calle'], ['firmante']] as [NombreSesion][])('%s recibe 403 en todas las rutas del portal', async (sesion) => {
      for (const ruta of ['/api/eca/alertas', '/api/eca/cobertura', '/api/eca/maquinas', '/api/eca/remito/ALT-MAICON-002', '/api/eca/remito/ALT-MAICON-002?formato=pdf']) {
        expect([ruta, (await get(ruta, sesion)).status]).toEqual([ruta, 403]);
      }
      expect((await post('/api/eca/alertas/ALT-MAICON-002/acuse', sesion)).status).toBe(403);
      expect(await acuseDe(ECA_MAICON, 'ALT-MAICON-002')).toBeNull();
    });

    it.each([['secretaria'], ['administrador']] as [NombreSesion][])('el remito y el acuse son de la ECA: %s no los registra (403)', async (sesion) => {
      expect((await get('/api/eca/remito/ALT-MAICON-002', sesion)).status).toBe(403);
      expect((await get('/api/eca/remito/ALT-MAICON-002?formato=pdf', sesion)).status).toBe(403);
      expect((await post('/api/eca/alertas/ALT-MAICON-002/acuse', sesion)).status).toBe(403);

      expect(await acuseDe(ECA_MAICON, 'ALT-MAICON-002')).toBeNull();
    });
  });

  describe('criterio 4: el acuse queda a nombre del usuario de la sesión', () => {
    it('POST acuse: el usuario del cuerpo y de los headers se ignora', async () => {
      const res = await post('/api/eca/alertas/ALT-MAICON-002/acuse', 'ecaMaicon')
        .set('x-eca-user', 'otro@x.com')
        .set('x-user-id', 'otro')
        .send({ usuario: 'responsable.guardia@maicon.com.ar' })
        .expect(201);

      expect(res.body.acuse.usuario).toBe(USUARIO_DE.ecaMaicon);
      expect((await acuseDe(ECA_MAICON, 'ALT-MAICON-002')).usuario).toBe(USUARIO_DE.ecaMaicon);
    });

    it('descargar el remito (PDF y JSON) con otro usuario en la URL o en los headers: queda el de la sesión', async () => {
      const pdf = await get('/api/eca/remito/ALT-MAICON-002?formato=pdf&usuario=intruso@x.com', 'ecaMaicon').set('x-eca-user', 'intruso@x.com').responseType('blob').expect(200);

      expect(pdf.headers['x-acuse-usuario']).toBe(encodeURIComponent(USUARIO_DE.ecaMaicon));
      expect((await acuseDe(ECA_MAICON, 'ALT-MAICON-002')).usuario).toBe(USUARIO_DE.ecaMaicon);
      const json = await get('/api/eca/remito/ALT-MAICON-001?usuario=intruso@x.com', 'ecaMaicon').expect(200);
      expect(json.body.acuseLegal.usuario).toBe(USUARIO_DE.ecaMaicon);
    });

    it('dos ECA distintas acusan cada una lo suyo, a su nombre', async () => {
      await post('/api/eca/alertas/ALT-CP-001/acuse', 'ecaPortena').expect(201);
      await post('/api/eca/alertas/ALT-MAICON-001/acuse', 'ecaMaicon').expect(201);

      expect((await acuseDe(ECA_PORTENA, 'ALT-CP-001')).usuario).toBe(USUARIO_DE.ecaPortena);
      expect((await acuseDe(ECA_MAICON, 'ALT-MAICON-001')).usuario).toBe(USUARIO_DE.ecaMaicon);
    });
  });

  describe('la vista del informe (enlace público, hasta HU-11) no crea acuses', () => {
    it('abrirla no registra el acuse; el acuse que ya existe sí aparece', async () => {
      const antes = await http().get('/api/eca/remito/ALT-MAICON-002/informe').expect(200);
      expect(antes.text).toContain('pendiente');
      expect(await acuseDe(ECA_MAICON, 'ALT-MAICON-002')).toBeNull();

      await post('/api/eca/alertas/ALT-MAICON-002/acuse', 'ecaMaicon').expect(201);
      const despues = await http().get('/api/eca/remito/ALT-MAICON-002/informe').expect(200);

      expect(despues.text).toContain('Registrado');
      expect(despues.text).toContain(USUARIO_DE.ecaMaicon);
    });
  });
});
