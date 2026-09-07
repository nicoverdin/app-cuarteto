export type ColorState = 'red' | 'yellow' | 'green' | 'pink';

export interface Correction {
  id: string;
  text: string;
  status: ColorState;
}

export interface RoutinePart {
  id: string;
  name: string;
  corrections: Correction[];
}