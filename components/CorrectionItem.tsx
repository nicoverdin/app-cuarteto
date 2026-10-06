"use client";
import { useState, type ReactNode } from 'react';
import { Trash2, X, Clock, Check, Heart, Users } from 'lucide-react';
import { Correction } from '../types';
import { STATUS_INFO, STATUS_ORDER } from '../lib/status';
import { Change } from '../lib/changes';
import { agoLabel } from '../lib/history';
import WhoPicker from './WhoPicker';

const STATUS_ICON = { red: X, yellow: Clock, green: Check, pink: Heart };

interface Props {
  correction: Correction;
  onUpdate: (newStatus: Correction['status']) => void;
  onDelete: () => void;
  onAssign?: (who: string[]) => void;
  // Asa para arrastrar (solo en la lista de la rutina, para reordenar).
  handle?: ReactNode;
  isAdmin: boolean;
  change?: Change;
}

export default function CorrectionItem({ correction, onUpdate, onDelete, onAssign, handle, isAdmin, change }: Props) {
  const [assigning, setAssigning] = useState(false);
  const info = STATUS_INFO[correction.status];
  const Icon = STATUS_ICON[correction.status];

  const nextStatus = STATUS_ORDER[(STATUS_ORDER.indexOf(correction.status) + 1) % STATUS_ORDER.length];

  const who = correction.who?.length ? correction.who : null;
  const mastered = correction.status === 'pink' && correction.masteredAt ? agoLabel(correction.masteredAt) : null;
  const meta = (who || mastered) && (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-ink-soft">
      {who && <span>Para: {who.join(', ')}</span>}
      {mastered && <span suppressHydrationWarning>· Dominada {mastered}</span>}
    </span>
  );
  const text = (
    <span className="min-w-0 pr-4">
      <span className="block text-ink font-medium text-[15px] leading-tight">{correction.text}</span>
      {meta}
    </span>
  );

  const chip = change && (
    <span className="mr-2 shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
      {change === 'new' ? 'Nuevo' : 'Actualizado'}
    </span>
  );

  const badge = (
    <span
      className="w-8 h-8 rounded-full shadow-md flex-shrink-0 flex items-center justify-center transition-colors duration-300"
      style={{ backgroundColor: info.color }}
    >
      <Icon className={`w-4 h-4 ${info.iconClass}`} strokeWidth={3} aria-hidden="true" />
    </span>
  );

  return (
    <div className="bg-surface mb-3 rounded-2xl shadow-sm border border-line">
    <div className="flex items-center justify-between pl-4 pr-1 py-1">
      {isAdmin ? (
        <button
          type="button"
          onClick={() => onUpdate(nextStatus)}
          aria-label={`${correction.text}. Estado: ${info.label}. Pulsa para cambiar a ${STATUS_INFO[nextStatus].label}`}
          className="flex-1 flex items-center justify-between py-2 pr-2 text-left rounded-xl transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {text}
          <span className="flex items-center">{chip}{badge}</span>
        </button>
      ) : (
        <div className="flex-1 flex items-center justify-between py-3 pr-2">
          {text}
          {chip}
          <span role="img" aria-label={`Estado: ${info.label}`}>{badge}</span>
        </div>
      )}

      {/* Asignar, reordenar y eliminar (solo visibles para entrenador) */}
      {isAdmin && onAssign && (
        <button
          type="button"
          onClick={() => setAssigning(a => !a)}
          aria-expanded={assigning}
          aria-label={`Asignar atletas: ${correction.text}`}
          className="w-10 h-10 flex items-center justify-center text-ink-muted hover:text-accent transition-colors rounded-full focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Users className="w-5 h-5" aria-hidden="true" />
        </button>
      )}

      {isAdmin && handle}

      {isAdmin && (
        <button
          type="button"
          onClick={onDelete}
          className="w-11 h-11 ml-1 flex items-center justify-center text-ink-muted hover:text-danger active:text-danger transition-colors rounded-full focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`Eliminar corrección: ${correction.text}`}
        >
          <Trash2 className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
    </div>
    {isAdmin && onAssign && assigning && (
      <div className="px-4 pb-3">
        <WhoPicker value={correction.who ?? []} onChange={onAssign} label="Para quién es" />
      </div>
    )}
    </div>
  );
}
