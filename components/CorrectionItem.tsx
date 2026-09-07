"use client";
import { Trash2 } from 'lucide-react';
import { Correction } from '../types';

const colorStyles = {
  red: 'bg-[#FF3B30] shadow-[#FF3B30]/40',
  yellow: 'bg-[#FFCC00] shadow-[#FFCC00]/40',
  green: 'bg-[#34C759] shadow-[#34C759]/40',
  pink: 'bg-[#FFB5C0] shadow-[#FFB5C0]/50', 
};

interface Props {
  correction: Correction;
  onUpdate: (newStatus: Correction['status']) => void;
  onDelete: () => void;
  isAdmin: boolean;
}

export default function CorrectionItem({ correction, onUpdate, onDelete, isAdmin }: Props) {
  const cycleColor = (e: React.MouseEvent) => {
    if (!isAdmin) return;
    const sequence: Correction['status'][] = ['red', 'yellow', 'green', 'pink'];
    const nextIndex = (sequence.indexOf(correction.status) + 1) % sequence.length;
    onUpdate(sequence[nextIndex]);
  };

  return (
    <div className={`flex items-center justify-between bg-white pl-4 pr-2 py-2 mb-3 rounded-2xl shadow-sm border border-gray-100 transition-transform ${isAdmin ? 'active:scale-[0.98]' : ''}`}>
      
      {/* Zona izquierda (Texto y Color) */}
      <div 
        onClick={cycleColor}
        className={`flex-1 flex items-center justify-between py-1 pr-2 ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <p className="text-gray-800 font-medium text-[15px] leading-tight pr-4 select-none">
          {correction.text}
        </p>
        <div className={`w-7 h-7 rounded-full shadow-md flex-shrink-0 transition-colors duration-300 ${colorStyles[correction.status]}`} />
      </div>

      {/* Botón de eliminar (Solo visible para entrenador) */}
      {isAdmin && (
        <button 
          onClick={(e) => {
            e.stopPropagation(); // Evita que se cambie el color al borrar
            onDelete();
          }}
          className="p-2 ml-1 text-gray-300 active:text-red-500 transition-colors rounded-full"
          aria-label="Eliminar corrección"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}