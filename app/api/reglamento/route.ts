import Anthropic from '@anthropic-ai/sdk';
import { ask } from '../../../lib/rag/ask';
import { allowRequest, cacheGet, cacheKey, cacheSet } from '../../../lib/rag/guard';
import { MODES, type AskResult, type Mode } from '../../../lib/rag/types';

export const dynamic = 'force-dynamic';

const MAX_QUESTION = 500;
const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  // Código de acceso opcional: protege el gasto de la API si la app es pública.
  const code = process.env.REGLAMENTO_ACCESS_CODE;
  if (code && request.headers.get('x-access-code') !== code) {
    return json({ error: 'codigo', message: 'Código de acceso incorrecto.' }, 401);
  }

  let body: { question?: unknown; mode?: unknown };
  try {
    body = await request.json();
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

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
  const key = cacheKey(mode, question);
  const cached = cacheGet<AskResult>(key);
  if (cached) return json({ ...cached, cached: true });

  if (needsLlm && !allowRequest(ip)) {
    return json({ error: 'limite', message: 'Has hecho muchas consultas. Inténtalo de nuevo más tarde.' }, 429);
  }

  try {
    const result = await ask(question, mode);
    // Solo se cachean respuestas completas y con cita (o búsquedas), nunca errores ni avisos.
    if (!result.warning) cacheSet(key, result);
    return json(result);
  } catch (e) {
    // Sin datos sensibles: solo el tipo, el estado HTTP y el mensaje del error.
    console.error('[reglamento]', e instanceof Error ? e.name : typeof e, (e as { status?: number }).status ?? '', e instanceof Error ? e.message.slice(0, 300) : '');
    if (e instanceof Anthropic.RateLimitError) {
      return json({ error: 'ocupado', message: 'El servicio está saturado. Inténtalo en un momento.' }, 429);
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return json({ error: 'sin_clave', message: 'La clave de la API no es válida.' }, 503);
    }
    if (e instanceof Anthropic.APIError) {
      return json({ error: 'api', message: 'No se pudo consultar a Claude ahora mismo.' }, 502);
    }
    const message = e instanceof Error && e.message.startsWith('Falta la base') ? e.message : 'Error interno.';
    return json({ error: 'interno', message }, 500);
  }
}
