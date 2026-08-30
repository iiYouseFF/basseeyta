import { normalizeEgyptPhone, getPhoneVariants, isValidEgyptPhone } from '../../src/utils/phone';

describe('normalizeEgyptPhone', () => {
  it('normalizes 010... to +20...', () => {
    expect(normalizeEgyptPhone('01012345678')).toBe('+201012345678');
    expect(normalizeEgyptPhone('01123456789')).toBe('+201123456789');
  });

  it('normalizes 10 digits (without leading 0) to +20...', () => {
    expect(normalizeEgyptPhone('1012345678')).toBe('+201012345678');
  });

  it('keeps +20... as is', () => {
    expect(normalizeEgyptPhone('+201012345678')).toBe('+201012345678');
  });

  it('normalizes 0020... to +20...', () => {
    expect(normalizeEgyptPhone('00201012345678')).toBe('+201012345678');
  });

  it('throws for invalid format', () => {
    expect(() => normalizeEgyptPhone('123')).toThrow();
    expect(() => normalizeEgyptPhone('')).toThrow();
  });

  it('getPhoneVariants returns 4 variants', () => {
    const variants = getPhoneVariants('+201012345678');
    expect(variants).toContain('+201012345678');
    expect(variants).toContain('01012345678');
    expect(variants).toContain('201012345678');
    expect(variants).toContain('00201012345678');
  });

  it('isValidEgyptPhone checks', () => {
    expect(isValidEgyptPhone('01012345678')).toBe(true);
    expect(isValidEgyptPhone('+201012345678')).toBe(true);
    expect(isValidEgyptPhone('123')).toBe(false);
  });
});
