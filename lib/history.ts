import { RoutinePart } from '../types';

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const startOfWeek = (d: Date) => startOfDay(d) - ((d.getDay() + 6) % 7) * DAY; // lunes

export function agoLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

// Correcciones dominadas por semana (lunes a domingo), de la más antigua a la actual.
export function masteredPerWeek(routine: RoutinePart[], weeks = 4, now = new Date()) {
  const current = startOfWeek(now);
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: current - (weeks - 1 - i) * 7 * DAY, count: 0 }));
  for (const part of routine) {
    for (const c of part.corrections) {
      if (c.status !== 'pink' || !c.masteredAt) continue;
      const t = new Date(c.masteredAt);
      if (Number.isNaN(t.getTime())) continue;
      const bucket = buckets.find(b => t.getTime() >= b.start && t.getTime() < b.start + 7 * DAY);
      if (bucket) bucket.count++;
    }
  }
  return buckets;
}
