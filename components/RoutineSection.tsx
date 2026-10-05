"use client";
import { useId, useState } from 'react';
import { ChevronDown, Plus, Sparkles } from 'lucide-react';
import { RoutinePart, ColorState } from '../types';
import { MAX_CORRECTION_LENGTH } from '../lib/status';
import { Change } from '../lib/changes';
import CorrectionItem from './CorrectionItem';
import { SectionDonut } from './ProgressCharts';

interface Props {
  part: RoutinePart;
  isAdmin: boolean;
  changes: Record<string, Change>;
  onUpdateCorrection: (partId: string, correctionId: string, status: ColorState) => void;
  onAddCorrection: (partId: string, text: string) => void;
  onDeleteCorrection: (partId: string, correctionId: string) => void;
  onMoveCorrection: (partId: string, correctionId: string, direction: -1 | 1) => void;
}

export default function RoutineSection({ part, isAdmin, changes, onUpdateCorrection, onAddCorrection, onDeleteCorrection, onMoveCorrection }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [newCorrectionText, setNewCorrectionText] = useState('');
  const panelId = useId();
  const inputId = useId();

  const counts = {
    red: part.corrections.filter(c => c.status === 'red').length,
    yellow: part.corrections.filter(c => c.status === 'yellow').length,
    green: part.corrections.filter(c => c.status === 'green').length,
    pink: part.corrections.filter(c => c.status === 'pink').length,
  };

  const changeCount = part.corrections.filter(c => changes[c.id]).length;
  const isComplete = part.corrections.length > 0 && counts.pink === part.corrections.length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newCorrectionText.trim();
    if (text === '') return;
    onAddCorrection(part.id, text);
    setNewCorrectionText('');
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
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">
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
          {part.corrections.length === 0 && (
            <p className="px-2 mb-3 text-sm text-ink-soft">
              {isAdmin ? 'Aún no hay correcciones. Añade la primera abajo.' : 'Sin correcciones en esta parte.'}
            </p>
          )}

          {part.corrections.map((corr, index) => (
            <CorrectionItem
              key={corr.id}
              correction={corr}
              isAdmin={isAdmin}
              change={changes[corr.id]}
              onUpdate={(status) => onUpdateCorrection(part.id, corr.id, status)}
              onDelete={() => onDeleteCorrection(part.id, corr.id)}
              onMove={(direction) => onMoveCorrection(part.id, corr.id, direction)}
              canMoveUp={index > 0}
              canMoveDown={index < part.corrections.length - 1}
            />
          ))}

          {isAdmin && (
            <form onSubmit={handleAdd} className="mt-2 flex gap-2 items-center">
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
            </form>
          )}
        </div>
      )}
    </section>
  );
}
