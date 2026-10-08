// Pruebas de la mutación inversa (rollback/deshacer): node:test + tsx.   npx tsx --test scripts/test-routine.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inverseMutation } from '../lib/routine';
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
