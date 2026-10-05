import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Bm25Index } from './bm25';
import { tokenize } from './text';
import type { Chunk } from './types';

export interface Store {
  chunks: Chunk[];
  bm25: Bm25Index;
  /** Vectores normalizados (uno por fragmento) o null si no se generaron embeddings. */
  vectors: Float32Array[] | null;
  embeddingModel: string | null;
}

let cached: Store | null = null;

const dataDir = () => process.env.REGLAMENTO_DATA_DIR ?? path.join(process.cwd(), 'data', 'regulation');

function normalize(v: number[]): Float32Array {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Float32Array.from(v, x => x / norm);
}

/** Carga el índice una sola vez por proceso (reinicia el servidor tras regenerarlo). */
export function getStore(): Store {
  if (cached) return cached;
  const chunksPath = path.join(dataDir(), 'chunks.json');
  if (!existsSync(chunksPath)) {
    throw new Error(
      'Falta la base de conocimientos del reglamento. Ejecuta: node scripts/build-regulation-index.mjs'
    );
  }
  const chunks: Chunk[] = JSON.parse(readFileSync(chunksPath, 'utf8'));
  // El título de sección cuenta doble: las consultas suelen nombrar el apartado ("penalizaciones", "vestuario").
  const bm25 = new Bm25Index(chunks.map(c => tokenize(`${c.section} ${c.section} ${c.text}`)));

  let vectors: Float32Array[] | null = null;
  let embeddingModel: string | null = null;
  const embPath = path.join(dataDir(), 'embeddings.json');
  if (existsSync(embPath)) {
    const emb = JSON.parse(readFileSync(embPath, 'utf8')) as { model: string; ids: string[]; vectors: number[][] };
    const byId = new Map(emb.ids.map((id, i) => [id, emb.vectors[i]]));
    if (chunks.every(c => byId.has(c.id))) {
      vectors = chunks.map(c => normalize(byId.get(c.id)!));
      embeddingModel = emb.model;
    }
  }
  cached = { chunks, bm25, vectors, embeddingModel };
  return cached;
}
