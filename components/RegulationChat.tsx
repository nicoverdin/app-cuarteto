"use client";
import { useId, useRef, useState } from 'react';
import { Search, Send } from 'lucide-react';
import type { AskResult, Mode, Passage } from '../lib/rag/types';

const MODE_OPTIONS: { value: Mode; label: string; hint: string }[] = [
  { value: 'experto', label: 'Consultor experto', hint: 'Respuesta completa con explicación' },
  { value: 'breve', label: 'Respuesta breve', hint: 'Máximo tres frases' },
  { value: 'buscar', label: 'Solo buscar', hint: 'Muestra los fragmentos, sin IA' },
];

const EXAMPLES = [
  '¿Cuánto puede durar el programa de un cuarteto?',
  '¿Qué penalizaciones aplica el árbitro?',
  '¿Qué requisitos tiene el vestuario?',
  '¿Qué es el elemento Canon?',
];

const WARNINGS: Record<NonNullable<AskResult['warning']>, string> = {
  sin_citas: 'Esta respuesta no cita el reglamento. Compruébala en el documento oficial antes de fiarte.',
  truncada: 'La respuesta se cortó por longitud. Prueba con una pregunta más concreta.',
  rechazada: 'El modelo ha rechazado responder a esta pregunta.',
};

interface Item {
  id: number;
  question: string;
  mode: Mode;
  result?: AskResult & { cached?: boolean };
  error?: string;
}

const CODE_KEY = 'cuarteto:reglamento-code';
const readCode = () => {
  try {
    return (localStorage.getItem(CODE_KEY) ?? '').trim();
  } catch {
    return '';
  }
};

function PassageView({ p }: { p: Passage }) {
  return (
    <details className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold text-ink focus-visible:outline-2 focus-visible:outline-accent rounded">
        {p.label} <span className="font-normal text-ink-muted">· {p.pages}</span>
      </summary>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-ink-soft">{p.text}</pre>
    </details>
  );
}

