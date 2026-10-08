// Pruebas del RAG: node:test + tsx.   npm run test:rag
// - Recuperación sobre los documentos reales (necesita data/regulation/chunks.json).
// - Flujo de respuesta con un cliente de Claude simulado (no gasta API).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { ask, parseAnswer, type AskDeps } from '../lib/rag/ask';
import { acquireSlot, allowRequest, authBlocked, cacheGet, cacheSet, clientKey, currentDay, recordAuthFailure, refundRequest, releaseSlot, resetGuards } from '../lib/rag/guard';
import { Bm25Index } from '../lib/rag/bm25';
import { retrieve } from '../lib/rag/retrieve';
import { queryTokens, tokenize } from '../lib/rag/text';
import type { Hit } from '../lib/rag/types';

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
const hasData = existsSync('data/regulation/chunks.json');

test('tokenize: sin acentos, sin palabras vacías, con raíz', () => {
  assert.deepEqual(tokenize('Las penalizaciones del Árbitro'), ['penalizacion', 'arbitro']);
});

test('tokenize: singular y plural comparten raíz', () => {
  for (const [a, b] of [['rule', 'rules'], ['judge', 'judges'], ['score', 'scores'], ['penalty', 'penalties'], ['box', 'boxes'], ['score', 'scored']]) {
    assert.deepEqual(tokenize(a), tokenize(b), `${a} / ${b}`);
  }
});

test('queryTokens: juez/jueces encuentran «judges»', () => {
  const idx = new Bm25Index([tokenize('the judges panel'), tokenize('music time limit')]);
  for (const q of ['juez', 'jueces']) assert.equal(idx.search(queryTokens(q), 2)[0]?.index, 0, q);
});

test('queryTokens: formas verbales del glosario (caer, durar)', () => {
  assert.ok(queryTokens('¿Qué pasa si se cae una patinadora?').includes('fall'));
  assert.ok(queryTokens('¿Cuánto puede durar el programa?').includes('duration'));
});

test('queryTokens: traduce palabras clave del glosario', () => {
  const t = queryTokens('¿Qué penalización hay por una caída?');
  assert.ok(t.includes('penalty') && t.includes('fall'));
});

test('BM25 ordena por relevancia', () => {
  const idx = new Bm25Index([tokenize('costume rules for skaters'), tokenize('music time limit'), tokenize('costume')]);
  const [first] = idx.search(tokenize('costume'), 3);
  assert.equal(first.index, 2);
});

