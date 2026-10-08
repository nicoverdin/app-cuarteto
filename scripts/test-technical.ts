// Pruebas del cálculo técnico: node:test + tsx. (Índice de nivel: 0 = sin nivel, 1 = Base, 2 = L1 …)   npm run test:technical
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, getElement } from '../lib/technical/catalog';
import { createWriteQueue } from '../lib/technical/queue';
import { splitRows, toDbRow, toScore } from '../lib/technical/store';
import { derivedGroupLevel, elementValue, summarize, validateScore, type Score, emptyAttempt, MAX_ATTEMPTS } from '../lib/technical/score';

const el = (id: string) => getElement(id)!;
const att = (r: ReturnType<typeof summarize>, id: string, n = 1) => r.elements[id].attempts[n] ?? emptyAttempt(ATHLETES);
const ATHLETES = ['A', 'B', 'C', 'D'];

test('catálogo: 6 niveles por elemento, niveles crecientes y QOE creciente', () => {
  for (const e of CATALOG) {
    assert.equal(e.levels.length, 6, e.id);
    assert.equal(e.levels[0].base, 0);
    for (let i = 2; i < e.levels.length; i++) assert.ok(e.levels[i].base > e.levels[i - 1].base, `${e.id} base ${i}`);
    for (const l of e.levels) assert.ok(l.qoe[0] <= l.qoe[1] && l.qoe[1] <= l.qoe[2]);
  }
});

test('valor = base + QOE (tabla oficial 2026), con ejemplos de cada elemento', () => {
  assert.equal(elementValue(el('traveling'), 3, 3).total, 5.7); // Tr2: 4.5 + 1.2
  assert.equal(elementValue(el('traveling'), 3, -3).total, 3.3);
  assert.equal(elementValue(el('line'), 5, 3).total, 12.3); // L4: 9.3 + 3
  assert.equal(elementValue(el('line'), 4, -2).total, 5.7); // L3: 7.1 - 1.4
  assert.equal(elementValue(el('cluster'), 5, 3).total, 10.5); // ClSq4: 8.3 + 2.2
  assert.equal(elementValue(el('cluster'), 1, 1).total, 2.3);
  assert.equal(elementValue(el('cluster'), 2, 0).total, 3.5);
});

test('QOE 0 = valor base y el nivel 0 vale siempre 0', () => {
  for (const e of CATALOG) {
    e.levels.forEach((l, i) => assert.equal(elementValue(e, i, 0).total, l.base));
    for (const q of [-3, -1, 0, 2, 3]) assert.equal(elementValue(e, 0, q).total, 0);
  }
});

test('límites: nivel y QOE fuera de rango lanzan error', () => {
  assert.throws(() => elementValue(el('line'), 6, 0), RangeError);
  assert.throws(() => elementValue(el('line'), -1, 0), RangeError);
  assert.throws(() => elementValue(el('line'), 1.5, 0), RangeError);
  assert.throws(() => elementValue(el('line'), 1, 4), RangeError);
  assert.throws(() => elementValue(el('line'), 1, -4), RangeError);
  assert.throws(() => elementValue(el('line'), 1, 0.5), RangeError);
});

test('extra features del traveling: solo cuenta la mayor y se suma tras el QOE', () => {
  const tr = el('traveling');
  assert.equal(elementValue(tr, 3, 0, ['third-set']).total, 5); // 4.5 + 0.5
  assert.equal(elementValue(tr, 3, 1, ['third-set', 'mirror', 'change-formation']).total, 6.4); // 4.5 + 0.4 + 1.5
  assert.equal(elementValue(tr, 3, -3, ['crossing']).bonus, 2);
  assert.equal(elementValue(tr, 0, 0, ['crossing']).total, 0); // sin nivel no hay bonus
  assert.throws(() => elementValue(tr, 3, 0, ['inventada']), RangeError);
  assert.throws(() => elementValue(el('line'), 3, 0, ['mirror']), RangeError); // la línea no tiene extras
});

