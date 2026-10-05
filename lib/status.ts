import { ColorState } from '../types';

// Fuente única de verdad para color, etiqueta y significado de cada estado.
export const STATUS_ORDER: ColorState[] = ['red', 'yellow', 'green', 'pink'];

export const STATUS_INFO: Record<
  ColorState,
  { label: string; hint: string; color: string; iconClass: string }
> = {
  red: { label: 'Pendiente', hint: 'Por trabajar', color: '#FF3B30', iconClass: 'text-white' },
  yellow: { label: 'En progreso', hint: 'Mejorando', color: '#FFCC00', iconClass: 'text-gray-900' },
  green: { label: 'Bien', hint: 'Casi listo', color: '#34C759', iconClass: 'text-white' },
  pink: { label: 'Dominado', hint: 'Objetivo', color: '#FFB5C0', iconClass: 'text-gray-900' },
};

export const MAX_CORRECTION_LENGTH = 140;
