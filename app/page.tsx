"use client";
import { useState, useEffect } from 'react';
import { RoutinePart, ColorState } from '../types';
import RoutineSection from '../components/RoutineSection';
import { MainProgressBar } from '../components/ProgressCharts';

// ... (MANTÉN TU initialData EXACTAMENTE IGUAL AQUÍ) ...
const initialData: RoutinePart[] = [
  {
    id: 'p1', name: 'Transición a cluster',
    corrections: [
      { id: 'c1', text: 'Mantener la velocidad y bloque compacto al cruzar', status: 'yellow' }
    ]
  },
  {
    id: 'p2', name: 'Cluster',
    corrections: [
      { id: 'c2', text: 'Sincronización exacta en la elevación entre Mabel y Raquel', status: 'red' },
      { id: 'c3', text: 'Tensión en los brazos libres hasta el último tiempo', status: 'green' }
    ]
  },
  {
    id: 'p3', name: 'Trans. de cluster a cambio de música',
    corrections: [
      { id: 'c4', text: 'Limpiar el filo de salida', status: 'yellow' }
    ]
  },
  {
    id: 'p4', name: 'Transición a creativa',
    corrections: [
      { id: 'c5', text: 'Fluidez en los cruces hacia atrás', status: 'pink' }
    ]
  },
  {
    id: 'p5', name: 'Creativa',
    corrections: [
      { id: 'c6', text: 'Expresión facial acorde al acento musical', status: 'green' }
    ]
  },
  {
    id: 'p6', name: 'Transición a traveling',
    corrections: [
      { id: 'c7', text: 'Cuidado con la distancia entre Luar y Martina al entrar', status: 'yellow' }
    ]
  },
  {
    id: 'p7', name: 'Traveling',
    corrections: [
      { id: 'c8', text: 'Postura corporal erguida en los giros, no bajar la mirada', status: 'red' }
    ]
  },
  {
    id: 'p8', name: 'Línea',
    corrections: [
      { id: 'c9', text: 'Alineación perfecta en el eje central de la pista', status: 'yellow' }
    ]
  },
  {
    id: 'p9', name: 'Final',
    corrections: [
      { id: 'c10', text: 'Mantener la pose final 3 segundos estáticas', status: 'pink' }
    ]
  },
];


export default function Home() {
  const [routine, setRoutine] = useState<RoutinePart[]>(initialData);
  const [isAdmin, setIsAdmin] = useState(false);

  // Detecta si eres tú a través de la URL
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('entrenador=nico')) {
      setIsAdmin(true);
    }
  }, []);

  const updateCorrection = (partId: string, correctionId: string, newStatus: ColorState) => {
    setRoutine(prev => prev.map(part => {
      if (part.id !== partId) return part;
      return {
        ...part,
        corrections: part.corrections.map(c => 
          c.id === correctionId ? { ...c, status: newStatus } : c
        )
      };
    }));
  };

  const addCorrection = (partId: string, text: string) => {
    setRoutine(prev => prev.map(part => {
      if (part.id !== partId) return part;
      return {
        ...part,
        corrections: [...part.corrections, { id: `new-${Date.now()}`, text, status: 'red' }]
      };
    }));
  };

  const deleteCorrection = (partId: string, correctionId: string) => {
    setRoutine(prev => prev.map(part => {
      if (part.id !== partId) return part;
      return {
        ...part,
        // Filtramos para quedarnos con todas menos la que coincide con el ID a borrar
        corrections: part.corrections.filter(c => c.id !== correctionId)
      };
    }));
  };

  const totalCounts = routine.reduce((acc, part) => {
    part.corrections.forEach(c => acc[c.status]++);
    return acc;
  }, { red: 0, yellow: 0, green: 0, pink: 0 });

  return (
    <main className="min-h-screen bg-[#F2F2F7] pb-12">
      <div className="sticky top-0 bg-[#F2F2F7]/90 backdrop-blur-md z-10 pt-12 pb-4 px-4 shadow-sm">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-4 tracking-tight">
            Programa Cuarteto
          </h1>
          <MainProgressBar counts={totalCounts} />
          <p className="text-xs text-gray-500 mt-2 font-medium uppercase tracking-wider text-center">
            Objetivo: Todo al rosa
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 mt-6">
        {routine.map(part => (
          <RoutineSection 
            key={part.id} 
            part={part}
            isAdmin={isAdmin}
            onUpdateCorrection={updateCorrection} 
            onAddCorrection={addCorrection}
            onDeleteCorrection={deleteCorrection}
          />
        ))}
      </div>
    </main>
  );
}