test('nivel de grupo derivado: traveling exige las 4, cluster y línea 3 de 4', () => {
  assert.equal(derivedGroupLevel(el('traveling'), [3, 3, 3, 3]), 3);
  assert.equal(derivedGroupLevel(el('traveling'), [4, 3, 3, 3]), 3);
  assert.equal(derivedGroupLevel(el('traveling'), [4, 4, 4, 1]), 1);
  assert.equal(derivedGroupLevel(el('traveling'), [4, 4, 4]), null); // faltan datos
  assert.equal(derivedGroupLevel(el('cluster'), [4, 4, 4, 1]), 4);
  assert.equal(derivedGroupLevel(el('cluster'), [4, 4, 2, 2]), 2);
  assert.equal(derivedGroupLevel(el('line'), [3, 3, 3, null]), 3);
  assert.equal(derivedGroupLevel(el('line'), [3, 3, null, null]), null);
  assert.equal(derivedGroupLevel(el('line'), [0, 0, 0, 0]), 0);
});

const s = (elemento: string, atleta: string | null, nivel: number | null, qoe = 0, extras: string[] = [], intento = 1): Score => ({
  elemento,
  intento, atleta, nivel, qoe, extras,
});

test('summarize: totales por patinadora, de grupo y técnico', () => {
  const scores = [
    s('cluster', null, null, 1), // nivel automático
    s('cluster', 'A', 3), s('cluster', 'B', 3), s('cluster', 'C', 3, 1), s('cluster', 'D', 1),
    s('traveling', null, 2, 0, ['mirror']), // nivel manual
    s('line', 'A', 2, -1),
  ];
  const r = summarize(scores, ATHLETES);
  assert.equal(att(r, 'cluster').derivedLevel, 3);
  assert.equal(att(r, 'cluster').groupLevelIsAuto, true);
  assert.equal(att(r, 'cluster').group?.total, 5.5); // índice 3 = ClSq2: 5 + 0.5
  assert.equal(att(r, 'traveling').groupLevelIsAuto, false);
  assert.equal(att(r, 'traveling').group?.total, 5); // índice 2 = Tr1: 3.5 + 1.5 (espejo)
  assert.equal(att(r, 'line').group, null); // sin fila de grupo no hay valor
  assert.equal(r.technicalTotal, 10.5);
  assert.equal(r.athleteTotals.A, 8.7); // cluster ClSq2 (5) + línea L1 con QOE -1 (4 - 0.3)
  assert.equal(r.athleteTotals.C, 5.5); // ClSq2 con QOE +1: 5 + 0.5
  assert.equal(r.athleteTotals.D, 2); // ClSqB
});

test('validateScore: rechaza datos fuera de catálogo', () => {
  assert.equal(validateScore(s('line', 'A', 3, 2)), null);
  assert.equal(validateScore(s('line', null, null, 0)), null);
  assert.ok(validateScore(s('foo', null, 1)));
  assert.ok(validateScore(s('line', 'A', null))); // la patinadora necesita nivel
  assert.ok(validateScore(s('line', 'A', 9)));
  assert.ok(validateScore(s('line', 'A', 1, 5)));
  assert.ok(validateScore(s('traveling', 'A', 1, 0, ['mirror']))); // extras solo en grupo
});

test('catálogo: valores base de la tabla oficial 2026 (contraste)', () => {
  const bases = (id: string) => el(id).levels.map(l => l.base);
  assert.deepEqual(bases('traveling'), [0, 2.5, 3.5, 4.5, 6, 6.5]);
  assert.deepEqual(bases('line'), [0, 3, 4, 5.5, 7.1, 9.3]);
  assert.deepEqual(bases('cluster'), [0, 2, 3.5, 5, 6.8, 8.3]);
});

test('summarize: nivel manual de grupo 0 manda sobre el derivado y vale 0', () => {
  const r = summarize([s('cluster', null, 0, 2), s('cluster', 'A', 5), s('cluster', 'B', 5), s('cluster', 'C', 5)], ATHLETES);
  assert.equal(att(r, 'cluster').derivedLevel, 5);
  assert.equal(att(r, 'cluster').groupLevel, 0);
  assert.equal(att(r, 'cluster').groupLevelIsAuto, false);
  assert.equal(att(r, 'cluster').group?.total, 0);
  assert.equal(r.technicalTotal, 0);
});

