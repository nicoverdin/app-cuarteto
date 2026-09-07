"use client";
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { ColorState } from '../types';

const COLORS = {
  red: '#FF3B30', 
  yellow: '#FFCC00', 
  green: '#34C759', 
  pink: '#FFB5C0',
};

export function SectionDonut({ counts }: { counts: Record<ColorState, number> }) {
  // Ordenados de peor a mejor para mantener la coherencia
  const data = [
    { name: 'red', value: counts.red },
    { name: 'yellow', value: counts.yellow },
    { name: 'green', value: counts.green },
    { name: 'pink', value: counts.pink },
  ].filter(d => d.value > 0);

  if (data.length === 0) return null;

  return (
    <div style={{ width: 40, height: 40 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} innerRadius={12} outerRadius={18} dataKey="value" stroke="none">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.name as ColorState]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MainProgressBar({ counts }: { counts: Record<ColorState, number> }) {
  const total = counts.red + counts.yellow + counts.green + counts.pink;
  if (total === 0) return null;
  
  const data = [{
    name: 'Progreso',
    red: (counts.red / total) * 100,
    yellow: (counts.yellow / total) * 100,
    green: (counts.green / total) * 100,
    pink: (counts.pink / total) * 100,
  }];

  return (
    <div className="w-full h-8 bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
      {/* Orden de los bloques invertido: Rojo -> Amarillo -> Verde -> Rosa */}
      <div style={{ width: `${data[0].red}%`, backgroundColor: COLORS.red }} className="h-full transition-all duration-500" />
      <div style={{ width: `${data[0].yellow}%`, backgroundColor: COLORS.yellow }} className="h-full transition-all duration-500" />
      <div style={{ width: `${data[0].green}%`, backgroundColor: COLORS.green }} className="h-full transition-all duration-500" />
      <div style={{ width: `${data[0].pink}%`, backgroundColor: COLORS.pink }} className="h-full transition-all duration-500" />
    </div>
  );
}