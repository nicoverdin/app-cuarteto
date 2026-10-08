"use client";
import { useId, useState } from 'react';
import { ChevronDown, GripVertical, Plus, Sparkles } from 'lucide-react';
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { RoutinePart, ColorState, Correction } from '../types';
import { MAX_CORRECTION_LENGTH } from '../lib/status';
import { Change } from '../lib/changes';
import { isFor } from '../lib/athletes';
import CorrectionItem from './CorrectionItem';
import WhoPicker from './WhoPicker';
import { SectionDonut } from './ProgressCharts';

interface Props {
  part: RoutinePart;
  isAdmin: boolean;
  changes: Record<string, Change>;
  athlete: string | null;
  onAssignCorrection: (partId: string, correctionId: string, who: string[]) => void;
  onUpdateCorrection: (partId: string, correctionId: string, status: ColorState) => void;
  onAddCorrection: (partId: string, text: string, who: string[]) => void;
  onDeleteCorrection: (partId: string, correctionId: string) => void;
  onReorderCorrection: (partId: string, activeId: string, overId: string) => void;
}

// Textos en español para lectores de pantalla durante el arrastre con teclado.
const DND_INSTRUCTIONS = {
  draggable: 'Para reordenar, pulsa espacio o Intro, mueve con las flechas arriba y abajo, y pulsa espacio o Intro de nuevo para soltar. Escape cancela.',
};

interface RowProps {
  correction: Correction;
  change?: Change;
  onUpdate: (status: ColorState) => void;
  onDelete: () => void;
  onAssign: (who: string[]) => void;
}

// Fila arrastrable: el asa es lo único que inicia el arrastre, así el resto de la fila sigue siendo táctil.
function SortableRow({ correction, change, onUpdate, onDelete, onAssign }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: correction.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-90 [&>div]:shadow-lg' : undefined}
    >
      <CorrectionItem
        correction={correction}
        isAdmin
        change={change}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAssign={onAssign}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reordenar: ${correction.text}. Arrastra, o con teclado pulsa espacio y usa las flechas`}
            className="w-9 h-11 flex touch-none cursor-grab items-center justify-center rounded-md text-ink-muted active:cursor-grabbing hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <GripVertical className="w-5 h-5" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}

export default function RoutineSection({ part, isAdmin, changes, athlete, onAssignCorrection, onUpdateCorrection, onAddCorrection, onDeleteCorrection, onReorderCorrection }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [newCorrectionText, setNewCorrectionText] = useState('');
  const [newWho, setNewWho] = useState<string[]>([]);
  const panelId = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorderCorrection(part.id, String(active.id), String(over.id));
  };
  const inputId = useId();
  const labelOf = (id: UniqueIdentifier) => part.corrections.find(c => c.id === id)?.text ?? 'corrección';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Has cogido: ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} está sobre la posición de ${labelOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.id)} se ha soltado en la posición de ${labelOf(over.id)}.` : `${labelOf(active.id)} se ha soltado sin moverse.`),
    onDragCancel: ({ active }) => `Reordenación cancelada. ${labelOf(active.id)} vuelve a su sitio.`,
  };

  // "Las mías": solo las correcciones que le tocan a la atleta elegida (la entrenadora lo ve todo).
  const visible = isAdmin ? part.corrections : part.corrections.filter(c => isFor(c, athlete));

  const counts = {
    red: visible.filter(c => c.status === 'red').length,
    yellow: visible.filter(c => c.status === 'yellow').length,
    green: visible.filter(c => c.status === 'green').length,
    pink: visible.filter(c => c.status === 'pink').length,
  };

  const changeCount = visible.filter(c => changes[c.id]).length;
  const isComplete = visible.length > 0 && counts.pink === visible.length;

  if (athlete && !isAdmin && visible.length === 0) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newCorrectionText.trim();
    if (text === '') return;
    onAddCorrection(part.id, text, newWho);
    setNewCorrectionText('');
    setNewWho([]);
  };

  return (
    <section className="mb-5">
      <h2>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="w-full flex justify-between items-center mb-3 px-2 py-1 text-left rounded-xl group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex items-center gap-2">
            <ChevronDown aria-hidden="true" className={`w-6 h-6 text-ink-muted transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            <span className="text-[20px] font-bold text-ink tracking-tight">{part.name}</span>
            {changeCount > 0 && (
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">
                {changeCount === 1 ? '1 novedad' : `${changeCount} novedades`}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            {isComplete && (
              <>
                <Sparkles className="w-5 h-5 text-accent motion-safe:animate-pulse" aria-hidden="true" />
                <span className="sr-only">Parte completada</span>
              </>
            )}
            <SectionDonut counts={counts} />
          </span>
        </button>
      </h2>

      {isOpen && (
        <div id={panelId} className="flex flex-col">
          {visible.length === 0 && (
            <p className="px-2 mb-3 text-sm text-ink-soft">
              {isAdmin ? 'Aún no hay correcciones. Añade la primera abajo.' : 'Sin correcciones en esta parte.'}
            </p>
          )}

          {isAdmin ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              accessibility={{ announcements, screenReaderInstructions: DND_INSTRUCTIONS }}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={visible.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div>
                  {visible.map(corr => (
                    <SortableRow
                      key={corr.id}
                      correction={corr}
                      change={changes[corr.id]}
                      onUpdate={(status) => onUpdateCorrection(part.id, corr.id, status)}
                      onDelete={() => onDeleteCorrection(part.id, corr.id)}
                      onAssign={(who) => onAssignCorrection(part.id, corr.id, who)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            visible.map(corr => (
              <CorrectionItem
                key={corr.id}
                correction={corr}
                isAdmin={false}
                change={changes[corr.id]}
              />
            ))
          )}

          {isAdmin && (
            <form onSubmit={handleAdd} className="mt-2 flex flex-col gap-3">
              <div className="flex gap-2 items-center">
              <label htmlFor={inputId} className="sr-only">Nueva corrección para {part.name}</label>
              <input
                id={inputId}
                type="text"
                value={newCorrectionText}
                onChange={(e) => setNewCorrectionText(e.target.value)}
                maxLength={MAX_CORRECTION_LENGTH}
                placeholder="Nueva corrección…"
                className="flex-1 bg-track rounded-xl px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-accent transition-all placeholder:text-ink-muted"
              />
              <button
                type="submit"
                disabled={!newCorrectionText.trim()}
                aria-label="Añadir corrección"
                className="bg-accent text-on-accent w-12 h-12 flex items-center justify-center rounded-xl disabled:opacity-40 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
              </button>
              </div>
              <WhoPicker value={newWho} onChange={setNewWho} label="Para quién es" />
            </form>
          )}
        </div>
      )}
    </section>
  );
}
