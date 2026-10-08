import { daysSince } from '../lib/history';

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

function label(date: Date) {
  const diffDays = daysSince(date);
  const when = diffDays === 0 ? 'hoy' : diffDays === 1 ? 'ayer' : `el ${day.format(date)}`;
  return `Actualizado ${when}, ${time.format(date)}`;
}

// La hora se formatea con la zona horaria de quien mira, que en el servidor puede ser distinta:
// por eso se silencia el aviso de hidratación solo en este texto.
export default function LastUpdated({ iso }: { iso: string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <p className="mb-4 text-center text-xs text-ink-muted">
      <time dateTime={iso} suppressHydrationWarning>
        {label(date)}
      </time>
    </p>
  );
}
