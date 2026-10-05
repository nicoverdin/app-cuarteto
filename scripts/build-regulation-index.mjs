#!/usr/bin/env node
// Construye la base de conocimientos del reglamento a partir de los PDF oficiales.
//
//   node scripts/build-regulation-index.mjs [--dir ~/Descargas] [--no-embeddings]
//
// Salida (en data/regulation/, ignorada por git porque los reglamentos son propiedad de World Skate):
//   chunks.json      fragmentos con documento, sección y páginas
//   embeddings.json  vectores de Voyage AI (solo si hay VOYAGE_API_KEY)
//
// Requiere `pdftotext` (poppler-utils) instalado en la máquina donde se ejecuta.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const SOURCES = [
  {
    id: 'quartets',
    title: 'Quartets Rules (World Skate Artistic 2026)',
    file: 'Quartets 2026 - Official Regulation Artistic.pdf updt 2508.pdf',
  },
  {
    id: 'general',
    title: 'General Rules (World Skate Artistic 2026)',
    file: 'General 2026 - Official Regulation Artistic updt 2909.pdf',
  },
  {
    id: 'artistic-impression',
    title: 'Artistic Impression (World Skate Artistic 2026)',
    file: 'Artistic Impression 2026 - Official Regulation Artistic.pdf',
  },
  {
    id: 'quartet-values',
    title: 'Quartet values / puntuaciones base (Rollart 2026)',
    file: 'ROLLART - Quartet values 2026.pdf',
  },
];

const MAX_WORDS = 260; // tamaño objetivo máximo de un fragmento
const HARD_MAX_WORDS = 340; // si no hay salto de párrafo, se corta aquí
const MIN_WORDS = 50; // secciones más pequeñas se unen a la siguiente

const args = process.argv.slice(2);
const argValue = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = resolve((argValue('--dir') ?? join(homedir(), 'Descargas')).replace(/^~/, homedir()));
const skipEmbeddings = args.includes('--no-embeddings');
const outDir = resolve('data/regulation');

const wordCount = s => (s.match(/\S+/g) ?? []).length;

function readPages(path) {
  const text = execFileSync('pdftotext', ['-layout', path, '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'], // poppler avisa de XRef dañados; no es un error
  });
  const pages = text.split('\f');
  if (pages.at(-1)?.trim() === '') pages.pop();
  return pages;
}

