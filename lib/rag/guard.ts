// Protecciones en memoria (un solo proceso): la ruta gasta dinero en cada pregunta, y la app es pública.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const perIp = new Map<string, number[]>();
let dayStart = Date.now();
let dayCount = 0;

const num = (v: string | undefined, d: number) => (v && Number.isFinite(+v) && +v > 0 ? +v : d);

/** true si la petición puede continuar. Límite por IP y hora, y límite global diario. */
export function allowRequest(ip: string, now = Date.now()): boolean {
  const perHour = num(process.env.REGLAMENTO_HOURLY_LIMIT, 20);
  const perDay = num(process.env.REGLAMENTO_DAILY_LIMIT, 300);

  if (now - dayStart > DAY) {
    dayStart = now;
    dayCount = 0;
  }
  const recent = (perIp.get(ip) ?? []).filter(t => now - t < HOUR);
  if (recent.length >= perHour || dayCount >= perDay) {
    perIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  perIp.set(ip, recent);
  dayCount++;
  if (perIp.size > 5000) perIp.clear(); // evita crecer sin límite
  return true;
}

// Caché de preguntas frecuentes (misma pregunta y modo → misma respuesta durante 24 h).
const cache = new Map<string, { at: number; value: unknown }>();
const MAX_CACHE = 200;

export const cacheKey = (mode: string, question: string) =>
  `${mode}|${question.trim().toLowerCase().replace(/\s+/g, ' ')}`;

export function cacheGet<T>(key: string, now = Date.now()): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (now - hit.at > DAY) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key); // refresca el orden (LRU)
  cache.set(key, hit);
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, now = Date.now()) {
  cache.set(key, { at: now, value });
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
}

/** Solo para pruebas. */
export function resetGuards() {
  perIp.clear();
  cache.clear();
  dayCount = 0;
  dayStart = Date.now();
}
