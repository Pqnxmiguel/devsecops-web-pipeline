import { describe, expect, it } from 'vitest';
import { mascotStateFor } from './mascotState';

describe('mascotStateFor', () => {
  it('is idle before any scan', () => {
    expect(mascotStateFor('idle', null)).toBe('idle');
  });

  it('is scanning while a request is in flight, regardless of the previous level', () => {
    expect(mascotStateFor('loading', 'malicious')).toBe('scanning');
  });

  it('is calm only for clean', () => {
    expect(mascotStateFor('success', 'clean')).toBe('calm');
  });

  it('is alert for both suspicious and malicious', () => {
    expect(mascotStateFor('success', 'suspicious')).toBe('alert');
    expect(mascotStateFor('success', 'malicious')).toBe('alert');
  });

  // Guarda anti-regresión del ADR 3: `unknown` tiene su PROPIO estado y
  // nunca cae junto a `clean` en un `else`.
  it('is confused for unknown — never calm, never grouped with clean', () => {
    const state = mascotStateFor('success', 'unknown');
    expect(state).toBe('confused');
    expect(state).not.toBe('calm');
  });
});
