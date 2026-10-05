export interface Chunk {
  id: string;
  docId: string;
  docTitle: string;
  section: string;
  pageStart: number;
  pageEnd: number;
  text: string;
}

/** buscar = solo recuperación (sin LLM); experto = respuesta detallada; breve = 1-3 frases. */
export type Mode = 'experto' | 'breve' | 'buscar';
export const MODES: Mode[] = ['experto', 'breve', 'buscar'];

export interface Hit {
  chunk: Chunk;
  score: number;
}

export interface SourceRef {
  n: number;
  chunkId: string;
  docTitle: string;
  section: string;
  pages: string;
  /** Texto literal del reglamento en el que se apoya la cita. */
  quote: string;
}

export interface Segment {
  text: string;
  refs: number[];
}

export interface Passage {
  chunkId: string;
  label: string;
  pages: string;
  text: string;
}

export interface AskResult {
  mode: Mode;
  /** Respuesta en segmentos con sus citas; null en modo buscar. */
  answer: Segment[] | null;
  sources: SourceRef[];
  /** Fragmentos recuperados (en modo buscar, el resultado; en los demás, los consultados). */
  passages: Passage[];
  warning?: 'sin_citas' | 'truncada' | 'rechazada';
  retrieval: 'hibrida' | 'bm25';
}

export const pagesLabel = (c: Chunk) =>
  c.pageStart === c.pageEnd ? `p. ${c.pageStart}` : `pp. ${c.pageStart}–${c.pageEnd}`;

export const chunkLabel = (c: Chunk) => `${c.docTitle} · ${c.section}`;
