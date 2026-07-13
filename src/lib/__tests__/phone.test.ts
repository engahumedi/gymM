import { describe, it, expect } from 'vitest';
import { SAUDI_PHONE_RE, SAUDI_ID_RE, normalizeSaudiPhone } from '../phone';

describe('normalizeSaudiPhone', () => {
  it('converts +9665… to 05…', () => {
    expect(normalizeSaudiPhone('+966501234567')).toBe('0501234567');
  });
  it('converts 9665… to 05…', () => {
    expect(normalizeSaudiPhone('966501234567')).toBe('0501234567');
  });
  it('prefixes a bare 5XXXXXXXX with 0', () => {
    expect(normalizeSaudiPhone('501234567')).toBe('0501234567');
  });
  it('strips spaces and dashes', () => {
    expect(normalizeSaudiPhone(' 050-123 4567 ')).toBe('0501234567');
  });
  it('leaves an already-canonical number unchanged', () => {
    expect(normalizeSaudiPhone('0501234567')).toBe('0501234567');
  });
});

describe('SAUDI_PHONE_RE', () => {
  it('accepts local and international forms', () => {
    expect(SAUDI_PHONE_RE.test('0501234567')).toBe(true);
    expect(SAUDI_PHONE_RE.test('+966501234567')).toBe(true);
  });
  it('rejects wrong length / prefix', () => {
    expect(SAUDI_PHONE_RE.test('050123456')).toBe(false);
    expect(SAUDI_PHONE_RE.test('0601234567')).toBe(false);
    expect(SAUDI_PHONE_RE.test('12345')).toBe(false);
  });
});

describe('SAUDI_ID_RE', () => {
  it('accepts 10 digits starting 1 or 2', () => {
    expect(SAUDI_ID_RE.test('1012345678')).toBe(true);
    expect(SAUDI_ID_RE.test('2099887766')).toBe(true);
  });
  it('rejects other prefixes / lengths', () => {
    expect(SAUDI_ID_RE.test('3012345678')).toBe(false);
    expect(SAUDI_ID_RE.test('101234567')).toBe(false);
  });
});
