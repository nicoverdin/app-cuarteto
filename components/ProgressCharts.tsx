import { ColorState } from '../types';
import { STATUS_INFO, STATUS_ORDER } from '../lib/status';

function describe(counts: Record<ColorState, number>) {
  return STATUS_ORDER.map(s => `${counts[s]} ${STATUS_INFO[s].label.toLowerCase()}`).join(', ');
}

// Donut en SVG puro (sin recharts): un círculo por segmento con stroke-dasharray.
export function SectionDonut({ counts }: { counts: Record<ColorState, number> }) {
  const total = STATUS_ORDER.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return null;

  const r = 15;
  const circumference = 2 * Math.PI * r;
  const segments = STATUS_ORDER.filter(s => counts[s] > 0).reduce<
    { status: ColorState; length: number; start: number }[]
  >((acc, status) => {
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].length : 0;
    return [...acc, { status, length: (counts[status] / total) * circumference, start }];
  }, []);

  return (
    <svg width={40} height={40} viewBox="0 0 40 40" role="img" aria-label={describe(counts)} className="shrink-0">
      <g transform="rotate(-90 20 20)" fill="none" strokeWidth={6}>
        {segments.map(({ status, length, start }) => (
          <circle
            key={status}
            cx={20}
            cy={20}
            r={r}
            stroke={STATUS_INFO[status].color}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-start}
          />
        ))}
      </g>
    </svg>
  );
}

export function MainProgressBar({ counts }: { counts: Record<ColorState, number> }) {
  const total = STATUS_ORDER.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return null;

  return (
    <div>
      <div
        role="img"
        aria-label={`Progreso global: ${describe(counts)}`}
        className="w-full h-8 bg-track rounded-full overflow-hidden flex shadow-inner"
      >
        {/* Rojo -> Amarillo -> Verde -> Rosa */}
        {STATUS_ORDER.map(s => (
          <div
            key={s}
            style={{ width: `${(counts[s] / total) * 100}%`, backgroundColor: STATUS_INFO[s].color }}
            className="h-full transition-all duration-500"
          />
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold text-ink-soft text-center tabular-nums">
        {counts.pink} de {total} dominadas
      </p>
    </div>
  );
}

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Leyenda de estados">
      {STATUS_ORDER.map(s => (
        <li key={s} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-3 h-3 rounded-full inline-block"
            style={{ backgroundColor: STATUS_INFO[s].color }}
          />
          {STATUS_INFO[s].label}
        </li>
      ))}
    </ul>
  );
}
