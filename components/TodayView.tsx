import { RoutinePart, ColorState } from '../types';
import { Change } from '../lib/changes';
import { isFor } from '../lib/athletes';
import CorrectionItem from './CorrectionItem';

interface Props {
  routine: RoutinePart[];
  isAdmin: boolean;
  athlete: string | null;
  changes: Record<string, Change>;
  onUpdateCorrection: (partId: string, correctionId: string, status: ColorState) => void;
  onDeleteCorrection: (partId: string, correctionId: string) => void;
  onAssignCorrection: (partId: string, correctionId: string, who: string[]) => void;
}

// Lo pendiente (rojo y amarillo) de todas las partes, en el orden de la coreografía.
export default function TodayView({ routine, isAdmin, athlete, changes, onUpdateCorrection, onDeleteCorrection, onAssignCorrection }: Props) {
  const groups = routine
    .map(part => ({
      part,
      items: part.corrections.filter(c => (c.status === 'red' || c.status === 'yellow') && (isAdmin || isFor(c, athlete))),
    }))
    .filter(g => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm font-medium text-ink-soft">
        No queda nada pendiente. ¡Todo al verde o al rosa!
      </p>
    );
  }

  return (
    <div>
      <p className="mb-4 text-center text-xs text-ink-soft">
        Rojo y amarillo, en el orden de la rutina.
      </p>
      {groups.map(({ part, items }) => (
        <section key={part.id} className="mb-5">
          <h2 className="mb-2 px-2 text-[17px] font-bold tracking-tight text-ink">{part.name}</h2>
          {items.map(corr => (
            <CorrectionItem
              key={corr.id}
              correction={corr}
              isAdmin={isAdmin}
              change={changes[corr.id]}
              onUpdate={status => onUpdateCorrection(part.id, corr.id, status)}
              onDelete={() => onDeleteCorrection(part.id, corr.id)}
              onAssign={who => onAssignCorrection(part.id, corr.id, who)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