// Líneas que se repiten en muchas páginas (cabeceras/pies) y números de página sueltos.
function cleanPages(pages) {
  const norm = l => l.trim().replace(/\s+/g, ' ');
  const counts = new Map();
  for (const p of pages) {
    for (const key of new Set(p.split('\n').map(norm).filter(Boolean))) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const isNoise = line => {
    const t = norm(line);
    if (!t) return false;
    if (/^\d{1,3}$/.test(t)) return true;
    if (/^UPDATE:.*\d+$/.test(t)) return true;
    if (/^[A-Z ]+ RULES FOR ARTISTIC SKATING WORLDSKATE$/.test(t)) return true;
    return t.length < 140 && (counts.get(t) ?? 0) >= threshold;
  };
  return pages.map(p =>
    p
      .split('\n')
      .filter(l => !isNoise(l))
      .map(l => l.replace(/\s+$/g, '').replace(/[ \t]{3,}/g, '  '))
  );
}

// "3.2 COSTUME REQUIREMENTS", "5.2       CANON ELEMENT", "1. OWNERSHIP"
const HEADING = /^\s{0,10}(\d+(?:\.\d+){0,3})\.?\s+([A-Z][^a-z]{2,90})$/;
// Subapartados "9.2.1 Base value penalties": exigen al menos dos niveles para no confundirlos con listas "1. Texto".
const SUBHEADING = /^\s{0,10}(\d+\.\d+(?:\.\d+){0,2})\s+([A-Z][A-Za-z0-9 &,/’'()\-–:]{2,80})$/;

function parseHeading(line) {
  if (/\.{4,}/.test(line)) return null; // índice con puntos
  if (/\s{2,}\d+\s*$/.test(line)) return null; // índice con nº de página
  const m = HEADING.exec(line) ?? (/\s{2,}\S/.test(line.trim()) ? null : SUBHEADING.exec(line));
  if (!m) return null;
  const title = m[2].trim();
  if ((title.match(/[A-Za-z]/g) ?? []).length < 3 || title.split(/\s+/).length > 12) return null;
  return { number: m[1], title, level: m[1].split('.').length };
}

function chunkDocument(source, pages) {
  const chunks = [];
  const stack = []; // jerarquía de encabezados vigente
  let cur = null;

  const label = () => stack.map(h => `${h.number} ${h.title}`).join(' > ') || 'Preamble';
  const start = page => ({ lines: [], words: 0, section: label(), pageStart: page, pageEnd: page });
  const flush = () => {
    if (!cur) return;
    const body = cur.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (wordCount(body) >= 8) {
      chunks.push({
        id: `${source.id}-${String(chunks.length + 1).padStart(3, '0')}`,
        docId: source.id,
        docTitle: source.title,
        section: cur.section,
        pageStart: cur.pageStart,
        pageEnd: cur.pageEnd,
        text: body,
      });
    }
    cur = null;
  };

  pages.forEach((lines, idx) => {
    const page = idx + 1;
    for (const line of lines) {
      if (/\.{6,}/.test(line)) continue; // líneas de índice
      const h = parseHeading(line);
      if (h) {
        // Las secciones pequeñas se acumulan en el mismo fragmento; las grandes se cierran.
        if (!cur || cur.words >= MIN_WORDS) {
          flush();
          while (stack.length && stack.at(-1).level >= h.level) stack.pop();
          stack.push(h);
          cur = start(page);
        } else {
          while (stack.length && stack.at(-1).level >= h.level) stack.pop();
          stack.push(h);
          cur.section = label();
        }
        cur.lines.push(line.trim());
        cur.words += wordCount(line);
        continue;
      }
      if (!cur) cur = start(page);
      const blank = line.trim() === '';
      if ((cur.words >= MAX_WORDS && blank) || cur.words >= HARD_MAX_WORDS) {
        flush();
        cur = start(page);
      }
      cur.lines.push(line);
      cur.words += wordCount(line);
      cur.pageEnd = page;
    }
    if (cur) cur.pageEnd = page;
  });
  flush();
  return chunks;
}

// Voyage limita las cuentas sin método de pago a 3 peticiones/min y 10.000 tokens/min.
// Se envían lotes pequeños (≈5.000 tokens estimados), con pausas y reintentos ante un 429,
// así funciona igual con o sin tarjeta (con tarjeta se puede acelerar con VOYAGE_PACE_MS=0).
const PACE_MS = Number(process.env.VOYAGE_PACE_MS ?? 21000);
const BATCH_TOKENS = 5000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const estimateTokens = t => Math.ceil(wordCount(t) * 1.6);

async function embedBatch(batch, inputType, model) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
      body: JSON.stringify({ input: batch, model, input_type: inputType, truncation: true }),
    });
    if (res.status === 429 && attempt <= 6) {
      process.stdout.write(`\n  límite de velocidad, reintento en 30 s (${attempt}/6)…`);
      await sleep(30000);
      continue;
    }
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return (json.data ?? json.embeddings).map(d => d.embedding ?? d);
  }
}

async function embed(texts, inputType) {
  const model = process.env.VOYAGE_MODEL ?? 'voyage-4';
  const batches = [];
  let current = [];
  let tokens = 0;
  for (const t of texts) {
    const n = estimateTokens(t);
    if (current.length && tokens + n > BATCH_TOKENS) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(t);
    tokens += n;
  }
  if (current.length) batches.push(current);

  const vectors = [];
  for (const [i, batch] of batches.entries()) {
    if (i > 0) await sleep(PACE_MS);
    vectors.push(...(await embedBatch(batch, inputType, model)));
    process.stdout.write(`  embeddings ${vectors.length}/${texts.length} (lote ${i + 1}/${batches.length})\r`);
  }
  process.stdout.write('\n');
  return { model, vectors };
}

// ---------------------------------------------------------------------------------------------

const all = [];
for (const source of SOURCES) {
  const path = join(dir, source.file);
  if (!existsSync(path)) {
    console.error(`✗ No encuentro ${path}`);
    process.exit(1);
  }
  const chunks = chunkDocument(source, cleanPages(readPages(path)));
  const words = chunks.reduce((n, c) => n + wordCount(c.text), 0);
  console.log(`✓ ${source.title}: ${chunks.length} fragmentos, ${words} palabras`);
  all.push(...chunks);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'chunks.json'), JSON.stringify(all, null, 1));
console.log(`→ ${join(outDir, 'chunks.json')} (${all.length} fragmentos)`);

if (skipEmbeddings) {
  console.log('Embeddings omitidos (--no-embeddings).');
} else if (!process.env.VOYAGE_API_KEY) {
  console.log('Sin VOYAGE_API_KEY: la búsqueda funcionará solo con BM25. Define la clave y repite para añadir embeddings.');
} else {
  const texts = all.map(c => `${c.docTitle} — ${c.section}\n${c.text}`);
  const { model, vectors } = await embed(texts, 'document');
  const round = v => v.map(x => Math.round(x * 1e5) / 1e5);
  writeFileSync(
    join(outDir, 'embeddings.json'),
    JSON.stringify({ model, ids: all.map(c => c.id), vectors: vectors.map(round) })
  );
  console.log(`→ embeddings.json (${vectors.length} vectores, modelo ${model})`);
}
