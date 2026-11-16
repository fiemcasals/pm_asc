import { cicloDeAdvertencias, diasCalendarioEntre, estaBloqueado } from '../src/visitas-fallidas/bloqueo.logic';
import { DesbloqueoEdificio, VisitaFallidaRegistro } from '../src/visitas-fallidas/visitas-fallidas.types';

// HU-07 RF-05 (lógica pura): las advertencias vigentes, el bloqueo y los días entre visitas.
const visita = (id: string, fechaHora: string): VisitaFallidaRegistro =>
  ({ id, consorcioId: 'c', consorcioNombre: 'C', direccion: 'd', numeroAdvertencia: 1, motivo: 'm', fotoFrenteUrl: 'f', gps: { latitud: 0, longitud: 0 }, inspector: 'i', fechaHora }) as VisitaFallidaRegistro;
const desbloqueo = (hastaVisitaId: string): DesbloqueoEdificio => ({ id: 'd', consorcioId: 'c', hastaVisitaId, usuario: 'sec', motivo: 'm', fecha: '2026-11-10T00:00:00Z' });

const v1 = visita('v1', '2026-11-02T12:00:00Z');
const v2 = visita('v2', '2026-11-03T12:00:00Z');
const v3 = visita('v3', '2026-11-04T12:00:00Z');
const v4 = visita('v4', '2026-11-05T12:00:00Z');

describe('cicloDeAdvertencias: las advertencias vigentes (criterio 4)', () => {
  it('sin ninguna inspección cuentan todas', () => {
    expect(cicloDeAdvertencias([v1, v2, v3], null).map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
  });

  it('una inspección (visita exitosa) reinicia: sólo cuentan las fallidas posteriores', () => {
    expect(cicloDeAdvertencias([v1, v2, v3], '2026-11-03T18:00:00Z').map((v) => v.id)).toEqual(['v3']);
    expect(cicloDeAdvertencias([v1, v2, v3], '2026-11-04T18:00:00Z')).toEqual([]);
  });

  it('una inspección anterior a todas las visitas fallidas no reinicia nada', () => {
    expect(cicloDeAdvertencias([v1, v2], '2026-10-30T00:00:00Z')).toHaveLength(2);
  });

  it('una inspección en el mismo instante que la visita fallida no la cuenta como posterior', () => {
    expect(cicloDeAdvertencias([v1], '2026-11-02T12:00:00Z')).toEqual([]);
  });
});

describe('estaBloqueado (criterios 1 y 2)', () => {
  it('con menos de 3 advertencias vigentes no hay bloqueo', () => {
    expect(estaBloqueado([v1, v2], [])).toBe(false);
  });

  it('con 3 advertencias vigentes y sin desbloqueo, sí', () => {
    expect(estaBloqueado([v1, v2, v3], [])).toBe(true);
  });

  it('el desbloqueo que cubre la última visita lo levanta; una visita fallida posterior lo bloquea de nuevo', () => {
    expect(estaBloqueado([v1, v2, v3], [desbloqueo('v3')])).toBe(false);
    expect(estaBloqueado([v1, v2, v3, v4], [desbloqueo('v3')])).toBe(true);
    expect(estaBloqueado([v1, v2, v3, v4], [desbloqueo('v3'), desbloqueo('v4')])).toBe(false);
  });

  it('un desbloqueo de otra serie (visita que ya no es la última) no levanta el bloqueo vigente', () => {
    expect(estaBloqueado([v1, v2, v3], [desbloqueo('otra')])).toBe(true);
  });
});

describe('diasCalendarioEntre (hora de Buenos Aires)', () => {
  const ms = (iso: string) => Date.parse(iso);

  it('el mismo día es 0 y al día siguiente es 1, sin importar la hora', () => {
    expect(diasCalendarioEntre(ms('2026-11-10T13:00:00Z'), ms('2026-11-10T22:00:00Z'))).toBe(0);
    expect(diasCalendarioEntre(ms('2026-11-10T13:00:00Z'), ms('2026-11-11T13:00:00Z'))).toBe(1);
    expect(diasCalendarioEntre(ms('2026-11-10T23:59:00Z'), ms('2026-11-11T12:00:00Z'))).toBe(1); // 20:59 BA → 09:00 BA siguiente
  });

  it('usa el día de Buenos Aires, no el de UTC: 22:00 y 23:30 BA son el mismo día aunque en UTC cambie la fecha', () => {
    expect(diasCalendarioEntre(ms('2026-11-10T01:00:00Z'), ms('2026-11-10T02:30:00Z'))).toBe(0); // 9/11 22:00 → 9/11 23:30 BA
    expect(diasCalendarioEntre(ms('2026-11-10T02:30:00Z'), ms('2026-11-10T04:00:00Z'))).toBe(1); // 9/11 23:30 → 10/11 01:00 BA
  });
});
