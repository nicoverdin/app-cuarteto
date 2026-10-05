import Anthropic from '@anthropic-ai/sdk';
import { retrieve } from './retrieve';
import { NOT_FOUND_RE, REWRITE_SYSTEM, SYSTEM } from './prompts';
import {
  chunkLabel,
  pagesLabel,
  type AskResult,
  type Hit,
  type Mode,
  type Passage,
  type Segment,
  type SourceRef,
} from './types';

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

/** Fragmentos que se pasan al modelo (3-5 según el modo). */
const TOP_K: Record<Mode, number> = { buscar: 8, breve: 3, experto: 5 };

const MODEL = () => process.env.REGLAMENTO_MODEL ?? 'claude-opus-5-5';
const REWRITE_MODEL = () => process.env.REGLAMENTO_REWRITE_MODEL ?? 'claude-haiku-4-5';

export interface AskDeps {
  /** Reformula la pregunta en inglés técnico; si falla, se busca con la pregunta original. */
  rewrite: (question: string) => Promise<string>;
  generate: (mode: Exclude<Mode, 'buscar'>, question: string, hits: Hit[]) => Promise<BetaMessage>;
}

export function createClient() {
  // Lee ANTHROPIC_API_KEY. Las claves no asociadas a un workspace necesitan indicar cuál usar.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {});
}

export const defaultDeps: AskDeps = {
  async rewrite(question) {
    const res = await createClient().messages.create({
      model: REWRITE_MODEL(),
      max_tokens: 120,
      system: REWRITE_SYSTEM,
      messages: [{ role: 'user', content: question }],
    });
    const block = res.content.find(b => b.type === 'text');
    return block && block.type === 'text' ? block.text.trim() : '';
  },

  async generate(mode, question, hits) {
    const model = MODEL();
    // Cada fragmento va como documento con citas activadas: la respuesta llega con referencias
    // a los fragmentos exactos (y al texto literal) en los que se apoya.
    const documents = hits.map(({ chunk }) => ({
      type: 'document' as const,
      source: { type: 'text' as const, media_type: 'text/plain' as const, data: chunk.text },
      title: `${chunkLabel(chunk)} (${pagesLabel(chunk)})`,
      citations: { enabled: true },
    }));
    return createClient().beta.messages.create({
      model,
      max_tokens: mode === 'breve' ? 1500 : 6000,
      system: SYSTEM[mode],
      output_config: { effort: mode === 'breve' ? 'low' : 'medium' },
      // Ante un rechazo de seguridad, la API reintenta en el modelo de reserva dentro de la misma llamada.
      ...(/^claude-(opus-5|sonnet-5-5|fable-5)/.test(model)
        ? { betas: ['server-side-fallback-2026-07-01' as const], fallbacks: 'default' as const }
        : {}),
      messages: [
        {
          role: 'user',
          content: [...documents, { type: 'text', text: `Pregunta: ${question}` }],
        },
      ],
    });
  },
};

const toPassage = ({ chunk }: Hit): Passage => ({
  chunkId: chunk.id,
  label: chunkLabel(chunk),
  pages: pagesLabel(chunk),
  text: chunk.text,
});

/** Convierte la respuesta del modelo en segmentos de texto con sus referencias numeradas. */
export function parseAnswer(message: BetaMessage, hits: Hit[]) {
  const segments: Segment[] = [];
  const order = new Map<number, number>(); // índice de documento → nº de fuente
  const sources: SourceRef[] = [];

  for (const block of message.content) {
    if (block.type !== 'text') continue;
    const refs: number[] = [];
    for (const cit of block.citations ?? []) {
      if (cit.type !== 'char_location') continue;
      const hit = hits[cit.document_index];
      if (!hit) continue; // referencia a un documento que no enviamos: se ignora
      let n = order.get(cit.document_index);
      if (!n) {
        n = order.size + 1;
        order.set(cit.document_index, n);
        sources.push({
          n,
          chunkId: hit.chunk.id,
          docTitle: hit.chunk.docTitle,
          section: hit.chunk.section,
          pages: pagesLabel(hit.chunk),
          quote: cit.cited_text,
        });
      }
      if (!refs.includes(n)) refs.push(n);
    }
    if (block.text) segments.push({ text: block.text, refs });
  }
  return { segments, sources };
}

export async function ask(question: string, mode: Mode, deps: AskDeps = defaultDeps): Promise<AskResult> {
  // Reformulación en inglés (opcional): mejora la búsqueda léxica sobre reglamentos en inglés.
  let english = '';
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      english = await deps.rewrite(question);
    } catch {
      /* se busca con la pregunta original */
    }
  }

  const { hits, kind } = await retrieve(question, TOP_K[mode], english);
  const passages = hits.map(toPassage);

  if (mode === 'buscar') {
    return { mode, answer: null, sources: [], passages, retrieval: kind };
  }
  if (hits.length === 0) {
    return {
      mode,
      answer: [{ text: 'No aparece en los fragmentos del reglamento consultados.', refs: [] }],
      sources: [],
      passages,
      retrieval: kind,
    };
  }

  const message = await deps.generate(mode, question, hits);
  const { segments, sources } = parseAnswer(message, hits);
  const text = segments.map(s => s.text).join('');

  // Post-procesado: una respuesta sin citas solo es válida si dice que no aparece en el reglamento.
  let warning: AskResult['warning'];
  if (message.stop_reason === 'refusal') warning = 'rechazada';
  else if (message.stop_reason === 'max_tokens') warning = 'truncada';
  else if (sources.length === 0 && !NOT_FOUND_RE.test(text)) warning = 'sin_citas';

  return {
    mode,
    answer: segments.length ? segments : [{ text: 'No he podido generar una respuesta.', refs: [] }],
    sources,
    passages,
    warning,
    retrieval: kind,
  };
}
