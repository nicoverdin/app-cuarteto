# Sección Técnica

Puntuación de los elementos técnicos del cuarteto (ruta `/tecnica`).

## Fuente de los valores

- Reglamento: *World Skate Artistic 2026 — Quartets Rules* (apartados 5 y 7), categoría **Senior**.
- Valores: tabla *Quartet values / puntuaciones base (Rollart 2026)*.
- Transcritos de `data/regulation/chunks.json` (el índice local del reglamento). **Pendiente de revisión manual contra el PDF.**

## Estructura

| Archivo | Qué es |
|---|---|
| `catalog.ts` | Solo datos: elementos, niveles, valores base y QOE. Es lo único que se toca para añadir/corregir elementos. |
| `score.ts` | Cálculo y validación (puro, con tests en `scripts/test-technical.ts`). |
| `store.ts` | Lectura/escritura en Supabase. |
| `../../components/TechnicalScoring.tsx` | Interfaz (genérica: dibuja lo que haya en el catálogo). |
| `../../supabase/puntuaciones_tecnicas.sql` | Migración (manual, en el SQL Editor de Supabase). |

## Fórmula

```
valor = base(nivel) + ajusteQOE(nivel, qoe) + bonusExtra
```

- `base` y `ajusteQOE` salen de la tabla del catálogo. El QOE (−3…+3) suma o resta **puntos fijos** según el nivel
  (p. ej. Tr2: base 4.5, QOE +3 = +1.2); **no** es un porcentaje. La tabla oficial es simétrica, por eso solo se guardan los positivos.
- `bonusExtra`: solo Traveling. Se marca qué extra features están confirmadas y **solo cuenta la de mayor bonus**
  (puntos fijos: 0.5 / 1.0 / 1.5 / 2.0). No se aplica a «sin nivel».
- **Grupo** (cuarteto completo): su valor suma al **total técnico**.
  El nivel puede ser manual o «Automático»: el mayor nivel que alcanzan al menos `minSkaters` patinadoras
  (3 de 4 en Cluster y Línea; las 4 en Traveling).
- **Individual** (cada patinadora): nivel + QOE propios, solo de seguimiento. Sus totales **no** se suman al total técnico.
- El índice de nivel es: `0` = sin nivel, `1` = Base, `2` = Nivel 1, … `5` = Nivel 4.

## Añadir un elemento (p. ej. Canon)

1. En `catalog.ts`, añade un objeto a `CATALOG`:
   ```ts
   {
     id: 'canon',
     name: 'Canon',
     minSkaters: 3,                  // patinadoras que deben lograr el nivel (comprobar en el reglamento)
     levels: [
       { ...NO_LEVEL, code: 'NLC' },
       { code: 'CB', base: 2.8, qoe: [0.3, 0.6, 0.9] },   // QOE +1, +2, +3
       // … un objeto por nivel, en orden
     ],
     // extras: [{ id, label, bonus }],   // opcional
   }
   ```
2. Añade en `scripts/test-technical.ts` un caso con un valor de la tabla y ejecuta `npm run test:technical`.
3. No hay que tocar la interfaz, el cálculo ni la base de datos (`elemento` es texto libre).

> Los valores del Canon ya están en la tabla Rollart 2026 pero con coma decimal (`2,8`); usa punto en el catálogo.