test('summarize: grupo con nivel null sin derivado pero con QOE no tiene valor', () => {
  const r = summarize([s('line', null, null, 2), s('line', 'A', 3)], ATHLETES);
  assert.equal(att(r, 'line').derivedLevel, null);
  assert.equal(att(r, 'line').group, null);
  assert.equal(r.technicalTotal, 0);
  assert.equal(r.ignored, 0);
});

test('bonus con QOE negativo: el bonus es fijo y no se reduce', () => {
  const v = elementValue(el('traveling'), 3, -3, ['crossing']); // 4.5 - 1.2 + 2
  assert.equal(v.total, 5.3);
  assert.equal(v.qoe, -1.2);
  assert.equal(v.bonus, 2);
});

test('summarize: ignora filas inválidas sin lanzar y las cuenta', () => {
  const scores = [
    s('line', null, 99), // nivel fuera del catálogo
    s('traveling', null, 2, 0, ['inventada']), // extra inexistente
    s('line', 'A', 1, 7), // QOE fuera de rango
    s('foo', null, 1), // elemento desconocido
    s('cluster', null, 2), // válida
  ];
  const r = summarize(scores, ATHLETES);
  assert.equal(r.ignored, 4);
  assert.equal(att(r, 'line').group, null);
  assert.equal(att(r, 'traveling').group, null);
  assert.equal(att(r, 'cluster').group?.total, 3.5);
  assert.equal(r.technicalTotal, 3.5);
});

// --- validateScore con patinadoras conocidas ---
test('validateScore: la patinadora debe estar en la lista; summarize cuenta las desconocidas como ignoradas', () => {
  assert.equal(validateScore(s('line', 'A', 3), ATHLETES), null);
  assert.ok(validateScore(s('line', 'Z', 3), ATHLETES));
  assert.equal(validateScore(s('line', null, null), ATHLETES), null);
  const r = summarize([s('line', 'Z', 3), s('line', 'A', 3)], ATHLETES);
  assert.equal(r.ignored, 1);
});

// --- store: mapeo fila ↔ Score ---
test('store: "" ↔ null (grupo), extras null y filtrado de filas inválidas', () => {
  assert.deepEqual(toScore({ elemento: 'line', intento: 1, atleta: '', nivel: null, qoe: 1, extras: null }), s('line', null, null, 1));
  assert.equal(toScore({ elemento: 'line', intento: null, atleta: '', nivel: null, qoe: 0, extras: [] }).intento, 1); // filas antiguas
  assert.equal(toScore({ elemento: 'line', intento: 2, atleta: 'A', nivel: 2, qoe: 0, extras: [] }).intento, 2);
  assert.deepEqual(toDbRow('sid', s('line', null, null, 1)), { sesion_id: 'sid', elemento: 'line', intento: 1, atleta: '', nivel: null, qoe: 1, extras: [] });
  assert.equal(toDbRow('sid', s('line', 'A', 2, 0, [], 3)).intento, 3);
  assert.equal(toDbRow('sid', s('line', 'A', 2)).atleta, 'A');
  const { scores, invalid } = splitRows(
    [
      { elemento: 'line', intento: 1, atleta: '', nivel: 2, qoe: 0, extras: [] },
      { elemento: 'line', intento: 1, atleta: 'A', nivel: 2, qoe: 0, extras: null },
      { elemento: 'line', intento: 1, atleta: 'Z', nivel: 2, qoe: 0, extras: [] }, // atleta desconocida
      { elemento: 'foo', intento: 1, atleta: '', nivel: 1, qoe: 0, extras: [] }, // elemento desconocido
      { elemento: 'line', intento: 1, atleta: 'B', nivel: null, qoe: 0, extras: [] }, // sin nivel
    ],
    ATHLETES
  );
  assert.equal(scores.length, 2);
  assert.deepEqual(invalid.map(x => x.atleta), ['Z', null, 'B']);
});

// --- cola de escrituras ---
type Row = { elemento: string; intento: number; atleta: string | null; v: number };
const row = (atleta: string | null, v: number, intento = 1): Row => ({ elemento: 'line', intento, atleta, v });
const setRow = (list: Row[], next: Row) => [
  ...list.filter(x => !(x.elemento === next.elemento && x.intento === next.intento && x.atleta === next.atleta)),
  next,
];

