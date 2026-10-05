import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import RegulationChat from '../../components/RegulationChat';

export const metadata: Metadata = {
  title: 'Consultar el reglamento',
  robots: { index: false, follow: false },
};

export default function ReglamentoPage() {
  return (
    <main className="min-h-screen bg-page pb-16">
      <div className="max-w-md mx-auto px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent rounded-md focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Programa
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-ink tracking-tight">Reglamento</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Pregunta sobre el reglamento de cuarteto y los reglamentos generales de World Skate 2026.
        </p>
        <RegulationChat />
      </div>
    </main>
  );
}
