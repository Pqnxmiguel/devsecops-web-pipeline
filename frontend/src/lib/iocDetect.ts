/**
 * Detección y validación de tipo de IOC — SOLO para UX (autoseleccionar el
 * tipo, dar feedback temprano). La validación real y autoritativa vive en el
 * backend (`createIoc`, ver domain-model.md §2.1); esto nunca la reemplaza y
 * deliberadamente es más permisivo que el servidor.
 *
 * Mismo cuidado anti-ReDoS que el backend: sin regex anidadas con
 * cuantificadores solapados sobre input no confiable. Se usa parsing simple
 * (split + comprobación por partes), igual que ADR 1 del backend.
 */
import type { IocType } from './types';

const HASH_LENGTHS: Record<number, true> = { 32: true, 40: true, 64: true };

function looksLikeHash(value: string): boolean {
  if (!HASH_LENGTHS[value.length]) return false;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    const isDigit = c >= 48 && c <= 57;
    const isLowerHex = c >= 97 && c <= 102;
    const isUpperHex = c >= 65 && c <= 70;
    if (!isDigit && !isLowerHex && !isUpperHex) return false;
  }
  return true;
}

function looksLikeIp(value: string): boolean {
  // Heurística barata de UX: IPv4 de 4 octetos numéricos, o presencia de ':'
  // para IPv6. La verdad la decide `net.isIP` en el servidor.
  if (value.includes(':')) return true;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (part.length === 0 || part.length > 3) return false;
    for (let i = 0; i < part.length; i += 1) {
      const c = part.charCodeAt(i);
      if (c < 48 || c > 57) return false;
    }
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function looksLikeDomain(value: string): boolean {
  if (value.length < 3 || value.length > 253) return false;
  const labels = value.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => {
    if (label.length === 0 || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    for (let i = 0; i < label.length; i += 1) {
      const c = label.charCodeAt(i);
      const isDigit = c >= 48 && c <= 57;
      const isLower = c >= 97 && c <= 122;
      const isDash = c === 45;
      if (!isDigit && !isLower && !isDash) return false;
    }
    return true;
  });
}

/** @returns el tipo detectado, o null si no reconoce ninguna forma plausible. */
export function detectIocType(rawValue: string): IocType | null {
  const value = rawValue.trim().toLowerCase();
  if (value === '') return null;
  if (looksLikeHash(value)) return 'hash';
  if (looksLikeIp(value)) return 'ip';
  if (looksLikeDomain(value)) return 'domain';
  return null;
}

/** Validación superficial por tipo elegido explícitamente — solo habilita/deshabilita el botón. */
export function isPlausibleForType(rawValue: string, type: IocType): boolean {
  const value = rawValue.trim().toLowerCase();
  if (value === '') return false;
  if (type === 'hash') return looksLikeHash(value);
  if (type === 'ip') return looksLikeIp(value);
  return looksLikeDomain(value);
}
