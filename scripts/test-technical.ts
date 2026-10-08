// Pruebas del cálculo técnico: node:test + tsx. (Índice de nivel: 0 = sin nivel, 1 = Base, 2 = L1 …)   npm run test:technical
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, getElement } from '../lib/technical/catalog';
import { derivedGroupLevel, elementValue, summarize, validateScore, type Score } from '../lib/technical/score';

const el = (id: string) => getElement(id)!;
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

const s = (elemento: string, atleta: string | null, nivel: number | null, qoe = 0, extras: string[] = []): Score => ({
  elemento, atleta, nivel, qoe, extras,
});

test('summarize: totales por patinadora, de grupo y técnico', () => {
  const scores = [
    s('cluster', null, null, 1), // nivel automático
    s('cluster', 'A', 3), s('cluster', 'B', 3), s('cluster', 'C', 3, 1), s('cluster', 'D', 1),
    s('traveling', null, 2, 0, ['mirror']), // nivel manual
    s('line', 'A', 2, -1),
  ];
  const r = summarize(scores, ATHLETES);
  assert.equal(r.elements.cluster.derivedLevel, 3);
  assert.equal(r.elements.cluster.groupLevelIsAuto, true);
  assert.equal(r.elements.cluster.group?.total, 5.5); // índice 3 = ClSq2: 5 + 0.5
  assert.equal(r.elements.traveling.groupLevelIsAuto, false);
  assert.equal(r.elements.traveling.group?.total, 5); // índice 2 = Tr1: 3.5 + 1.5 (espejo)
  assert.equal(r.elements.line.group, null); // sin fila de grupo no hay valor
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
