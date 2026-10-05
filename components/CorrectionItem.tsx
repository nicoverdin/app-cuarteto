"use client";
import { Trash2, X, Clock, Check, Heart, ChevronUp, ChevronDown } from 'lucide-react';
import { Correction } from '../types';
import { STATUS_INFO, STATUS_ORDER } from '../lib/status';

const STATUS_ICON = { red: X, yellow: Clock, green: Check, pink: Heart };

interface Props {
  correction: Correction;
  onUpdate: (newStatus: Correction['status']) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isAdmin: boolean;
}

export default function CorrectionItem({ correction, onUpdate, onDelete, onMove, canMoveUp, canMoveDown, isAdmin }: Props) {
  const info = STATUS_INFO[correction.status];
  const Icon = STATUS_ICON[correction.status];

  const nextStatus = STATUS_ORDER[(STATUS_ORDER.indexOf(correction.status) + 1) % STATUS_ORDER.length];

  const badge = (
    <span
      className="w-8 h-8 rounded-full shadow-md flex-shrink-0 flex items-center justify-center transition-colors duration-300"
      style={{ backgroundColor: info.color }}
    >
      <Icon className={`w-4 h-4 ${info.iconClass}`} strokeWidth={3} aria-hidden="true" />
    </span>
  );

  return (
    <div className="flex items-center justify-between bg-surface pl-4 pr-1 py-1 mb-3 rounded-2xl shadow-sm border border-line">
      {isAdmin ? (
        <button
          type="button"
          onClick={() => onUpdate(nextStatus)}
          aria-label={`${correction.text}. Estado: ${info.label}. Pulsa para cambiar a ${STATUS_INFO[nextStatus].label}`}
          className="flex-1 flex items-center justify-between py-2 pr-2 text-left rounded-xl transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="text-ink font-medium text-[15px] leading-tight pr-4">{correction.text}</span>
          {badge}
        </button>
      ) : (
        <div className="flex-1 flex items-center justify-between py-3 pr-2">
          <p className="text-ink font-medium text-[15px] leading-tight pr-4">{correction.text}</p>
          <span role="img" aria-label={`Estado: ${info.label}`}>{badge}</span>
        </div>
      )}

      {/* Reordenar y eliminar (solo visibles para entrenador) */}
      {isAdmin && (
        <div className="flex flex-col ml-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            aria-label={`Subir: ${correction.text}`}
            className="w-10 h-6 flex items-center justify-center text-ink-muted hover:text-accent disabled:opacity-25 disabled:hover:text-ink-muted transition-colors rounded-md focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronUp className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            aria-label={`Bajar: ${correction.text}`}
            className="w-10 h-6 flex items-center justify-center text-ink-muted hover:text-accent disabled:opacity-25 disabled:hover:text-ink-muted transition-colors rounded-md focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronDown className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      )}

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
  );
}
