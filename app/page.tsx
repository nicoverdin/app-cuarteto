import type { Metadata } from "next";
import ClientPage from "./ClientPage";
import { supabase, fetchRoutine } from "../lib/supabase";
import { initialData } from "../lib/routine";
import type { RoutinePart } from "../types";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const isCoach = params?.entrenador === "nico";

  return {
    robots: { index: false, follow: false },
    icons: {
      icon: isCoach ? "/icon-coach-192.png" : "/icon-192.png",
      apple: isCoach ? "/icon-coach-192.png" : "/icon-192.png",
    },
    title: isCoach ? "Lyra Coach" : "Programa Cuarteto",
    manifest: isCoach ? "/manifest-entrenador.json" : "/manifest-equipo.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: isCoach ? "Lyra Coach" : "Programa Cuarteto",
    },
  };
}

// Los datos se cargan en el servidor para evitar la cascada "HTML vacío → Cargando… → contenido".
// Si falla, el cliente reintenta por su cuenta (y usa la copia local si no hay conexión).
// Hay redes (p. ej. algunos servidores) desde las que Supabase no responde: sin límite de tiempo la página
// se quedaría colgada. Tras un fallo se deja de intentar en el servidor un rato (corto) y carga el cliente, que
// empieza a leer nada más hidratar y muestra un error con «Reintentar» si tampoco puede.
const SERVER_FETCH_TIMEOUT_MS = 1500;
const SERVER_RETRY_AFTER_MS = 30_000;
let skipServerFetchUntil = 0;

async function loadInitialRoutine(): Promise<{ routine: RoutinePart[] | null; updatedAt: string | null }> {
  if (!supabase) return { routine: initialData, updatedAt: null };
  if (Date.now() < skipServerFetchUntil) return { routine: null, updatedAt: null };
  try {
    const row = await fetchRoutine(supabase, AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS));
    return { routine: row?.data ?? initialData, updatedAt: row?.updatedAt ?? null };
  } catch {
    skipServerFetchUntil = Date.now() + SERVER_RETRY_AFTER_MS;
    return { routine: null, updatedAt: null };
  }
}

export default async function Home() {
  const { routine, updatedAt } = await loadInitialRoutine();
  return <ClientPage initialRoutine={routine} initialUpdatedAt={updatedAt} />;
}