import type { Metadata } from 'next';
import TechnicalScoring from '../../components/TechnicalScoring';

export const metadata: Metadata = {
  title: 'Técnica',
  robots: { index: false, follow: false },
};

export default function TecnicaPage() {
  return (
    <main className="min-h-screen bg-page pb-24">
      <div className="max-w-md mx-auto px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <TechnicalScoring />
      </div>
    </main>
  );
}
