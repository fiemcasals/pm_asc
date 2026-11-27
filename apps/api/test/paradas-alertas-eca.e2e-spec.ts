import { INestApplication } from '@nestjs/common';
import bcryptjs from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ConsorcioInput } from '../src/consorcios/consorcio.types';
import { FirmanteService } from '../src/firmante/firmante.service';
import { InMemoryParadasRepository } from '../src/paradas/paradas.repository';
import { ParadasService } from '../src/paradas/paradas.service';
import { InMemoryConsorciosRepository, createTestApp, fakeDatabase } from './create-test-app';

/**
 * HU-10 / RF-08: Que un equipo marcado Fuera de Servicio o con Reparación Urgente genere la alerta del Portal ECA (REQ-1795527711177).
 * Conecta los reportes de parada del RT (POST /api/paradas) con el Centro de Alertas del Portal ECA.
 */
const PASSWORD = 'Clave-Segura-2026';
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const ECA_CANONICA = 'Conservación Porteña S.R.L.';
const OTRA_ECA = 'Elevadores San Martín';

describe('HU-10 / RF-08 · Alerta crítica en Portal ECA a partir de reporte de parada (REQ-1795527711177)', () => {
  let app: INestApplication;
  let usuarios: InMemoryUsuariosRepository;
  let consorcios: InMemoryConsorciosRepository;
  let paradasRepo: InMemoryParadasRepository;
  let db: ReturnType<typeof fakeDatabase>;
  let hash: string;
  let tokens: Record<string, string>;
  let consorcioId: string;
  let maquinaId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    hash = await bcryptjs.hash(PASSWORD, 4);
  });

  async function arrancar() {
    ({ app } = await createTestApp(
      { NODE_ENV: 'test' },
      db,
      consorcios,
      undefined,
      { usuarios },
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      paradasRepo,
    ));
  }

  async function reiniciar() {
    await app.get(ParadasService).esperarGuardados();
    await app.close();
    await arrancar();
  }

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository();
    consorcios = new InMemoryConsorciosRepository();
    paradasRepo = new InMemoryParadasRepository();
    db = fakeDatabase();
    tokens = {};

    // Crear usuarios de prueba con roles reales
    await usuarios.crear({ usuario: 'rt_calle_1', nombre: 'RT Calle 1', rol: 'rt_calle', passwordHash: hash, eca: null });
    await usuarios.crear({ usuario: 'firmante_1', nombre: 'Firmante 1', rol: 'firmante', passwordHash: hash, eca: null });
    await usuarios.crear({ usuario: 'eca_porteña', nombre: 'ECA Porteña User', rol: 'eca', passwordHash: hash, eca: ECA_CANONICA });
    await usuarios.crear({ usuario: 'eca_san_martin', nombre: 'ECA San Martín User', rol: 'eca', passwordHash: hash, eca: OTRA_ECA });
    await usuarios.crear({ usuario: 'secretaria_1', nombre: 'Secretaría 1', rol: 'secretaria', passwordHash: hash, eca: null });

    // Iniciar app
    await arrancar();

    // Obtener tokens JWT
    for (const u of ['rt_calle_1', 'firmante_1', 'eca_porteña', 'eca_san_martin', 'secretaria_1']) {
      const res = await http().post('/api/auth/login').send({ usuario: u, password: PASSWORD });
      tokens[u] = res.body.accessToken;
    }

    // Crear edificio con terna y máquina M1
    const ficha: ConsorcioInput = {
      nombre: 'Consorcio Callao 1500',
      direccion: 'Av. Callao 1500, CABA',
      administracion: { nombre: 'Admin Norte', telefono: '11 5555-4444', email: 'admin@norte.com' },
      encargado: { nombre: 'Juan Pérez', telefono: '11 2222-3333' },
      pisos: [],
      ubicacion: null,
      maquinas: [
        { referenciaAgc: 'M1', descripcion: 'Ascensor Principal Callao', tipo: 'traccion', salaCompartidaId: null },
      ],
    };

    const alta = await http()
      .post('/api/consorcios')
      .set('Authorization', `Bearer ${tokens['secretaria_1']}`)
      .send(ficha)
      .expect(201);
    consorcioId = alta.body.id;

    await http()
      .put(`/api/consorcios/${consorcioId}/roles`)
      .set('Authorization', `Bearer ${tokens['secretaria_1']}`)
      .send({
        rtCalle: { nombre: 'rt_calle_1', telefono: '11 1111-1111', email: 'rt1@test.com' },
        firmante: { nombre: 'firmante_1', telefono: '11 2222-2222', email: 'firmante1@test.com' },
        eca: { nombre: ECA_CANONICA, telefono: '11 3333-3333', email: 'eca@test.com' },
      })
      .expect(200);

    const firmanteService = app.get(FirmanteService);
    const maq = firmanteService.getMaquinas().find((m) => m.consorcioId === consorcioId);
    expect(maq).toBeDefined();
    maquinaId = maq!.id;
  });

  afterEach(async () => {
    await app?.close();
  });

  it('Criterio 1: Edificio con terna sin máquinas de ejemplo → el RT marca Fuera de Servicio y la ECA ve la alerta en su portal', async () => {
    // 1. Verificar que inicialmente no hay alertas
    const resInicial = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);
    expect(resInicial.body.totalAlertas).toBe(0);
    expect(resInicial.body.alertas).toHaveLength(0);

    // 2. El RT marca Fuera de Servicio
    const resParada = await http()
      .post('/api/paradas')
      .set('Authorization', `Bearer ${tokens['rt_calle_1']}`)
      .send({
        maquinaId,
        estado: 'Fuera de Servicio',
        causa: 'Freno electromagnético trabado y deformación en guiadores',
        fotos: [FOTO],
      })
      .expect(201);

    expect(resParada.body).toMatchObject({
      maquinaId,
      estadoMarcado: 'Fuera de Servicio',
      confirmacion: 'Pendiente de confirmación',
      causa: 'Freno electromagnético trabado y deformación en guiadores',
    });

    // 3. La ECA abre su portal y ve la alerta del equipo
    const resAlertas = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);

    expect(resAlertas.body.totalAlertas).toBe(1);
    expect(resAlertas.body.alertas).toHaveLength(1);

    const alertaItem = resAlertas.body.alertas[0];
    expect(alertaItem.maquinaId).toBe(maquinaId);
    expect(alertaItem.codigoAGC).toBe('M1');
    expect(alertaItem.edificio.direccion).toBe('Av. Callao 1500, CABA');
    expect(alertaItem.eca).toBe(ECA_CANONICA);
    expect(alertaItem.estadoOperativo).toBe('Fuera de Servicio');
    expect(alertaItem.alerta.tipo).toBe('FUERA_DE_SERVICIO');
    expect(alertaItem.alerta.motivo).toBe('Freno electromagnético trabado y deformación en guiadores');
    expect(alertaItem.alerta.fotografiaCabinaTrabada).toBe(FOTO);
    expect(alertaItem.alerta.acuseRecibo).toBeNull();
  });

  it('Criterio 2: La ECA descarga el remito y registra el acuse de recibo con fecha y hora', async () => {
    // Crear parada
    await http()
      .post('/api/paradas')
      .set('Authorization', `Bearer ${tokens['rt_calle_1']}`)
      .send({ maquinaId, estado: 'Fuera de Servicio', causa: 'Cabina trabada', fotos: [FOTO] })
      .expect(201);

    const resAlertas = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);
    const alertaId = resAlertas.body.alertas[0].alerta.id;

    // Descargar remito (genera acuse legal)
    const resRemito = await http()
      .get(`/api/eca/remito/${alertaId}`)
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);

    expect(resRemito.body.alertaId).toBe(alertaId);
    expect(resRemito.body.acuseLegal.registrado).toBe(true);
    expect(resRemito.body.acuseLegal.usuario).toBe('eca_porteña');
    expect(resRemito.body.acuseLegal.fechaHora).toBeDefined();

    // Consultar alertas de nuevo: el acuse figura en la alerta
    const resAlertasConAcuse = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);

    const acuse = resAlertasConAcuse.body.alertas[0].alerta.acuseRecibo;
    expect(acuse).not.toBeNull();
    expect(acuse.usuario).toBe('eca_porteña');
    expect(acuse.fechaHora).toBe(resRemito.body.acuseLegal.fechaHora);
  });

  it('Criterio 3: Otra ECA no ve la alerta ni puede descargar su remito (404)', async () => {
    // Crear parada para Conservación Porteña
    await http()
      .post('/api/paradas')
      .set('Authorization', `Bearer ${tokens['rt_calle_1']}`)
      .send({ maquinaId, estado: 'Fuera de Servicio', causa: 'Desperfecto crítico', fotos: [FOTO] })
      .expect(201);

    const resAlertasPte = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);
    const alertaId = resAlertasPte.body.alertas[0].alerta.id;

    // La otra ECA (San Martín) consulta alertas: no ve ninguna
    const resAlertasOtra = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_san_martin']}`)
      .expect(200);

    expect(resAlertasOtra.body.totalAlertas).toBe(0);
    expect(resAlertasOtra.body.alertas).toHaveLength(0);

    // Si la otra ECA intenta acceder al remito de esa alerta ajena: 404
    await http()
      .get(`/api/eca/remito/${alertaId}`)
      .set('Authorization', `Bearer ${tokens['eca_san_martin']}`)
      .expect(404);

    // Si intenta acusar recibo de esa alerta ajena: 404
    await http()
      .post(`/api/eca/alertas/${alertaId}/acuse`)
      .set('Authorization', `Bearer ${tokens['eca_san_martin']}`)
      .expect(404);
  });

  it('Criterio 4: Cuando el RT normaliza el equipo, la alerta deja de figurar en el Portal ECA', async () => {
    // 1. Reportar parada
    const resParada = await http()
      .post('/api/paradas')
      .set('Authorization', `Bearer ${tokens['rt_calle_1']}`)
      .send({ maquinaId, estado: 'Fuera de Servicio', causa: 'Falla temporal', fotos: [FOTO] })
      .expect(201);
    const paradaId = resParada.body.id;

    // 2. Firmante confirma el reporte
    await app.get(ParadasService).resolver(paradaId, 'confirmar', { usuario: 'firmante_1', rol: 'firmante' });

    // 3. Verificar que la alerta está activa
    const conAlerta = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);
    expect(conAlerta.body.totalAlertas).toBe(1);

    // 4. El RT normaliza el equipo con foto
    await http()
      .post(`/api/paradas/maquinas/${maquinaId}/normalizar`)
      .set('Authorization', `Bearer ${tokens['rt_calle_1']}`)
      .send({ fotos: [FOTO] })
      .expect(200);

    // 5. La alerta ya no figura en el Portal ECA
    const sinAlerta = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);
    expect(sinAlerta.body.totalAlertas).toBe(0);
    expect(sinAlerta.body.alertas).toHaveLength(0);
  });

  it('Criterio 5: La alerta sobrevive al reinicio de la API a partir de los reportes guardados en repositorio', async () => {
    // 1. Reportar parada
    await http()
      .post('/api/paradas')
      .set('Authorization', `Bearer ${tokens['rt_calle_1']}`)
      .send({ maquinaId, estado: 'Reparación Urgente', causa: 'Deslizamiento crítico en prueba de carga', fotos: [FOTO] })
      .expect(201);

    const antes = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);
    expect(antes.body.totalAlertas).toBe(1);
    const alertaAntes = antes.body.alertas[0];
    expect(alertaAntes.alerta.tipo).toBe('REPARACION_URGENTE');

    // 2. Reiniciar la API simulada
    await reiniciar();

    // Re-iniciar sesión post-reinicio
    const resSec = await http().post('/api/auth/login').send({ usuario: 'secretaria_1', password: PASSWORD }).expect(200);
    const tokenSec = resSec.body.accessToken;
    const resEca = await http().post('/api/auth/login').send({ usuario: 'eca_porteña', password: PASSWORD }).expect(200);
    const tokenEca = resEca.body.accessToken;

    // 3. Re-aplicar terna del consorcio para poblar firmanteService post-reinicio
    await http()
      .put(`/api/consorcios/${consorcioId}/roles`)
      .set('Authorization', `Bearer ${tokenSec}`)
      .send({
        rtCalle: { nombre: 'rt_calle_1', telefono: '11 1111-1111', email: 'rt1@test.com' },
        firmante: { nombre: 'firmante_1', telefono: '11 2222-2222', email: 'firmante1@test.com' },
        eca: { nombre: ECA_CANONICA, telefono: '11 3333-3333', email: 'eca@test.com' },
      })
      .expect(200);

    // 4. La alerta sigue figurando post-reinicio
    const despues = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokenEca}`)
      .expect(200);

    expect(despues.body.totalAlertas).toBe(1);
    expect(despues.body.alertas[0].alerta.id).toBe(alertaAntes.alerta.id);
    expect(despues.body.alertas[0].alerta.motivo).toBe('Deslizamiento crítico en prueba de carga');
    expect(despues.body.alertas[0].alerta.tipo).toBe('REPARACION_URGENTE');
  });

  it('Criterio 6: Reparación Urgente genera alerta y permite registrar acuse vía POST acuse', async () => {
    await http()
      .post('/api/paradas')
      .set('Authorization', `Bearer ${tokens['rt_calle_1']}`)
      .send({
        maquinaId,
        estado: 'Reparación Urgente',
        causa: 'Cables deshilachados con riesgo de corte',
        fotos: [FOTO],
      })
      .expect(201);

    const res = await http()
      .get('/api/eca/alertas')
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(200);
    const alerta = res.body.alertas[0].alerta;
    expect(alerta.tipo).toBe('REPARACION_URGENTE');

    const acuseRes = await http()
      .post(`/api/eca/alertas/${alerta.id}/acuse`)
      .set('Authorization', `Bearer ${tokens['eca_porteña']}`)
      .expect(201);

    expect(acuseRes.body.ok).toBe(true);
    expect(acuseRes.body.alertaId).toBe(alerta.id);
    expect(acuseRes.body.acuse.usuario).toBe('eca_porteña');
  });
});
