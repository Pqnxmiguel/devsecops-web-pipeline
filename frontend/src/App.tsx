import { useState } from 'react';
import { Mascot } from './components/mascot/Mascot';
import { STATE_LABEL, mascotStateFor } from './components/mascot/mascotState';
import { ScanForm } from './components/scan/ScanForm';
import { VerdictPanel } from './components/scan/VerdictPanel';
import { History } from './components/scan/History';
import { GlitchOverlay } from './components/fx/GlitchOverlay';
import { useScan } from './hooks/useScan';
import type { IocType } from './lib/types';

export function App() {
  const { status, scan, error, run } = useScan();
  const [historyKey, setHistoryKey] = useState(0);

  function handleSubmit(type: IocType, value: string) {
    run(type, value).then(() => {
      // Cada scan exitoso o fallido puede haber cambiado el historial (un
      // 200 siempre se guarda, incluso `unknown`); se pide un refresh
      // explícito en vez de que History adivine cuándo refetchear.
      setHistoryKey((k) => k + 1);
    });
  }

  const mascotState = mascotStateFor(status, scan?.verdict.level ?? null);

  return (
    <div className="min-h-screen bg-pixel-bg">
      <GlitchOverlay />
      <header className="border-b-2 border-pixel-ink2 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Mascot scanStatus={status} level={scan?.verdict.level ?? null} size={64} />
          <div>
            <h1 className="font-pixel text-sm sm:text-base text-pixel-glass leading-relaxed">IOC SCANNER</h1>
            <p className="font-mono-pixel text-lg text-pixel-fog">{STATE_LABEL[mascotState]}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8 flex flex-col gap-8">
        <section className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
          <div className="hidden sm:block">
            <Mascot scanStatus={status} level={scan?.verdict.level ?? null} size={160} />
          </div>
          <div className="w-full max-w-xl flex flex-col gap-6">
            <ScanForm onSubmit={handleSubmit} loading={status === 'loading'} />
            <VerdictPanel scan={status === 'success' ? scan : null} error={status === 'error' ? error : null} />
          </div>
        </section>

        <History refreshKey={historyKey} />
      </main>

      <footer className="px-4 py-6 sm:px-8 text-center">
        <p className="font-mono-pixel text-sm text-pixel-fog">
          Todo pasa por el backend — este cliente nunca llama a fuentes de threat intelligence directamente.
        </p>
      </footer>
    </div>
  );
}
