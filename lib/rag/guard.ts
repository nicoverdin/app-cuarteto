// Protecciones en memoria (un solo proceso): la ruta gasta dinero en cada pregunta, y la app es pública.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const perIp = new Map<string, number[]>();
let dayStart = Date.now();
let dayCount = 0;
let dayId = 0; // cambia al reiniciarse el cupo diario

const num = (v: string | undefined, d: number) => (v && Number.isFinite(+v) && +v > 0 ? +v : d);

const MAX_IPS = 5000;

/** Elimina entradas caducadas y, si sigue habiendo demasiadas, las más antiguas (orden de inserción). */
function evict(now: number) {
  if (perIp.size <= MAX_IPS) return;
  for (const [k, v] of perIp) if (!v.some(t => now - t < HOUR)) perIp.delete(k);
  for (const k of perIp.keys()) {
    if (perIp.size <= MAX_IPS) break;
    perIp.delete(k);
  }
}

/** true si la petición puede continuar. Límite por IP y hora, y límite global diario. */
export function allowRequest(ip: string, now = Date.now()): boolean {
  const perHour = num(process.env.REGLAMENTO_HOURLY_LIMIT, 20);
  const perDay = num(process.env.REGLAMENTO_DAILY_LIMIT, 300);

  if (now - dayStart > DAY) {
    dayStart = now;
    dayCount = 0;
    dayId++;
  }
  const recent = (perIp.get(ip) ?? []).filter(t => now - t < HOUR);
  if (recent.length >= perHour || dayCount >= perDay) {
    perIp.delete(ip);
    if (recent.length) perIp.set(ip, recent); // reinsertar mantiene el orden por actividad reciente
    evict(now);
    return false;
  }
  recent.push(now);
  perIp.delete(ip);
  perIp.set(ip, recent);
  dayCount++;
  evict(now);
  return true;
}

/** Identificador del cupo diario vigente: se guarda al reservar para devolver solo en el mismo día. */
export const currentDay = () => dayId;

/** Devuelve la consulta consumida por allowRequest (p. ej. si falla por un error nuestro). */
export function refundRequest(ip: string, day = dayId) {
  const list = perIp.get(ip);
  if (list?.length) list.pop();
  if (list && !list.length) perIp.delete(ip);
  if (day === dayId && dayCount > 0) dayCount--;
}

/**
 * Clave de cliente. Por defecto (REGLAMENTO_TRUSTED_PROXY_HOPS=0) se ignora x-forwarded-for porque
 * lo controla el cliente: todos comparten la clave 'directo'. Con N>0 se toma la IP que queda
 * N saltos desde la derecha (la añadida por el proxy de confianza más cercano al cliente).
 */
export function clientKey(headers: Headers): string {
  const hops = Math.floor(num(process.env.REGLAMENTO_TRUSTED_PROXY_HOPS, 0));
  if (hops > 0) {
    const parts = (headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    const ip = parts[parts.length - hops];
    if (ip) return ip.slice(0, 64);
  }
  return 'directo';
}

// Peticiones con IA en curso a la vez.
let active = 0;
export function acquireSlot(): boolean {
  const max = Math.floor(num(process.env.REGLAMENTO_MAX_CONCURRENT, 3));
  if (active >= max) return false;
  active++;
  return true;
}
export function releaseSlot() {
  if (active > 0) active--;
}

// Fallos de código de acceso por cliente: tras MAX_FAILS en 15 min se bloquea hasta que caduquen.
const FAIL_WINDOW = 15 * 60_000;
const MAX_FAILS = 10;
const fails = new Map<string, number[]>();

/** true si el cliente acumula demasiados códigos incorrectos (no se anota nada más mientras tanto). */
export function authBlocked(key: string, now = Date.now()): boolean {
  const recent = (fails.get(key) ?? []).filter(t => now - t < FAIL_WINDOW);
  if (recent.length) fails.set(key, recent);
  else fails.delete(key);
  return recent.length >= MAX_FAILS;
}
export function recordAuthFailure(key: string, now = Date.now()) {
  const recent = (fails.get(key) ?? []).filter(t => now - t < FAIL_WINDOW);
  recent.push(now);
  fails.delete(key);
  fails.set(key, recent);
  if (fails.size > MAX_IPS) fails.delete(fails.keys().next().value as string);
}

/** Consultas idénticas en vuelo: la segunda espera a la primera en lugar de gastar otra llamada. */
export const inflight = new Map<string, Promise<unknown>>();

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
  fails.clear();
  inflight.clear();
  active = 0;
  cache.clear();
  dayCount = 0;
  dayStart = Date.now();
  dayId = 0;
}
