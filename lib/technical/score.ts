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
// Intentos: una sesión puede tener varios intentos del mismo elemento (entrenamientos). Cada intento se puntúa por
// separado y el total técnico cuenta, de cada elemento, el intento de mayor valor de grupo (si empatan, el último).
// Los totales individuales (seguimiento) usan el mejor valor propio de cada patinadora en cada elemento.

import { CATALOG, MAX_QOE, TechElement, getElement } from './catalog';

/** Máximo de intentos de un mismo elemento en una sesión. */
export const MAX_ATTEMPTS = 20;

export interface Score {
  elemento: string;
  /** Número de intento del elemento dentro de la sesión (1, 2, 3…). */
  intento: number;
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

/** Resultado de un intento de un elemento. */
export interface AttemptSummary {
  /** Cuántas patinadoras tienen nivel puesto. */
  scored: number;
  derivedLevel: number | null;
  /** Nivel que se usa para el grupo: el manual si lo hay, si no el derivado. */
  groupLevel: number | null;
  groupLevelIsAuto: boolean;
  group: ElementValue | null;
  athletes: Record<string, ElementValue | null>;
}

export interface ElementSummary {
  /** Intentos con alguna puntuación, por número de intento. */
  attempts: Record<number, AttemptSummary>;
  /** Números de intento con datos, de menor a mayor. */
  list: number[];
  /** Intento que cuenta para el total técnico (mayor valor de grupo; si empatan, el último). null = ninguno valorado. */
  best: number | null;
  bestValue: ElementValue | null;
}

export interface Summary {
  elements: Record<string, ElementSummary>;
  /** Total técnico = suma, por elemento, del mejor valor de grupo. */
  technicalTotal: number;
  /** Suma del mejor valor individual de cada elemento (seguimiento). */
  athleteTotals: Record<string, number>;
  /** Filas descartadas por no cumplir el catálogo (nivel, QOE o extra inexistentes). */
  ignored: number;
}

/** Intento vacío (aún sin puntuaciones), para pintar un intento recién creado. */
export const emptyAttempt = (athletes: readonly string[]): AttemptSummary => ({
  scored: 0,
  derivedLevel: null,
  groupLevel: null,
  groupLevelIsAuto: true,
  group: null,
  athletes: Object.fromEntries(athletes.map(a => [a, null])),
});

function summarizeAttempt(el: TechElement, rows: readonly Score[], athletes: readonly string[]): AttemptSummary {
  const groupRow = rows.find(s => s.atleta === null);
  const athleteValues: Record<string, ElementValue | null> = {};
  const levels: (number | null)[] = [];
  for (const name of athletes) {
    const row = rows.find(s => s.atleta === name);
    if (row && row.nivel !== null) {
      athleteValues[name] = elementValue(el, row.nivel, row.qoe);
      levels.push(row.nivel);
    } else {
      athleteValues[name] = null;
    }
  }
  const derivedLevel = derivedGroupLevel(el, levels);
  const groupLevel = groupRow?.nivel ?? derivedLevel;
  const group = groupRow && groupLevel !== null ? elementValue(el, groupLevel, groupRow.qoe, groupRow.extras) : null;
  return {
    scored: levels.length,
    derivedLevel,
    groupLevel,
    groupLevelIsAuto: groupRow?.nivel == null,
    group,
    athletes: athleteValues,
  };
}

export function summarize(allScores: readonly Score[], athletes: readonly string[], catalog: readonly TechElement[] = CATALOG): Summary {
  // Una fila inconsistente en la base no debe tumbar la página: se ignora y se cuenta.
  const scores = allScores.filter(s => validateScore(s, athletes) === null);
  const elements: Record<string, ElementSummary> = {};
  const bestOwn: Record<string, number>[] = []; // por elemento: mejor valor de cada patinadora
  let technicalTotal = 0;

  for (const el of catalog) {
    const mine = scores.filter(s => s.elemento === el.id);
    const list = [...new Set(mine.map(s => s.intento))].sort((a, b) => a - b);
    const attempts: Record<number, AttemptSummary> = {};
    let best: number | null = null;
    const own: Record<string, number> = {};

    for (const n of list) {
      const att = summarizeAttempt(el, mine.filter(s => s.intento === n), athletes);
      attempts[n] = att;
      // `>=`: en un empate cuenta el intento posterior.
      if (att.group && (best === null || att.group.total >= attempts[best].group!.total)) best = n;
      for (const name of athletes) {
        const v = att.athletes[name];
        if (v && (own[name] === undefined || v.total > own[name])) own[name] = v.total;
      }
    }
    const bestValue = best === null ? null : attempts[best].group;
    if (bestValue) technicalTotal = round2(technicalTotal + bestValue.total);
    bestOwn.push(own);
    elements[el.id] = { attempts, list, best, bestValue };
  }

  const athleteTotals: Record<string, number> = Object.fromEntries(athletes.map(a => [a, 0]));
  for (const own of bestOwn) for (const name of athletes) if (own[name] !== undefined) athleteTotals[name] = round2(athleteTotals[name] + own[name]);
  return { elements, technicalTotal, athleteTotals, ignored: allScores.length - scores.length };
}

/** ¿La puntuación es válida contra el catálogo (y, si se pasan, las patinadoras conocidas)? Devuelve el motivo si no. */
export function validateScore(s: Score, athletes?: readonly string[]): string | null {
  const el = getElement(s.elemento);
  if (!el) return `Elemento desconocido: ${s.elemento}`;
  if (!Number.isInteger(s.intento) || s.intento < 1 || s.intento > MAX_ATTEMPTS) return `Intento ${s.intento} fuera de rango (1–${MAX_ATTEMPTS})`;
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
