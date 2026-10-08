@AGENTS.md

# App del cuarteto

App en español para un cuarteto de patinaje artístico (categoría senior): seguimiento de correcciones por parte del programa (`/`), puntuación técnica por elementos (`/tecnica`) y consulta del reglamento con IA (`/reglamento`). Next.js 16 + React 19 + Tailwind 4 + Supabase + Docker. Lee `README.md` para la puesta en marcha.

## Comandos

- `npm run dev` / `npm run build` · `npm run typecheck` · `npm run lint` (`eslint .`)
- `npm test` ejecuta todos los `scripts/test-*.ts` (node:test + tsx); también `test:rag` y `test:technical`.
- Antes de dar algo por hecho: `npm run typecheck && npm run lint && npm test && npx next build`.

## Estructura

- `app/ClientPage.tsx`: rutina (guardado optimista en cola, rollback por mutación inversa, Realtime, copia local). Lógica pura en `lib/routine.ts`.
- `lib/technical/`: sección Técnica. `catalog.ts` es **solo datos** (valores World Skate 2026, Rollart); `score.ts` cálculo puro; `queue.ts` cola de escrituras; `store.ts` acceso a Supabase. UI en `components/TechnicalScoring.tsx`. Ver `lib/technical/README.md`.
- `lib/rag/` + `app/api/reglamento/route.ts`: búsqueda híbrida BM25 + Voyage y respuesta con Claude. El índice vive en `data/regulation/` y **no está en git** (propiedad de World Skate).
- `lib/auth.ts` + `lib/coach.ts` + `components/CoachBar.tsx`: acceso del entrenador. `public/sw.js`: service worker (caché versionada).
- `supabase/*.sql`: se ejecutan **a mano** en el SQL Editor; son repetibles. `cerrar_escritura.sql` debe ejecutarse el último.

## Convenciones

- Interfaz y comentarios en español; comentarios breves que explican el porqué. Colores solo con los tokens de `globals.css`.
- Móvil primero (360 px): inputs `text-base` (iOS hace zoom con menos), objetivos táctiles de 44 px (`min-h-11`), solo lectura como texto plano (no selects deshabilitados).
- Lógica nueva y no trivial → función pura en `lib/` con tests en `scripts/test-*.ts`.

## Cosas que no son obvias

- **Seguridad:** `?entrenador=nico` solo muestra el formulario de acceso. Escribir exige una cuenta de Supabase Auth que esté en la tabla `entrenadores`; lo garantizan las políticas RLS (`es_entrenador()`), no la interfaz. No abrir escritura a `anon`.
- Técnica: una sesión tiene varios intentos por elemento; el total cuenta el **mejor intento** de cada uno. El bonus del Traveling es en **puntos fijos** y solo cuenta el mayor. Combo Element y Canon quedan fuera esta temporada. Son decisiones tomadas: no reabrirlas.
- Si cambias el esquema SQL, pruébalo en un Postgres local (`/usr/lib/postgresql/16/bin`, con un esquema `auth` y roles `anon`/`authenticated` simulados) y mantenlo repetible; tras desplegar, comprueba con la clave anónima que la migración está aplicada.
- `REGLAMENTO_TRUSTED_PROXY_HOPS` solo debe ser > 0 si hay un proxy de confianza delante; sin él la cabecera `X-Forwarded-For` es falsificable.
- `supabase/cerrar_escritura.sql` puede estar modificado en local con el correo real del entrenador a propósito: **no lo commitees** y añade los archivos uno a uno (nada de `git add -A`).
- No imprimas ni commitees secretos (`.env`, claves, contraseñas, correos personales).

## Flujo de trabajo

- No hagas commit, push ni despliegues sin que el usuario lo pida. Los commits terminan con la línea `Co-Authored-By` indicada por el entorno.
- El despliegue es con Docker Compose en un servidor propio (datos del acceso en la memoria del usuario, no en el repo): `git pull --ff-only` y `docker compose up -d --build`, etiquetando antes la imagen anterior para poder volver atrás. Ese servidor aloja otras apps: toca solo este contenedor.
- Pendiente a propósito: HTTPS para el login (el contenedor no está detrás de Traefik) y las migraciones `agregar_updated_at.sql` y `normalizar_correcciones.sql`.
