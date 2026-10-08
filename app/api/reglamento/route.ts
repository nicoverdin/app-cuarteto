import { createHash, timingSafeEqual } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { ask } from '../../../lib/rag/ask';
import {
  acquireSlot,
  allowRequest,
  authBlocked,
  cacheGet,
  cacheKey,
  cacheSet,
  clientKey,
  inflight,
  recordAuthFailure,
  refundRequest,
  releaseSlot,
} from '../../../lib/rag/guard';
import { MODES, type AskResult, type Mode } from '../../../lib/rag/types';

export const dynamic = 'force-dynamic';
// Tiempo máximo de la función: el cliente de Claude tarda como mucho ~45 s por intento (1 reintento).
export const maxDuration = 100;

const MAX_QUESTION = 500;
const MAX_BODY = 4096;
const json = (body: unknown, status = 200) => Response.json(body, { status });

// Comparación en tiempo constante: se comparan los hashes, que siempre miden lo mismo.
const sha = (v: string) => createHash('sha256').update(v).digest();
const sameCode = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

export async function POST(request: Request) {
  const client = clientKey(request.headers);

  // Código de acceso: protege el gasto de la API si la app es pública. Sin código la ruta queda abierta
  // (comportamiento por defecto), salvo que REGLAMENTO_REQUIRE_ACCESS_CODE=true.
  const code = process.env.REGLAMENTO_ACCESS_CODE;
  if (!code && process.env.REGLAMENTO_REQUIRE_ACCESS_CODE === 'true') {
    console.error('[reglamento] REGLAMENTO_REQUIRE_ACCESS_CODE=true pero no hay REGLAMENTO_ACCESS_CODE');
    return json({ error: 'sin_codigo', message: 'La consulta no está disponible ahora mismo.' }, 503);
  }
  if (code) {
    if (authBlocked(client)) {
      return json({ error: 'limite', message: 'Demasiados intentos. Inténtalo de nuevo más tarde.' }, 429);
    }
    if (!sameCode(request.headers.get('x-access-code') ?? '', code)) {
      recordAuthFailure(client);
      return json({ error: 'codigo', message: 'Código de acceso incorrecto.' }, 401);
    }
  }

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return json({ error: 'peticion', message: 'Petición demasiado grande.' }, 413);

  let body: { question?: unknown; mode?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'peticion', message: 'Petición demasiado grande.' }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('no es un objeto');
    body = parsed;
  } catch {
    return json({ error: 'peticion', message: 'Petición no válida.' }, 400);
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const mode = body.mode as Mode;
  if (question.length < 3 || question.length > MAX_QUESTION || !MODES.includes(mode)) {
    return json({ error: 'peticion', message: `Escribe una pregunta de 3 a ${MAX_QUESTION} caracteres.` }, 400);
  }

  const needsLlm = mode !== 'buscar';
  if (needsLlm && !process.env.ANTHROPIC_API_KEY) {
    return json(
      { error: 'sin_clave', message: 'La consulta con IA no está configurada todavía. Prueba el modo «Solo buscar».' },
      503
    );
  }

  const key = cacheKey(mode, question);
  const cached = cacheGet<AskResult>(key);
  if (cached) return json({ ...cached, cached: true });

  // Pregunta idéntica ya en curso: se comparte su resultado sin gastar otra consulta.
  let promise = inflight.get(key) as Promise<AskResult> | undefined;
  const owner = !promise;
  if (!promise) {
    if (needsLlm) {
      if (!allowRequest(client)) {
        return json({ error: 'limite', message: 'Has hecho muchas consultas. Inténtalo de nuevo más tarde.' }, 429);
      }
      if (!acquireSlot()) {
        refundRequest(client);
        return json({ error: 'ocupado', message: 'Hay muchas consultas a la vez. Inténtalo en unos segundos.' }, 429);
      }
    }
    promise = ask(question, mode).finally(() => {
      inflight.delete(key);
      if (needsLlm) releaseSlot();
    });
    inflight.set(key, promise);
  }

  // Devuelve la consulta si el fallo es nuestro (5xx), para que no gaste el cupo del cliente.
  const fail = (body: unknown, status: number) => {
    if (owner && needsLlm && status >= 500) refundRequest(client);
    return json(body, status);
  };

  try {
    const result = await promise;
    // Solo se cachean respuestas completas y con cita (o búsquedas), nunca errores ni avisos.
    if (owner && !result.warning) cacheSet(key, result);
    return json(result);
  } catch (e) {
    // Sin datos sensibles: solo el tipo, el estado HTTP y el mensaje del error.
    console.error('[reglamento]', e instanceof Error ? e.name : typeof e, (e as { status?: number }).status ?? '', e instanceof Error ? e.message.slice(0, 300) : '');
    if (e instanceof Anthropic.RateLimitError) {
      return fail({ error: 'ocupado', message: 'El servicio está saturado. Inténtalo en un momento.' }, 429);
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return fail({ error: 'sin_clave', message: 'La clave de la API no es válida.' }, 503);
    }
    if (e instanceof Anthropic.APIError) {
      return fail({ error: 'api', message: 'No se pudo consultar a Claude ahora mismo.' }, 502);
    }
    if (e instanceof Error && e.message.startsWith('Falta la base')) {
      return fail({ error: 'sin_indice', message: 'La base de conocimientos del reglamento no está disponible.' }, 503);
    }
    return fail({ error: 'interno', message: 'Error interno.' }, 500);
  }
}
