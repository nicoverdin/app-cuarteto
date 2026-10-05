export type ColorState = 'red' | 'yellow' | 'green' | 'pink';

export interface Correction {
  id: string;
  text: string;
  status: ColorState;
  // Atletas a las que afecta; vacío o ausente = todas.
  who?: string[];
  // Cuándo cambió de estado por última vez y cuándo pasó a "Dominado" (ISO). Opcionales: datos antiguos no los tienen.
  statusAt?: string;
  masteredAt?: string;
}

export interface RoutinePart {
  id: string;
  name: string;
  corrections: Correction[];
}
