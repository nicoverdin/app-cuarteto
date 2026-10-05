This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Consulta del reglamento (RAG)

La ruta `/reglamento` responde preguntas sobre el reglamento de cuarteto y los reglamentos generales de World Skate 2026, citando la sección y las páginas.

**Cómo funciona**

1. `scripts/build-regulation-index.mjs` convierte los PDF en fragmentos por sección (`data/regulation/chunks.json`) y, si hay `VOYAGE_API_KEY`, calcula sus embeddings (`embeddings.json`).
2. En cada consulta, Claude Haiku reformula la pregunta en inglés técnico y se hace una **búsqueda híbrida**: BM25 (palabras clave) + similitud de embeddings (Voyage), fusionadas con Reciprocal Rank Fusion. Se recuperan 3-5 fragmentos.
3. Claude responde con esos fragmentos como documentos con **citas activadas**, así cada frase queda enlazada al texto literal del reglamento. Si la respuesta no cita nada, se avisa.
4. Modos: *Consultor experto*, *Respuesta breve* y *Solo buscar* (muestra los fragmentos sin IA ni coste).

**Puesta en marcha**

```bash
# 1. Genera el índice (necesita poppler-utils: pdftotext) con los PDF en ~/Descargas
VOYAGE_API_KEY=... npm run reglamento:index -- --dir ~/Descargas   # sin la clave, solo BM25
# 2. Claves en .env (ver .env.example): ANTHROPIC_API_KEY, y opcionalmente VOYAGE_API_KEY
# 3. Pruebas
npm run test:rag
```

`data/regulation/` **no se sube a git** (los reglamentos son propiedad de World Skate). En el servidor se copia la carpeta `data/` junto al `docker-compose.yml` (se monta como volumen de solo lectura). Tras regenerar el índice hay que reiniciar el contenedor.

La API limita el uso (por IP y por día) y puede protegerse con `REGLAMENTO_ACCESS_CODE`, porque cada pregunta con IA tiene coste.
