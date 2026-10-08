# App Cuarteto

Aplicación web (Next.js 16, React 19, Tailwind 4, Supabase) para gestionar el trabajo de un equipo de patinaje artístico en la modalidad de cuarteto: calendario y correcciones del entrenamiento, consulta del reglamento y puntuación técnica por sesión.

## Rutas

| Ruta | Contenido |
| --- | --- |
| `/` | Aplicación del equipo: correcciones por atleta, vista «Para trabajar» e historial semanal. |
| `/reglamento` | Consulta del reglamento con IA (ver sección RAG, más abajo). |
| `/tecnica` | Sección Técnica: puntuar Cluster, Traveling y Línea por sesión. |

### Modo entrenador

Añadiendo `?entrenador=nico` a la URL se activan las funciones de entrenador (p. ej. editar y reordenar correcciones). **Es solo un ajuste de interfaz**: no hay autenticación y cualquiera que conozca el parámetro puede usarlo. La seguridad real depende de las políticas RLS de Supabase, no de este modo.

## Variables de entorno

Copia `.env.example` a `.env`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase (clave pública; también se pasan como `build args` en Docker, porque se incrustan en el cliente al compilar).
- `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` (opcional), `VOYAGE_API_KEY` (opcional), `VOYAGE_MODEL`, `REGLAMENTO_MODEL`, `REGLAMENTO_REWRITE_MODEL`, `REGLAMENTO_ACCESS_CODE`, `REGLAMENTO_HOURLY_LIMIT`, `REGLAMENTO_DAILY_LIMIT`: consulta del reglamento (solo servidor).

## Supabase

Los datos viven en Supabase. Los scripts SQL están en `supabase/` y se ejecutan a mano en el editor SQL:

- Tabla `disco_cuarteto`: la que usa la app actualmente (correcciones y datos del equipo).
- `supabase/agregar_updated_at.sql` y `supabase/normalizar_correcciones.sql`: preparados, **no aplicados por defecto**; revísalos antes de ejecutarlos.
- `supabase/puntuaciones_tecnicas.sql`: tabla de la sección Técnica (`/tecnica`); hay que aplicarla para que esa sección guarde puntuaciones.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
```

Scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (ejecuta todos los `scripts/test-*.ts` con `tsx --test`), `test:rag`, `test:technical`, `reglamento:index` (genera el índice del reglamento).

## Docker

```bash
cp .env.example .env   # rellena las variables
docker compose up -d --build
```

Imagen multietapa con Node 24 (Alpine) y salida `standalone`, ejecutada como usuario `node` y con `HEALTHCHECK`. Escucha en el puerto 3000. La carpeta `./data` (índice del reglamento) se monta en solo lectura. Si hay un proxy inverso en el mismo servidor, publica el puerto solo en `127.0.0.1` (hay un comentario en `docker-compose.yml`).

## Consulta del reglamento (RAG)

La ruta `/reglamento` responde preguntas sobre el reglamento de cuarteto y los reglamentos generales de World Skate 2026, citando la sección y las páginas.

**Cómo funciona**

1. `scripts/build-regulation-index.mjs` convierte los PDF en fragmentos por sección (`data/regulation/chunks.json`) y, si hay `VOYAGE_API_KEY`, calcula sus embeddings (`embeddings.json`).
2. En cada consulta con IA, Claude Haiku reformula la pregunta en inglés técnico y se hace una **búsqueda híbrida**: BM25 (palabras clave) + similitud de embeddings (Voyage), fusionadas con Reciprocal Rank Fusion. Se recuperan 3-5 fragmentos.
3. Claude responde con esos fragmentos como documentos con **citas activadas**, así cada frase queda enlazada al texto literal del reglamento. Si la respuesta no cita nada, se avisa.
4. Modos: *Consultor experto*, *Respuesta breve* y *Solo buscar* (muestra los fragmentos sin IA ni coste: solo BM25 local, sin Haiku ni Voyage).

**Puesta en marcha**

```bash
# 1. Genera el índice (necesita poppler-utils: pdftotext) con los PDF en ~/Descargas
VOYAGE_API_KEY=... npm run reglamento:index -- --dir ~/Descargas   # sin la clave, solo BM25
# 2. Claves en .env (ver .env.example): ANTHROPIC_API_KEY, y opcionalmente VOYAGE_API_KEY
# 3. Pruebas
npm run test:rag
```

`data/regulation/` **no se sube a git** (los reglamentos son propiedad de World Skate). En el servidor se copia la carpeta `data/` junto al `docker-compose.yml` (se monta como volumen de solo lectura). Tras regenerar el índice hay que reiniciar el contenedor.

La API limita el uso (por IP y por día, y un máximo de consultas con IA simultáneas) y puede protegerse con `REGLAMENTO_ACCESS_CODE`, porque cada pregunta con IA tiene coste. Por defecto, **sin código la ruta queda abierta**; con `REGLAMENTO_REQUIRE_ACCESS_CODE=true` responde 503 si no hay código definido. Los fallos de código se limitan por cliente. `x-forwarded-for` se ignora salvo que se defina `REGLAMENTO_TRUSTED_PROXY_HOPS` (nº de proxies de confianza delante); sin él, todos los clientes comparten el mismo cupo por hora. Detalle de variables en `.env.example`.
