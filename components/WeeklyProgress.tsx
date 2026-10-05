import { RoutinePart } from '../types';
import { masteredPerWeek } from '../lib/history';

const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

// Correcciones dominadas por semana: la tendencia de las últimas cuatro semanas.
export default function WeeklyProgress({ routine }: { routine: RoutinePart[] }) {
  const weeks = masteredPerWeek(routine);
  const max = Math.max(1, ...weeks.map(w => w.count));
  const total = weeks.reduce((n, w) => n + w.count, 0);
  if (total === 0) return null;

  const summary = weeks.map((w, i) => `${i === weeks.length - 1 ? 'esta semana' : `semana del ${day.format(w.start)}`}: ${w.count}`).join(', ');

  return (
    <section aria-label="Progreso semanal" className="mb-5 rounded-2xl border border-line bg-surface px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">Dominadas por semana</h2>
      <div role="img" aria-label={`Dominadas por semana. ${summary}`} className="flex items-end justify-between gap-3">
        {weeks.map((w, i) => (
          <div key={w.start} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-bold tabular-nums text-ink">{w.count}</span>
            <div className="flex h-12 w-full items-end">
              <div
                className="w-full rounded-md bg-accent"
                style={{ height: `${Math.max(w.count > 0 ? 8 : 2, (w.count / max) * 100)}%`, opacity: w.count > 0 ? 1 : 0.25 }}
              />
            </div>
            <span className="text-[10px] text-ink-muted" suppressHydrationWarning>
              {i === weeks.length - 1 ? 'Esta' : day.format(w.start)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
