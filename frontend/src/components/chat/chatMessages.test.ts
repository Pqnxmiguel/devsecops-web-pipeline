import { describe, expect, it } from 'vitest';
import { conversationReducer, initialMessages } from './chatMessages';
import type { Scan } from '../../lib/types';

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 'scan-1',
    ioc: { type: 'ip', value: '203.0.113.66', ipVersion: 4 },
    verdict: { level: 'malicious', score: 92, confidence: 0.9, summary: 'Reportada en AbuseIPDB.' },
    sources: [],
    scannedAt: new Date().toISOString(),
    mock: true,
    ...overrides,
  };
}

describe('initialMessages', () => {
  it('opens with a single greeting from the mascot', () => {
    const messages = initialMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('mascot');
    expect(messages[0]?.kind).toBe('greeting');
  });
});

describe('conversationReducer', () => {
  it('submitted appends a user bubble and a typing indicator, in order', () => {
    const next = conversationReducer(initialMessages(), {
      type: 'submitted',
      userMessageId: 'u1',
      typingMessageId: 't1',
      text: '203.0.113.66',
    });
    expect(next).toHaveLength(3);
    expect(next[1]).toMatchObject({ id: 'u1', role: 'user', kind: 'text', text: '203.0.113.66' });
    expect(next[2]).toMatchObject({ id: 't1', role: 'mascot', kind: 'typing' });
  });

  it('unrecognized never dispatches a fetch-shaped action — just a user bubble plus a clarify message', () => {
    const next = conversationReducer(initialMessages(), {
      type: 'unrecognized',
      userMessageId: 'u1',
      clarifyMessageId: 'c1',
      text: 'no-es-nada-reconocible',
    });
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ id: 'c1', role: 'mascot', kind: 'text' });
    expect((next[2] as { text: string }).text).toContain('no-es-nada-reconocible');
  });

  it('scan-succeeded replaces the matching typing bubble in place, not appends', () => {
    const withTyping = conversationReducer(initialMessages(), {
      type: 'submitted',
      userMessageId: 'u1',
      typingMessageId: 't1',
      text: '203.0.113.66',
    });
    const scan = makeScan();
    const next = conversationReducer(withTyping, { type: 'scan-succeeded', messageId: 't1', scan });

    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ id: 't1', role: 'mascot', kind: 'verdict', scan });
  });

  it('scan-failed replaces the typing bubble with an error message', () => {
    const withTyping = conversationReducer(initialMessages(), {
      type: 'submitted',
      userMessageId: 'u1',
      typingMessageId: 't1',
      text: 'not-a-host',
    });
    const next = conversationReducer(withTyping, {
      type: 'scan-failed',
      messageId: 't1',
      message: 'El valor no es válido.',
    });

    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ id: 't1', role: 'mascot', kind: 'error', message: 'El valor no es válido.' });
  });

  // Guarda anti-regresión: un veredicto `unknown` con `score: null` tiene que
  // sobrevivir intacto el viaje reducer -> mensaje, nunca colapsar a 0.
  it('carries an unknown verdict with score: null through untouched', () => {
    const withTyping = conversationReducer(initialMessages(), {
      type: 'submitted',
      userMessageId: 'u1',
      typingMessageId: 't1',
      text: 'example.org',
    });
    const scan = makeScan({
      verdict: { level: 'unknown', score: null, confidence: 0, summary: 'Ninguna fuente respondió.' },
    });
    const next = conversationReducer(withTyping, { type: 'scan-succeeded', messageId: 't1', scan });
    const verdictMessage = next[2] as { kind: string; scan: Scan };
    expect(verdictMessage.scan.verdict.score).toBeNull();
    expect(verdictMessage.scan.verdict.level).toBe('unknown');
  });
});
