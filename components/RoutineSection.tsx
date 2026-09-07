"use client";
import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { RoutinePart, ColorState } from '../types';
import CorrectionItem from './CorrectionItem';
import { SectionDonut } from './ProgressCharts';

interface Props {
  part: RoutinePart;
  isAdmin: boolean;
  onUpdateCorrection: (partId: string, correctionId: string, status: ColorState) => void;
  onAddCorrection: (partId: string, text: string) => void;
  onDeleteCorrection: (partId: string, correctionId: string) => void;
}

export default function RoutineSection({ part, isAdmin, onUpdateCorrection, onAddCorrection, onDeleteCorrection }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [newCorrectionText, setNewCorrectionText] = useState('');

  const counts = {
    red: part.corrections.filter(c => c.status === 'red').length,
    yellow: part.corrections.filter(c => c.status === 'yellow').length,
    green: part.corrections.filter(c => c.status === 'green').length,
    pink: part.corrections.filter(c => c.status === 'pink').length,
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCorrectionText.trim() === '') return;
    onAddCorrection(part.id, newCorrectionText);
    setNewCorrectionText('');
  };

  return (
    <section className="mb-5">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex justify-between items-center mb-3 px-2 cursor-pointer select-none group"
      >
        <div className="flex items-center gap-2">
          <ChevronDown className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
          <h2 className="text-[20px] font-bold text-gray-900 tracking-tight group-active:text-[#FFB5C0] transition-colors">
            {part.name}
          </h2>
        </div>
        <SectionDonut counts={counts} />
      </div>
      
      {isOpen && (
        <div className="flex flex-col transition-all duration-300">
          {part.corrections.map(corr => (
            <CorrectionItem 
              key={corr.id} 
              correction={corr} 
              isAdmin={isAdmin}
              onUpdate={(status) => onUpdateCorrection(part.id, corr.id, status)}
              onDelete={() => onDeleteCorrection(part.id, corr.id)}
            />
          ))}

          {isAdmin && (
            <form onSubmit={handleAdd} className="mt-2 flex gap-2 items-center">
              <input 
                type="text" 
                value={newCorrectionText}
                onChange={(e) => setNewCorrectionText(e.target.value)}
                placeholder="Nueva corrección..." 
                className="flex-1 bg-gray-200/60 rounded-xl px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[#E0218A]/50 transition-all placeholder:text-gray-500"
              />
              <button 
                type="submit" 
                disabled={!newCorrectionText.trim()}
                className="bg-[#FFB5C0] text-white p-3 rounded-xl disabled:opacity-40 transition-opacity"
              >
                <Plus className="w-5 h-5" />
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}