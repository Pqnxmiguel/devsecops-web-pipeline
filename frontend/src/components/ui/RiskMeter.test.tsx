import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskMeter } from './RiskMeter';

describe('RiskMeter', () => {
  it('shows the numeric score for a concluded verdict', () => {
    render(<RiskMeter level="malicious" score={96} />);
    expect(screen.getByText('96/100')).toBeInTheDocument();
  });

  // Guarda anti-regresión (ADR 3 / CWE-636): `score: null` NUNCA se lee como
  // 0. Si esto regresara a "0/100" sería exactamente el bug de fail-open que
  // la auditoría de seguridad corrigió en el backend.
  it('never renders "0/100" for a null score — shows "sin datos" instead', () => {
    render(<RiskMeter level="unknown" score={null} />);
    expect(screen.queryByText('0/100')).not.toBeInTheDocument();
    expect(screen.getByText('— sin datos —')).toBeInTheDocument();
  });

  it('labels the accessible bar as unavailable, not as a measured zero', () => {
    render(<RiskMeter level="unknown" score={null} />);
    expect(screen.getByRole('img', { name: /no pudo evaluarse/i })).toBeInTheDocument();
  });
});
