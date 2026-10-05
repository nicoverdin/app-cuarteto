import { ATHLETES } from '../lib/athletes';

interface Props {
  value: string[];
  onChange: (who: string[]) => void;
  label: string;
}

// Selector múltiple de atletas. Sin ninguna marcada significa "todas".
export default function WhoPicker({ value, onChange, label }: Props) {
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter(n => n !== name) : [...value, name]);

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-semibold text-ink-soft">
        {label} <span className="font-normal">(ninguna = todas)</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {ATHLETES.map(name => {
          const on = value.includes(name);
          return (
            <button
              key={name}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(name)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink-soft'
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
