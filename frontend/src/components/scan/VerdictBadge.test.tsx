import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictBadge } from './VerdictBadge';

describe('VerdictBadge', () => {
  it.each([
    ['clean', 'LIMPIO'],
    ['suspicious', 'SOSPECHOSO'],
    ['malicious', 'MALICIOSO'],
    ['unknown', 'DESCONOCIDO'],
  ] as const)('renders %s as %s', (level, label) => {
    render(<VerdictBadge level={level} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('does not use the clean/green color token for unknown', () => {
    render(<VerdictBadge level="unknown" />);
    const badge = screen.getByText('DESCONOCIDO');
    expect(badge.className).not.toMatch(/pixel-clean/);
    expect(badge.className).toMatch(/pixel-unknown/);
  });
});
