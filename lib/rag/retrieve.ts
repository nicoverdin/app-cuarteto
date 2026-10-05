import { getStore } from './store';
import { queryTokens } from './text';
import { embedQuery, voyageEnabled } from './voyage';
import type { Hit } from './types';

const RRF_K = 60;
const CANDIDATES = 20;

export interface Retrieval {
  hits: Hit[];
  kind: 'hibrida' | 'bm25';
}

/**
 * Búsqueda híbrida: BM25 (léxica) + similitud coseno (semántica) fusionadas con Reciprocal Rank Fusion.
 * `english` es una reformulación opcional de la pregunta en inglés (los reglamentos están en inglés).
 * Si no hay embeddings o Voyage falla, devuelve solo BM25.
 */
export async function retrieve(question: string, k: number, english = ''): Promise<Retrieval> {
  const store = getStore();
  const scores = new Map<number, number>();
  const add = (index: number, rank: number) => scores.set(index, (scores.get(index) ?? 0) + 1 / (RRF_K + rank));

  store.bm25.search(queryTokens(question, english), CANDIDATES).forEach((r, rank) => add(r.index, rank));

  let kind: Retrieval['kind'] = 'bm25';
  if (store.vectors && store.embeddingModel && voyageEnabled()) {
    try {
      const q = await embedQuery(english ? `${question}\n${english}` : question, store.embeddingModel);
      store.vectors
        .map((v, index) => {
          let dot = 0;
          for (let i = 0; i < v.length; i++) dot += v[i] * q[i];
          return { index, score: dot };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, CANDIDATES)
        .forEach((r, rank) => add(r.index, rank));
      kind = 'hibrida';
    } catch {
      /* se sigue solo con BM25 */
    }
  }

  const hits = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([index, score]) => ({ chunk: store.chunks[index], score }));
  return { hits, kind };
}
