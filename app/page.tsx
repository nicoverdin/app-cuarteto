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
async function loadInitialRoutine(): Promise<{ routine: RoutinePart[] | null; updatedAt: string | null }> {
  if (!supabase) return { routine: initialData, updatedAt: null };
  try {
    const row = await fetchRoutine(supabase);
    return { routine: row?.data ?? initialData, updatedAt: row?.updatedAt ?? null };
  } catch {
    return { routine: null, updatedAt: null };
  }
}

export default async function Home() {
  const { routine, updatedAt } = await loadInitialRoutine();
  return <ClientPage initialRoutine={routine} initialUpdatedAt={updatedAt} />;
}