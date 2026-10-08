// Pruebas de la lógica de acceso del entrenador: node:test + tsx.   (npm test las recoge solas)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyCoachCheck, loginErrorMessage } from '../lib/coach';

test('classifyCoachCheck: solo true es entrenador', () => {
  assert.equal(classifyCoachCheck({ data: true, error: null }), 'coach');
  assert.equal(classifyCoachCheck({ data: false, error: null }), 'denied');
  assert.equal(classifyCoachCheck({ data: null, error: null }), 'denied');
  assert.equal(classifyCoachCheck({ data: 'true', error: null }), 'denied');
});

test('classifyCoachCheck: función ausente = unavailable; otros errores = network', () => {
  assert.equal(classifyCoachCheck({ data: null, error: { code: '42883' } }), 'unavailable');
  assert.equal(classifyCoachCheck({ data: null, error: { code: 'PGRST202' } }), 'unavailable');
  assert.equal(classifyCoachCheck({ data: null, error: { message: 'TimeoutError' } }), 'network');
  assert.equal(classifyCoachCheck({ data: null, error: { code: '57014' } }), 'network');
});

test('loginErrorMessage: mensajes en español', () => {
  assert.match(loginErrorMessage({ message: 'Invalid login credentials' }), /incorrectos/);
  assert.match(loginErrorMessage({ message: 'Email not confirmed' }), /confirmar/);
  assert.match(loginErrorMessage({ message: 'x', status: 429 }), /intentos/);
  assert.match(loginErrorMessage({ message: 'fetch failed' }), /conexión/);
  assert.match(loginErrorMessage(null), /conexión/);
});
