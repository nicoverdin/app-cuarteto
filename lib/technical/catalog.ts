// Catálogo de elementos técnicos del cuarteto. SOLO DATOS: para añadir o corregir un elemento
// se edita este archivo y no hace falta tocar el cálculo ni la interfaz (ver README.md).

export interface ElementLevel {
  /** Código oficial del nivel (p. ej. "Tr2"). */
  code: string;
  /** Valor base del nivel (QOE = 0). */
  base: number;
  /**
   * Puntos que suman los QOE +1, +2 y +3. Los negativos son el mismo valor con signo contrario
   * (la tabla oficial es simétrica en todas las filas).
   */
  qoe: readonly [number, number, number];
}

export interface ExtraFeature {
  id: string;
  label: string;
  /** Puntos que suma al valor del elemento. Si hay varias confirmadas, solo cuenta la mayor. */
  bonus: number;
}

export interface TechElement {
  id: string;
  name: string;
  /** Índice = número de nivel. El 0 es "sin nivel" y siempre vale 0. */
  levels: readonly ElementLevel[];
  /** Patinadoras (de 4) que deben lograr un nivel para que el grupo lo tenga confirmado. */
  minSkaters: number;
  extras?: readonly ExtraFeature[];
}

export const CATALOG_SOURCE = {
  rules: 'World Skate Artistic 2026 — Quartets Rules (apartados 5 y 7)',
  values: 'Tabla de valores de cuarteto (Rollart 2026): "Quartet values / puntuaciones base"',
  season: '2026',
  category: 'Senior',
} as const;

export const QOE_VALUES = [-3, -2, -1, 0, 1, 2, 3] as const;
export const MAX_QOE = 3;

const NO_LEVEL: ElementLevel = { code: 'NL', base: 0, qoe: [0, 0, 0] };

export const CATALOG: readonly TechElement[] = [
  {
    id: 'cluster',
    name: 'Cluster',
    minSkaters: 3, // 5.5: "At least three (3) skaters must perform the turns and features correctly"
    levels: [
      { ...NO_LEVEL, code: 'NLClS' },
      { code: 'ClSqB', base: 2.0, qoe: [0.3, 0.6, 0.9] },
      { code: 'ClSq1', base: 3.5, qoe: [0.4, 0.8, 1.2] },
      { code: 'ClSq2', base: 5, qoe: [0.5, 1, 1.5] },
      { code: 'ClSq3', base: 6.8, qoe: [0.7, 1.4, 2.1] },
      { code: 'ClSq4', base: 8.3, qoe: [0.8, 1.5, 2.2] },
    ],
  },
  {
    id: 'traveling',
    name: 'Traveling',
    minSkaters: 4, // 5.4: "To confirm the level, it must be achieved by all four of the skaters"
    levels: [
      { ...NO_LEVEL, code: 'NLTr' },
      { code: 'TrB', base: 2.5, qoe: [0.3, 0.6, 0.9] },
      { code: 'Tr1', base: 3.5, qoe: [0.3, 0.6, 0.9] },
      { code: 'Tr2', base: 4.5, qoe: [0.4, 0.8, 1.2] },
      { code: 'Tr3', base: 6, qoe: [0.5, 1, 1.5] },
      { code: 'Tr4', base: 6.5, qoe: [0.6, 1.1, 1.6] },
    ],
    // 5.4 Group 4. Puntos fijos (confirmado por el entrenador); solo cuenta la más difícil.
    extras: [
      { id: 'third-set', label: 'Tercer set', bonus: 0.5 },
      { id: 'change-formation', label: 'Cambio de formación', bonus: 1.0 },
      { id: 'mirror', label: 'Espejo', bonus: 1.5 },
      { id: 'crossing', label: 'Cruce de trayectorias', bonus: 2.0 },
    ],
  },
  {
    id: 'line',
    name: 'Línea',
    minSkaters: 3, // 5.3: "At least three (3) skaters must perform the turns and features correctly"
    levels: [
      { ...NO_LEVEL, code: 'NLLAS' },
      { code: 'LB', base: 3.0, qoe: [0.3, 0.6, 0.9] },
      { code: 'L1', base: 4.0, qoe: [0.3, 0.6, 0.9] },
      { code: 'L2', base: 5.5, qoe: [0.4, 0.8, 1.2] },
      { code: 'L3', base: 7.1, qoe: [0.7, 1.4, 2.1] },
      { code: 'L4', base: 9.3, qoe: [1, 2, 3] },
    ],
  },
];

export const getElement = (id: string) => CATALOG.find(e => e.id === id);
