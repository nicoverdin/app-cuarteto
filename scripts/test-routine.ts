// Pruebas de la mutación inversa (rollback/deshacer): node:test + tsx.   npx tsx --test scripts/test-routine.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inverseMutation, isAbortError, isOlderOrEqual, parseServerDate, rebuildFromConfirmed, type Mutation } from '../lib/routine';
import type { RoutinePart } from '../types';

const c = (id: string, status: 'red' | 'yellow' | 'green' | 'pink' = 'red') => ({ id, text: id, status });
const part = (...ids: string[]): RoutinePart[] => [{ id: 'p', name: 'P', corrections: ids.map(i => c(i)) }];
const ids = (r: RoutinePart[]) => r[0].corrections.map(x => x.id);

test('deshacer un borrado lo reinserta en su sitio sin tocar cambios ajenos', () => {
  const before = part('a', 'b', 'c');
  const after = part('a', 'c');
  const current = part('a', 'c', 'x'); // otro cambio añadió x
  assert.deepEqual(ids(inverseMutation(before, after)(current)), ['a', 'b', 'c', 'x']);
});

test('deshacer una adición solo quita lo añadido', () => {
  const before = part('a');
  const after = part('a', 'n');
  const current = part('z', 'a', 'n');
  assert.deepEqual(ids(inverseMutation(before, after)(current)), ['z', 'a']);
});

test('deshacer un cambio de estado restaura solo esa corrección', () => {
  const before = part('a', 'b');
  const after = [{ id: 'p', name: 'P', corrections: [c('a', 'green'), c('b')] }];
  const current = [{ id: 'p', name: 'P', corrections: [c('a', 'green'), c('b', 'pink')] }];
  const r = inverseMutation(before, after)(current);
  assert.deepEqual(r[0].corrections.map(x => x.status), ['red', 'pink']);
});

test('deshacer un reordenado recupera el orden anterior', () => {
  const r = inverseMutation(part('a', 'b', 'c'), part('c', 'a', 'b'))(part('c', 'a', 'b'));
  assert.deepEqual(ids(r), ['a', 'b', 'c']);
});

// Simula la cola: estado visible optimista + confirmado + mutaciones pendientes, como en ClientPage.
const setStatus = (status: 'red' | 'yellow' | 'green' | 'pink'): Mutation => r =>
  r.map(p => ({ ...p, corrections: p.corrections.map(x => (x.id === 'a' ? { ...x, status } : x)) }));
const status = (r: RoutinePart[]) => r[0].corrections[0].status;

test('A→B→C con ambos guardados fallando vuelve al estado confirmado A', () => {
  const confirmed = part('a'); // rojo
  const muts = [setStatus('yellow'), setStatus('green')];
  assert.equal(status(rebuildFromConfirmed(confirmed, muts)), 'green'); // visible optimista
  // falla el primero: queda el segundo aún en cola
  assert.equal(status(rebuildFromConfirmed(confirmed, muts.slice(1))), 'green');
  // falla también el segundo: nada pendiente
  assert.equal(status(rebuildFromConfirmed(confirmed, [])), 'red');
});

test('éxito del primero y fallo del segundo deja el valor guardado del primero', () => {
  const confirmed = setStatus('yellow')(part('a')); // el primero se guardó
  assert.equal(status(rebuildFromConfirmed(confirmed, [])), 'yellow');
});

test('fallo del primero con el segundo pendiente conserva el segundo', () => {
  const confirmed = part('a');
  assert.equal(status(rebuildFromConfirmed(confirmed, [setStatus('pink')])), 'pink');
});

test('fechas de Postgres con espacio y offset corto se normalizan', () => {
  assert.equal(parseServerDate('2026-10-08 10:34:30+00'), Date.parse('2026-10-08T10:34:30+00:00'));
  assert.equal(parseServerDate('2026-10-08T10:34:30.123Z'), Date.parse('2026-10-08T10:34:30.123Z'));
  assert.ok(Number.isNaN(parseServerDate('basura')));
  assert.equal(parseServerDate('2026-10-08'), Date.parse('2026-10-08T00:00:00Z'));
  assert.equal(parseServerDate('2026-10-08 10:34:30-05'), Date.parse('2026-10-08T10:34:30-05:00'));
  assert.ok(isAbortError(Object.assign(new Error('x'), { name: 'TimeoutError' })));
  assert.ok(isAbortError({ message: 'AbortError: The user aborted a request.' }));
  assert.ok(!isAbortError(new Error('No se pudo guardar')));
  assert.equal(isOlderOrEqual('2026-10-08 10:34:30+00', '2026-10-08T10:34:31Z'), true);
  assert.equal(isOlderOrEqual('basura', '2026-10-08T10:34:31Z'), false);
});
