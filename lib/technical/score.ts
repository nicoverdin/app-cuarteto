// Lógica de cálculo. Pura (sin React ni Supabase) para poder probarla.
//
// Fórmula de un elemento:
//   valor = base(nivel) + ajusteQOE(nivel, qoe) + bonusExtra
//   · base y ajusteQOE salen de la tabla oficial del catálogo (el QOE suma o resta puntos fijos según el nivel;
//     no es un porcentaje). Nivel 0 ("sin nivel") vale siempre 0.
//   · bonusExtra: solo en elementos con extra features (Traveling). Cuenta únicamente la de mayor bonus
//     y solo si el elemento tiene nivel ≥ 1.
// Valor de grupo: nivel de grupo + QOE de grupo (+ bonus). Es el que suma al total técnico.
// Valor individual: nivel + QOE de cada patinadora; sirve de seguimiento y NO se suma al total técnico.
// Nivel de grupo "automático": el mayor nivel L que alcanzan al menos `minSkaters` patinadoras (nivel ≥ L).

import { CATALOG, MAX_QOE, TechElement, getElement } from './catalog';

export interface Score {
  elemento: string;
  /** null = puntuación del grupo. */
  atleta: string | null;
  /** En grupo, null = automático (derivado de las patinadoras). */
  nivel: number | null;
  qoe: number;
  /** Solo grupo: ids de extra features confirmadas. */
  extras: string[];
}

export interface ElementValue {
  level: number;
  code: string;
  base: number;
  qoe: number;
  bonus: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function assertLevel(el: TechElement, level: number) {
  if (!Number.isInteger(level) || level < 0 || level >= el.levels.length) {
    throw new RangeError(`Nivel ${level} no válido para ${el.name} (0–${el.levels.length - 1})`);
  }
}

export function assertQoe(qoe: number) {
  if (!Number.isInteger(qoe) || Math.abs(qoe) > MAX_QOE) {
    throw new RangeError(`QOE ${qoe} fuera de rango (−${MAX_QOE} a +${MAX_QOE})`);
  }
}

/** Bonus que cuenta: el mayor de las extras confirmadas (el reglamento solo premia la más difícil). */
export function extraBonus(el: TechElement, extras: readonly string[]): number {
  let best = 0;
  for (const id of extras) {
    const feature = el.extras?.find(x => x.id === id);
    if (!feature) throw new RangeError(`Extra feature "${id}" no existe en ${el.name}`);
    best = Math.max(best, feature.bonus);
  }
  return best;
}

export function elementValue(el: TechElement, level: number, qoe: number, extras: readonly string[] = []): ElementValue {
  assertLevel(el, level);
  assertQoe(qoe);
  const lv = el.levels[level];
  const extra = extraBonus(el, extras); // también valida los ids
  const bonus = level >= 1 ? extra : 0;
  const adjust = qoe === 0 ? 0 : Math.sign(qoe) * lv.qoe[Math.abs(qoe) - 1];
  const base = lv.base;
  return { level, code: lv.code, base, qoe: round2(adjust), bonus, total: round2(base + adjust + bonus) };
}

/** Nivel de grupo derivado de los niveles de las patinadoras; null si aún no hay suficientes. */
export function derivedGroupLevel(el: TechElement, skaterLevels: readonly (number | null | undefined)[]): number | null {
  const levels = skaterLevels.filter((l): l is number => typeof l === 'number');
  for (let target = el.levels.length - 1; target >= 0; target--) {
    if (levels.filter(l => l >= target).length >= el.minSkaters) return target;
  }
  return null;
}

export interface ElementSummary {
  /** Cuántas patinadoras tienen nivel puesto. */
  scored: number;
  derivedLevel: number | null;
  /** Nivel que se usa para el grupo: el manual si lo hay, si no el derivado. */
  groupLevel: number | null;
  groupLevelIsAuto: boolean;
  group: ElementValue | null;
  athletes: Record<string, ElementValue | null>;
}

export interface Summary {
  elements: Record<string, ElementSummary>;
  /** Total técnico = suma de los valores de grupo. */
  technicalTotal: number;
  /** Suma de los valores individuales (seguimiento). */
  athleteTotals: Record<string, number>;
  /** Filas descartadas por no cumplir el catálogo (nivel, QOE o extra inexistentes). */
  ignored: number;
}

export function summarize(allScores: readonly Score[], athletes: readonly string[], catalog: readonly TechElement[] = CATALOG): Summary {
  // Una fila inconsistente en la base no debe tumbar la página: se ignora y se cuenta.
  const scores = allScores.filter(s => validateScore(s, athletes) === null);
  const elements: Record<string, ElementSummary> = {};
  const athleteTotals: Record<string, number> = Object.fromEntries(athletes.map(a => [a, 0]));
  let technicalTotal = 0;

  for (const el of catalog) {
    const mine = scores.filter(s => s.elemento === el.id);
    const groupRow = mine.find(s => s.atleta === null);
    const athleteValues: Record<string, ElementValue | null> = {};
    const levels: (number | null)[] = [];

    for (const name of athletes) {
      const row = mine.find(s => s.atleta === name);
      if (row && row.nivel !== null) {
        athleteValues[name] = elementValue(el, row.nivel, row.qoe);
        athleteTotals[name] = round2(athleteTotals[name] + athleteValues[name]!.total);
        levels.push(row.nivel);
      } else {
        athleteValues[name] = null;
      }
    }

    const derivedLevel = derivedGroupLevel(el, levels);
    const groupLevel = groupRow?.nivel ?? derivedLevel;
    const group = groupRow && groupLevel !== null ? elementValue(el, groupLevel, groupRow.qoe, groupRow.extras) : null;
    if (group) technicalTotal = round2(technicalTotal + group.total);

    elements[el.id] = {
      scored: levels.length,
      derivedLevel,
      groupLevel,
      groupLevelIsAuto: groupRow?.nivel == null,
      group,
      athletes: athleteValues,
    };
  }
  return { elements, technicalTotal, athleteTotals, ignored: allScores.length - scores.length };
}

/** ¿La puntuación es válida contra el catálogo (y, si se pasan, las patinadoras conocidas)? Devuelve el motivo si no. */
export function validateScore(s: Score, athletes?: readonly string[]): string | null {
  const el = getElement(s.elemento);
  if (!el) return `Elemento desconocido: ${s.elemento}`;
  if (athletes && s.atleta !== null && !athletes.includes(s.atleta)) return `Patinadora desconocida: ${s.atleta}`;
  try {
    if (s.nivel !== null) assertLevel(el, s.nivel);
    else if (s.atleta !== null) return 'Una patinadora necesita nivel';
    assertQoe(s.qoe);
    extraBonus(el, s.extras);
    if (s.atleta !== null && s.extras.length) return 'Las extra features son del grupo';
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}