test('guard: clave de cliente ignora x-forwarded-for por defecto', () => {
  const h = new Headers({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' });
  delete process.env.REGLAMENTO_TRUSTED_PROXY_HOPS;
  assert.equal(clientKey(h), 'directo');
  process.env.REGLAMENTO_TRUSTED_PROXY_HOPS = '1';
  assert.equal(clientKey(h), '8.8.8.8');
  delete process.env.REGLAMENTO_TRUSTED_PROXY_HOPS;
});

test('guard: devolución, concurrencia y fallos de acceso', () => {
  resetGuards();
  process.env.REGLAMENTO_HOURLY_LIMIT = '1';
  assert.ok(allowRequest('a'));
  refundRequest('a');
  assert.ok(allowRequest('a'));
  delete process.env.REGLAMENTO_HOURLY_LIMIT;
  assert.ok(acquireSlot() && acquireSlot() && acquireSlot());
  assert.equal(acquireSlot(), false);
  releaseSlot();
  assert.ok(acquireSlot());
  for (let i = 0; i < 10; i++) recordAuthFailure('x');
  assert.ok(authBlocked('x'));
  assert.equal(authBlocked('y'), false);
  resetGuards();
});

test('guard: refundRequest no toca el cupo de otro día y no deja listas vacías', () => {
  resetGuards();
  process.env.REGLAMENTO_DAILY_LIMIT = '2';
  const t0 = Date.now();
  assert.ok(allowRequest('a', t0));
  const day = currentDay();
  assert.ok(allowRequest('b', t0 + 25 * 3_600_000)); // nuevo día: dayCount = 1
  refundRequest('a', day); // reserva del día anterior: no resta
  assert.ok(allowRequest('c', t0 + 25 * 3_600_000)); // dayCount = 2
  assert.equal(allowRequest('d', t0 + 25 * 3_600_000), false);
  delete process.env.REGLAMENTO_DAILY_LIMIT;
  resetGuards();
});

test('guard: los fallos de acceso de otros no impiden el código correcto', () => {
  resetGuards();
  for (let i = 0; i < 15; i++) recordAuthFailure('directo');
  assert.ok(authBlocked('directo')); // la ruta solo consulta esto tras un código incorrecto
  resetGuards();
});

test('guard: límite por IP y caché', () => {
  resetGuards();
  process.env.REGLAMENTO_HOURLY_LIMIT = '2';
  assert.ok(allowRequest('1.1.1.1') && allowRequest('1.1.1.1'));
  assert.equal(allowRequest('1.1.1.1'), false);
  assert.ok(allowRequest('2.2.2.2'));
  cacheSet('k', { a: 1 });
  assert.deepEqual(cacheGet('k'), { a: 1 });
  delete process.env.REGLAMENTO_HOURLY_LIMIT;
});

const cases: [string, RegExp][] = [
  ['¿Cuánto puede durar el programa de un cuarteto?', /4 REQUIREMENTS/], // la duración del programa está en 4.1-4.3,
  ['¿Qué pasa si se cae una patinadora?', /FALL|QOE|PENALIZATIONS/],
  ['¿Qué requisitos tiene el vestuario?', /COSTUME/],
  ['¿Qué es el elemento canon?', /CANON/],
  ['¿Cuántos elementos tiene que hacer un cuarteto junior?', /JUNIOR QUARTETS/],
  ['¿Qué penalización hay por una caída?', /PENALIZATIONS/],
];
for (const [question, expected] of cases) {
  test(`recuperación: ${question}`, { skip: !hasData }, async () => {
    const { hits } = await retrieve(question, 5);
    assert.ok(hits.some(h => expected.test(h.chunk.section)), hits.map(h => h.chunk.section).join(' | '));
  });
}

const fakeHits: Hit[] = [0, 1].map(i => ({
  score: 1,
  chunk: {
    id: `q-${i}`,
    docId: 'quartets',
    docTitle: 'Quartets Rules',
    section: `3.${i + 1} X`,
    pageStart: 6,
    pageEnd: 6 + i,
    text: 'texto',
  },
}));

const message = (content: unknown[], stop_reason = 'end_turn') => ({ content, stop_reason }) as unknown as BetaMessage;
const cited = (text: string, idx: number) => ({
  type: 'text',
  text,
  citations: [{ type: 'char_location', document_index: idx, cited_text: 'literal', start_char_index: 0, end_char_index: 7 }],
});

test('parseAnswer: numera fuentes por orden de aparición y descarta índices inválidos', () => {
  const { segments, sources } = parseAnswer(
    message([cited('A. ', 1), cited('B. ', 0), cited('C. ', 1), cited('D.', 9), { type: 'text', text: ' E' }]),
    fakeHits
  );
  assert.deepEqual(segments.map(s => s.refs), [[1], [2], [1], [], []]);
  assert.deepEqual(sources.map(s => s.chunkId), ['q-1', 'q-0']);
  assert.equal(sources[0].quote, 'literal');
});

const withDeps = (msg: BetaMessage): AskDeps => ({
  rewrite: async () => '',
  generate: async () => msg,
});

test('ask: con el presupuesto agotado no llama a generate', { skip: !hasData }, async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const ctrl = new AbortController();
  ctrl.abort();
  let called = false;
  const deps: AskDeps = { rewrite: async () => '', generate: async () => ((called = true), message([])) };
  await assert.rejects(ask('¿Qué es el elemento canon?', 'breve', deps, ctrl.signal));
  assert.equal(called, false);
});

test('ask: respuesta con citas no genera aviso', { skip: !hasData }, async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const r = await ask('¿Qué es el elemento canon?', 'experto', withDeps(message([cited('Es...', 0)])));
  assert.equal(r.warning, undefined);
  assert.equal(r.sources.length, 1);
});

test('ask: sin citas y sin «no aparece» → aviso sin_citas', { skip: !hasData }, async () => {
  const r = await ask('¿Qué es el elemento canon?', 'breve', withDeps(message([{ type: 'text', text: 'Es un elemento.' }])));
  assert.equal(r.warning, 'sin_citas');
});

test('ask: «No aparece en el reglamento» sin citas es válido', { skip: !hasData }, async () => {
  const r = await ask('¿Qué es el elemento canon?', 'breve', withDeps(message([{ type: 'text', text: 'No aparece en los fragmentos del reglamento consultados.' }])));
  assert.equal(r.warning, undefined);
});

test('ask: rechazo y truncado se señalan', { skip: !hasData }, async () => {
  const a = await ask('¿Qué es el elemento canon?', 'breve', withDeps(message([cited('x', 0)], 'refusal')));
  const b = await ask('¿Qué es el elemento canon?', 'breve', withDeps(message([cited('x', 0)], 'max_tokens')));
  assert.equal(a.warning, 'rechazada');
  assert.equal(b.warning, 'truncada');
});

test('ask: modo buscar no llama al modelo', { skip: !hasData }, async () => {
  const r = await ask('vestuario', 'buscar', {
    rewrite: async () => assert.fail('no debe reformular'),
    generate: async () => assert.fail('no debe generar'),
  });
  assert.equal(r.answer, null);
  assert.ok(r.passages.length > 0);
});