function harness(initial: Row[] = []) {
  const st = { session: 's1' as string | null, confirmed: initial, screen: initial, errors: 0 };
  const mutate = createWriteQueue<Row>({
    getSession: () => st.session,
    getConfirmed: () => st.confirmed,
    setConfirmed: l => { st.confirmed = l; },
    applyLocal: fn => { st.screen = fn(st.screen); },
    onError: () => { st.errors++; },
  });
  const edit = (next: Row, write: () => Promise<void>, sid = 's1') =>
    mutate(sid, next.elemento, [{ intento: next.intento, atleta: next.atleta }], l => setRow(l, next), write, l => setRow(l, next));
  return { st, edit };
}
const ok = () => Promise.resolve();
const ko = () => Promise.reject(new Error('fallo'));
const val = (st: { screen: Row[] }, a: string | null, intento = 1) => st.screen.find(x => x.atleta === a && x.intento === intento)?.v;

test('cola: A falla y B (misma fila) va detrás -> se revierte a lo confirmado solo si nadie la tocó después', async () => {
  const { st, edit } = harness([row('A', 1)]);
  const order: string[] = [];
  const pa = edit(row('A', 2), async () => { order.push('A'); throw new Error('x'); });
  const pb = edit(row('A', 3), async () => { order.push('B'); });
  await Promise.all([pa, pb]);
  assert.deepEqual(order, ['A', 'B']); // en orden
  assert.equal(val(st, 'A'), 3); // B es más reciente: el fallo de A no pisa la pantalla
  assert.equal(st.errors, 1);
  assert.equal(st.confirmed.find(x => x.atleta === 'A')?.v, 3);
});

test('cola: A éxito y B falla -> vuelve al valor de A', async () => {
  const { st, edit } = harness([row('A', 1)]);
  const pa = edit(row('A', 2), ok);
  const pb = edit(row('A', 3), ko);
  assert.equal(val(st, 'A'), 3); // optimista
  await Promise.all([pa, pb]);
  assert.equal(val(st, 'A'), 2);
  assert.equal(st.errors, 1);
});

test('cola: un fallo único revierte a lo confirmado y no toca otras filas', async () => {
  const { st, edit } = harness([row('A', 1), row('B', 5)]);
  await edit(row('A', 2), ko);
  assert.equal(val(st, 'A'), 1);
  assert.equal(val(st, 'B'), 5);
});

test('cola: cambio de sesión descarta lo pendiente (ni pantalla ni confirmado ni error)', async () => {
  const { st, edit } = harness([row('A', 1)]);
  const pa = edit(row('A', 2), ko);
  const pb = edit(row('B', 7), ok);
  st.session = 's2'; // el usuario cambia de sesión con escrituras en vuelo
  st.screen = [row('A', 9)];
  st.confirmed = [row('A', 9)];
  await Promise.all([pa, pb]);
  assert.deepEqual(st.screen, [row('A', 9)]);
  assert.deepEqual(st.confirmed, [row('A', 9)]);
  assert.equal(st.errors, 0);
  // y una edición de una sesión que ya no es la vigente no toca la pantalla
  await edit(row('A', 4), ok, 's1');
  assert.deepEqual(st.screen, [row('A', 9)]);
});

test('cola: si el handler de éxito lanza, la cadena sigue y la siguiente escritura se ejecuta', async () => {
  const errs: unknown[] = [];
  const mutate = createWriteQueue<Row>({
    getSession: () => 's1',
    getConfirmed: () => [],
    setConfirmed: () => { throw new Error('boom'); },
    applyLocal: () => {},
    onError: e => { errs.push(e); },
  });
  const ran: number[] = [];
  const p1 = mutate('s1', 'line', [{ intento: 1, atleta: 'A' }], l => l, async () => { ran.push(1); }, l => l);
  const p2 = mutate('s1', 'line', [{ intento: 1, atleta: 'A' }], l => l, async () => { ran.push(2); }, l => l);
  await Promise.all([p1, p2]);
  assert.deepEqual(ran, [1, 2]);
  assert.equal(errs.length, 2);
  assert.equal(mutate.pending(), 0);
});

