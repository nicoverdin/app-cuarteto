// Tokenización para BM25: minúsculas, sin acentos, sin palabras vacías (inglés y español) y raíz simple.
const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can for from has have if in into is it its may not of on or shall should ' +
    'than that the their then there these they this to was were which will with must also any all each per ' +
    'al algo como con cual cuales cuando de del el ella ellos en es esta este esto la las lo los mas me mi muy no o ' +
    'para pero por que se si sin sobre son su sus te tiene tienen un una uno unos unas y ya hay puede pueden ser ' +
    'cuanto cuantos cuantas cuanta donde quien segun entre hasta'
  ).split(' ')
);

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function stem(t: string): string {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('ed')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

export function tokenize(text: string): string[] {
  return strip(text.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

// Glosario mínimo español → inglés del reglamento: permite buscar por palabras clave en español
// aunque los documentos estén en inglés (y sin necesidad de ninguna API).
const GLOSSARY: Record<string, string> = {
  penalizacion: 'penalty penalization deduction',
  penalizaciones: 'penalty penalization deduction',
  penalizar: 'penalty penalization',
  falta: 'fault penalty violation',
  faltas: 'fault penalty violation',
  caida: 'fall falls',
  caidas: 'fall falls',
  vestuario: 'costume',
  disfraz: 'costume',
  traje: 'costume',
  musica: 'music',
  duracion: 'time duration length',
  tiempo: 'time duration',
  salto: 'jump leap',
  saltos: 'jump leap',
  giro: 'turn rotation',
  giros: 'turn rotation',
  elemento: 'element',
  elementos: 'element',
  nivel: 'level',
  niveles: 'level',
  categoria: 'category senior junior cadet',
  categorias: 'category senior junior cadet',
  puntuacion: 'score points value',
  puntos: 'points score value',
  arbitro: 'referee',
  juez: 'judge',
  jueces: 'judges panel',
  panel: 'panel technical',
  cuarteto: 'quartet quartets',
  cuartetos: 'quartet quartets',
  entrada: 'entry',
  salida: 'exit',
  pista: 'rink floor',
  iluminacion: 'illumination lighting',
  patin: 'skate skates',
  patines: 'skate skates',
  patinador: 'skater',
  patinadoras: 'skater skaters',
  patinadores: 'skater skaters',
  formacion: 'formation',
  cruce: 'crossing',
  cruces: 'crossing',
  linea: 'line',
  bloque: 'block',
  coreografia: 'choreography',
  transiciones: 'transitions',
  transicion: 'transitions',
  descalificacion: 'disqualification',
  descalificar: 'disqualification',
  obligatorio: 'required mandatory',
  obligatorios: 'required mandatory',
  prohibido: 'prohibited forbidden not allowed',
  permitido: 'allowed permitted',
  accesorios: 'props accessories',
  maximo: 'maximum',
  minimo: 'minimum',
  sorteo: 'draw',
  calentamiento: 'warm-up warm up',
  interrupcion: 'interruption',
  interrumpe: 'interruption interrupted',
  interrumpir: 'interruption interrupted',
  interrumpida: 'interruption interrupted',
  programa: 'program',
  reclamacion: 'protest appeal',
  protesta: 'protest appeal',
  edad: 'age',
  impresion: 'impression',
  artistica: 'artistic',
  tecnico: 'technical',
  tecnica: 'technical',
};

/** Tokens de consulta: los de la pregunta más la traducción de las palabras del glosario. */
export function queryTokens(question: string, extra = ''): string[] {
  const base = tokenize(`${question} ${extra}`);
  const translated = strip(question.toLowerCase())
    .split(/[^a-z0-9]+/)
    .flatMap(w => (GLOSSARY[w] ? tokenize(GLOSSARY[w]) : []));
  return [...base, ...translated];
}
