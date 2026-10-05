import { ATHLETES, setAthlete } from '../lib/athletes';

// "Las mías": cada atleta elige su nombre una vez y la app le muestra solo lo suyo (y lo de todas).
export default function AthleteFilter({ athlete }: { athlete: string | null }) {
  const options: (string | null)[] = [null, ...ATHLETES];
  return (
    <div role="radiogroup" aria-label="Ver correcciones de" className="mb-4 flex flex-wrap items-center justify-center gap-1.5">
      {options.map(name => {
        const on = athlete === name;
        return (
          <button
            key={name ?? 'todas'}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setAthlete(name)}
            className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink-soft'
            }`}
          >
            {name ?? 'Todas'}
          </button>
        );
      })}
    </div>
  );
}
