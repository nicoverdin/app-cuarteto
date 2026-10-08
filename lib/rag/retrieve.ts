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
 * Si no hay embeddings, Voyage falla o `semantic` es false (modo «buscar»: sin coste), devuelve solo BM25.
 * No se aplica umbral de relevancia: las puntuaciones de BM25/RRF no están calibradas y un corte
 * arriesgaría descartar fragmentos válidos; el modelo ya responde «no aparece» si no hay base.
 */
export async function retrieve(question: string, k: number, english = '', semantic = true): Promise<Retrieval> {
  const store = getStore();
  const scores = new Map<number, number>();
  const add = (index: number, rank: number) => scores.set(index, (scores.get(index) ?? 0) + 1 / (RRF_K + rank));

  store.bm25.search(queryTokens(question, english), CANDIDATES).forEach((r, rank) => add(r.index, rank));

  let kind: Retrieval['kind'] = 'bm25';
  if (semantic && store.vectors && store.embeddingModel && voyageEnabled()) {
    try {
      const q = await embedQuery(english ? `${question}\n${english}` : question, store.embeddingModel);
      if (store.vectors[0] && store.vectors[0].length !== q.length) {
        // Índice y consulta con distinta dimensión (modelo cambiado): los productos no tendrían sentido.
        console.warn('[reglamento] dimensión de embeddings distinta (índice vs consulta); se usa solo BM25');
      } else {
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
      }
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