function AnswerView({ item }: { item: Item }) {
  const { result, error } = item;
  if (error) {
    return <p role="alert" className="text-sm text-danger">{error}</p>;
  }
  if (!result) return null;

  const byId = new Map(result.passages.map(p => [p.chunkId, p]));
  return (
    <div className="space-y-3">
      {result.answer && (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
          {result.answer.map((seg, i) => (
            <span key={i}>
              {seg.text}
              {seg.refs.map(n => (
                <a
                  key={n}
                  href={`#src-${item.id}-${n}`}
                  aria-label={`Fuente ${n}`}
                  className="mx-0.5 align-super text-[11px] font-bold text-accent no-underline focus-visible:outline-2 focus-visible:outline-accent rounded"
                >
                  [{n}]
                </a>
              ))}
            </span>
          ))}
        </p>
      )}

      {result.warning && (
        <p role="status" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-soft">
          {WARNINGS[result.warning]}
        </p>
      )}

      {result.sources.length > 0 && (
        <section aria-label="Fuentes citadas">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Fuentes</h3>
          <ol className="mt-2 space-y-2">
            {result.sources.map(s => (
              <li key={s.n} id={`src-${item.id}-${s.n}`} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm scroll-mt-20">
                <p className="font-semibold text-ink">
                  [{s.n}] {s.docTitle} · {s.section} <span className="font-normal text-ink-muted">({s.pages})</span>
                </p>
                <blockquote className="mt-1 border-l-2 border-accent pl-2 text-[13px] italic text-ink-soft">
                  {s.quote}
                </blockquote>
                {byId.get(s.chunkId) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-semibold text-accent">Ver el fragmento completo</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-ink-soft">
                      {byId.get(s.chunkId)!.text}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {!result.answer && (
        <section aria-label="Fragmentos encontrados" className="space-y-2">
          {result.passages.length === 0 && <p className="text-sm text-ink-soft">No se han encontrado fragmentos.</p>}
          {result.passages.map(p => (
            <PassageView key={p.chunkId} p={p} />
          ))}
        </section>
      )}
    </div>
  );
}

export default function RegulationChat() {
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<Mode>('experto');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState(readCode);
  const nextId = useRef(1);
  const inputId = useId();
  const codeId = useId();

  const abortRef = useRef<AbortController | null>(null);

  const submit = async (q: string, queryMode: Mode = mode) => {
    const text = q.trim();
    const codeToSend = code.trim(); // fetch recorta los espacios de la cabecera: un espacio sobrante daría 401
    if (text.length < 3 || loading) return;
    // Las cabeceras HTTP solo admiten ASCII: otro carácter haría fallar fetch con un TypeError.
    if (codeToSend && !/^[\x20-\x7e]*$/.test(codeToSend)) {
      setNeedsCode(true);
      setItems(prev => [
        ...prev,
        { id: nextId.current++, question: text, mode: queryMode, error: 'El código solo puede tener caracteres ASCII.' },
      ]);
      setQuestion('');
      return;
    }
    const id = nextId.current++;
    const base: Item = { id, question: text, mode: queryMode };
    const controller = new AbortController();
    abortRef.current = controller;
    // Tiempo máximo de espera: por encima del presupuesto del servidor (90 s), para recibir su 504 en vez de cortar antes.
    // Nota: cancelar (botón o timeout) no se propaga al servidor, que puede seguir hasta su presupuesto con el hueco ocupado.
    const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), 95_000);
    setItems(prev => [...prev, base]);
    setQuestion('');
    setLoading(true);
    try {
      const res = await fetch('/api/reglamento', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(codeToSend ? { 'x-access-code': codeToSend } : {}) },
        body: JSON.stringify({ question: text, mode: queryMode }),
        signal: controller.signal,
      });
      // Un 502/504 puede traer HTML: no se asume JSON.
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        setNeedsCode(true);
        throw new Error('Introduce el código de acceso para consultar.');
      }
      if (!res.ok) throw new Error(data?.message ?? 'El servidor no responde ahora mismo. Inténtalo de nuevo en un momento.');
      if (!data) throw new Error('Respuesta no válida del servidor. Inténtalo de nuevo.');
      setItems(prev => prev.map(it => (it.id === id ? { ...it, result: data } : it)));
    } catch (e) {
      const reason = controller.signal.reason as { name?: string } | undefined;
      const message = controller.signal.aborted
        ? reason?.name === 'TimeoutError'
          ? 'La consulta ha tardado demasiado. Inténtalo de nuevo.'
          : 'Consulta cancelada.'
        : e instanceof Error && !(e instanceof TypeError)
          ? e.message
          : 'No se pudo conectar con el servidor.';
      setItems(prev => prev.map(it => (it.id === id ? { ...it, error: message } : it)));
    } finally {
      clearTimeout(timer);
      abortRef.current = null;
      setLoading(false);
    }
  };

  const saveCode = (value: string) => {
    const clean = value.trim();
    setCode(clean);
    try {
      localStorage.setItem(CODE_KEY, clean);
    } catch {
      /* se ignora */
    }
  };

  return (
    <div className="mt-5">
      <fieldset className="grid grid-cols-3 gap-2" aria-label="Tipo de consulta">
        {MODE_OPTIONS.map(o => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-xl border px-2 py-2 text-center text-xs font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              mode === o.value ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-ink-soft'
            }`}
          >
            <input type="radio" name="mode" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} className="sr-only" />
            {o.label}
            <span className="mt-0.5 block text-[11px] font-normal text-ink-muted">{o.hint}</span>
          </label>
        ))}
      </fieldset>

      <form
        onSubmit={e => {
          e.preventDefault();
          submit(question);
        }}
        className="mt-3"
      >
        <label htmlFor={inputId} className="sr-only">Tu pregunta sobre el reglamento</label>
        <div className="flex gap-2">
          <textarea
            id={inputId}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(question);
              }
            }}
            maxLength={500}
            rows={2}
            placeholder="Escribe tu pregunta…"
            className="flex-1 resize-none rounded-xl bg-track px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={loading || question.trim().length < 3}
            aria-label={mode === 'buscar' ? 'Buscar' : 'Preguntar'}
            className="h-12 w-12 shrink-0 self-end flex items-center justify-center rounded-xl bg-accent text-on-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {mode === 'buscar' ? <Search className="w-5 h-5" aria-hidden="true" /> : <Send className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </form>

      {needsCode && (
        <div className="mt-3">
          <label htmlFor={codeId} className="text-xs font-semibold text-ink-soft">Código de acceso</label>
          <input
            id={codeId}
            type="password"
            value={code}
            onChange={e => saveCode(e.target.value)}
            className="mt-1 w-full rounded-xl bg-track px-4 py-2 text-[15px] text-ink outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}

      {items.length === 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Prueba con</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                type="button"
                onClick={() => submit(ex)}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs text-ink-soft focus-visible:outline-2 focus-visible:outline-accent"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-6" aria-live="polite">
        {/* La última consulta va arriba, justo bajo el cuadro de pregunta, para no tener que bajar. */}
        {[...items].reverse().map(item => (
          <article key={item.id} className="space-y-2">
            <p className="rounded-2xl bg-accent/10 px-3 py-2 text-sm font-medium text-ink">{item.question}</p>
            {!item.result && !item.error ? (
              <p role="status" className="text-sm text-ink-muted">
                {item.mode === 'buscar' ? 'Buscando…' : 'Consultando el reglamento…'}{' '}
                <button type="button" onClick={() => abortRef.current?.abort()} className="font-semibold text-accent underline focus-visible:outline-2 focus-visible:outline-accent">
                  Cancelar
                </button>
              </p>
            ) : (
              <>
                <AnswerView item={item} />
                {item.error && !loading && (
                  <button type="button" onClick={() => submit(item.question, item.mode)} className="text-xs font-semibold text-accent underline focus-visible:outline-2 focus-visible:outline-accent">
                    Reintentar
                  </button>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      <p className="mt-8 text-xs text-ink-muted">
        Respuestas generadas por IA a partir de los reglamentos de World Skate 2026. Ante cualquier duda o reclamación,
        consulta siempre el documento oficial.
      </p>
    </div>
  );
}
