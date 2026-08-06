import { AnimatePresence, motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { RiskMeter } from '../ui/RiskMeter';
import { VerdictBadge } from './VerdictBadge';
import { SourceReportCard } from './SourceReportCard';
import type { Scan, VerdictLevel } from '../../lib/types';
import { assertUnreachable } from '../../lib/types';

interface VerdictPanelProps {
  scan: Scan | null;
  error: string | null;
}

/**
 * Clase(s) de glitch por nivel de veredicto (ver
 * docs/architecture/frontend-design.md §8 y `styles/index.css` `.fx-burst-*`).
 * `malicious` es el único que suma ruido/estática (`fx-noise-burst`) — el
 * más "ruidoso" del set, a propósito. `unknown` se queda más silencioso y
 * violeta, para que se lea distinto de "amenaza confirmada", no sólo más
 * flojo. `clean`/`suspicious` no glitchean el panel — la ráfaga fuerte se
 * reserva para el peor caso, no para cualquier resultado.
 *
 * Switch exhaustivo (no un `default` genérico) por la misma razón que
 * `VerdictBadge`/`RiskMeter`: si se agrega un 5º nivel algún día, esto deja
 * de compilar hasta que alguien decida a propósito si glitchea o no.
 */
function glitchClassForLevel(level: VerdictLevel): string {
  switch (level) {
    case 'malicious':
      return 'fx-burst-malicious fx-noise-burst';
    case 'unknown':
      return 'fx-burst-unknown';
    case 'suspicious':
    case 'clean':
      return '';
    default:
      return assertUnreachable(level);
  }
}

/**
 * Panel de veredicto. `framer-motion` se usa aquí SOLO para la
 * aparición/desaparición de la tarjeta — nunca para el ciclo del sprite de
 * la mascota, que es CSS puro (regla dura del agente). El glitch de
 * `.fx-burst-*` vive en el `<Card>` interior, NO en el `motion.div` que lo
 * envuelve: framer-motion escribe `transform`/`opacity` inline en cada frame
 * sobre `motion.div`, y una animación CSS con esas mismas propiedades en el
 * mismo nodo pelearía con eso. Como `motion.div` usa `key={scan.id}`, React
 * remonta el `<Card>` en cada scan nuevo — así el ciclo de glitch (que es de
 * un solo disparo) vuelve a correr en cada resultado, no sólo en el primero.
 *
 * `aria-live="polite"` en el contenedor: el estado del IOC se anuncia en
 * texto, no sólo mediante el color, el glitch o la animación de la mascota
 * (§6 de frontend-design.md) — el glitch nunca es el único canal de
 * información, y su ciclo más largo (560ms) es corto a propósito para no
 * demorar la lectura del veredicto.
 */
export function VerdictPanel({ scan, error }: VerdictPanelProps) {
  return (
    <div aria-live="polite" className="min-h-[4rem]">
      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-pixel-malicious">
              <p className="font-mono-pixel text-lg text-pixel-malicious">{error}</p>
            </Card>
          </motion.div>
        ) : scan ? (
          <motion.div
            key={scan.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card
              as="section"
              aria-label="Resultado del scan"
              className={`flex flex-col gap-4 ${glitchClassForLevel(scan.verdict.level)}`}
            >
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-pixel text-[10px] text-pixel-fog uppercase mb-1">
                    {scan.ioc.type}
                    {scan.mock ? ' · modo simulado' : ''}
                  </p>
                  <p className="font-mono-pixel text-xl text-pixel-glass break-all">{scan.ioc.value}</p>
                </div>
                <VerdictBadge level={scan.verdict.level} />
              </header>

              <RiskMeter level={scan.verdict.level} score={scan.verdict.score} />

              <p className="font-mono-pixel text-lg text-pixel-mist">{scan.verdict.summary}</p>

              <div>
                <h3 className="font-pixel text-[10px] text-pixel-fog uppercase mb-2">Detalle por fuente</h3>
                <div className="flex flex-col gap-2">
                  {scan.sources.map((report) => (
                    <SourceReportCard key={report.source} report={report} />
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