test('cola: pending e idle reflejan las escrituras en curso', async () => {
  const seen: number[] = [];
  const mutate = createWriteQueue<Row>({
    getSession: () => 's1', getConfirmed: () => [], setConfirmed: () => {}, applyLocal: () => {}, onError: () => {},
    onPending: n => { seen.push(n); },
  });
  const p = mutate('s1', 'line', [{ intento: 1, atleta: 'A' }], l => l, ko, l => l);
  assert.equal(mutate.pending(), 1);
  await mutate.idle();
  await p;
  assert.equal(mutate.pending(), 0);
  assert.deepEqual(seen, [1, 0]);
});

// --- intentos ---
test('intentos: el total técnico cuenta el mejor intento de cada elemento', () => {
  const r = summarize(
    [
      s('cluster', null, 3, 0, [], 1), // ClSq2: 5
      s('cluster', null, 4, 1, [], 2), // ClSq3 +1: 6.8 + 0.7 = 7.5  <- mejor
      s('cluster', null, 2, 0, [], 3), // ClSq1: 3.5
      s('line', null, 2, 0, [], 1), // L1: 4
    ],
    ATHLETES
  );
  assert.deepEqual(r.elements.cluster.list, [1, 2, 3]);
  assert.equal(r.elements.cluster.best, 2);
  assert.equal(r.elements.cluster.bestValue?.total, 7.5);
  assert.equal(att(r, 'cluster', 1).group?.total, 5);
  assert.equal(r.technicalTotal, 11.5); // 7.5 + 4, sin sumar los demás intentos
});

test('intentos: en un empate cuenta el intento posterior; un intento sin grupo no cuenta', () => {
  const r = summarize([s('line', null, 3, 0, [], 1), s('line', null, 3, 0, [], 2), s('line', 'A', 5, 0, [], 3)], ATHLETES);
  assert.equal(r.elements.line.best, 2);
  assert.deepEqual(r.elements.line.list, [1, 2, 3]);
  assert.equal(att(r, 'line', 3).group, null); // solo hay una patinadora: sin fila de grupo
  assert.equal(r.technicalTotal, 5.5);
});

test('intentos: el nivel automático y el valor individual se calculan por intento', () => {
  const r = summarize(
    [
      s('cluster', 'A', 5, 0, [], 1), s('cluster', 'B', 5, 0, [], 1), s('cluster', 'C', 5, 0, [], 1), // nivel 5 en el intento 1
      s('cluster', 'A', 2, 0, [], 2), s('cluster', 'B', 2, 0, [], 2), s('cluster', 'C', 2, 0, [], 2), // nivel 2 en el intento 2
    ],
    ATHLETES
  );
  assert.equal(att(r, 'cluster', 1).derivedLevel, 5);
  assert.equal(att(r, 'cluster', 2).derivedLevel, 2);
  // totales individuales: su mejor valor del elemento, no la suma de intentos
  assert.equal(r.athleteTotals.A, 8.3);
  assert.equal(r.athleteTotals.D, 0);
});

test('intentos: validateScore acota el número de intento', () => {
  assert.equal(validateScore(s('line', 'A', 3, 0, [], MAX_ATTEMPTS)), null);
  assert.ok(validateScore(s('line', 'A', 3, 0, [], 0)));
  assert.ok(validateScore(s('line', 'A', 3, 0, [], MAX_ATTEMPTS + 1)));
  assert.ok(validateScore(s('line', 'A', 3, 0, [], 1.5)));
  // una fila con intento absurdo se ignora, no rompe
  assert.equal(summarize([s('line', 'A', 3, 0, [], 99)], ATHLETES).ignored, 1);
});

test('cola: los intentos son filas independientes (el fallo del 2 no toca el 1)', async () => {
  const { st, edit } = harness([row('A', 1, 1), row('A', 10, 2)]);
  await edit(row('A', 11, 2), ko);
  assert.equal(val(st, 'A', 2), 10); // revertido
  assert.equal(val(st, 'A', 1), 1); // intacto
  await edit(row('A', 2, 1), ok);
  assert.equal(val(st, 'A', 1), 2);
  assert.equal(val(st, 'A', 2), 10);
});
