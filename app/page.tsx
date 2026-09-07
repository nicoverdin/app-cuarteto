import type { Metadata } from "next";
import ClientPage from "./ClientPage";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const isCoach = params?.entrenador === "nico";

  return {
    title: isCoach ? "Lyra Coach" : "Cuarteto Tracker",
    manifest: isCoach ? "/manifest-entrenador.json" : "/manifest-equipo.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: isCoach ? "Lyra Coach" : "Cuarteto Tracker",
    },
  };
}

export default function Home() {
  return <ClientPage />;
}