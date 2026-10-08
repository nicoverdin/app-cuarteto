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

// Raíz simple y simétrica: singular y plural (y -ed/-ing) acaban en la misma raíz
// (rule/rules → rul, judge/judges → judg, score/scored/scoring → scor).
function stem(t: string): string {
  let w = t;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('ones')) w = w.slice(0, -2); // español: penalizaciones → penalizacion
  else if (w.length > 4 && /(?:[sxz]|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
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
  cae: 'fall falls',
  caen: 'fall falls',
  cayo: 'fall falls',
  caerse: 'fall falls',
  vestuario: 'costume',
  disfraz: 'costume',
  traje: 'costume',
  musica: 'music',
  duracion: 'time duration length',
  durar: 'time duration length',
  dura: 'time duration length',
  duran: 'time duration length',
  durante: 'time duration length',
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
