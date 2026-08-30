/**
 * Egypt phone normalizer to E.164 +20...
 * Port from Flutter phone_utils.dart
 * Handles 4 formats:
 * - 01012345678 (11 digits starting 01)
 * - 1012345678 (10 digits)
 * - +201012345678 (E.164)
 * - 00201012345678 (international prefix)
 */

export function normalizeEgyptPhone(phone: string): string {
  if (!phone) throw new Error('Phone is required');
  let p = phone.trim().replace(/[\s\-\(\)]/g, '');

  // Remove 00 prefix
  if (p.startsWith('00')) {
    p = '+' + p.slice(2);
  }

  // If already +20...
  if (p.startsWith('+20')) {
    // Validate length: +20 + 10 digits = 13
    const digits = p.slice(3);
    if (!/^\d{10}$/.test(digits)) {
      // Try to handle +20 with extra leading 0
      if (p.startsWith('+200')) {
        p = '+20' + p.slice(4);
      }
    }
    return p;
  }

  // If starts with 20 without +
  if (p.startsWith('20') && p.length === 12) {
    return '+' + p;
  }

  // If starts with 01 (11 digits)
  if (p.startsWith('01') && p.length === 11) {
    return '+2' + p; // 01... => +201...
  }

  // If 10 digits starting with 1 (without leading 0)
  if (p.length === 10 && p.startsWith('1')) {
    return '+20' + p;
  }

  // If starts with 0 and 10 digits? e.g., 010...
  if (p.startsWith('0') && p.length === 10) {
    // e.g., 0123456789 (should be 11) but handle
    return '+20' + p.slice(1);
  }

  // Fallback: if 11 digits starting 01, already handled; else if contains + but not +20
  if (p.startsWith('+')) {
    return p;
  }

  // Last resort: prepend +20 if numeric and 10-11 length
  const digitsOnly = p.replace(/\D/g, '');
  if (digitsOnly.length === 11 && digitsOnly.startsWith('01')) {
    return '+2' + digitsOnly;
  }
  if (digitsOnly.length === 10 && digitsOnly.startsWith('1')) {
    return '+20' + digitsOnly;
  }

  throw new Error(`Invalid Egypt phone format: ${phone}`);
}

export function getPhoneVariants(phone: string): string[] {
  const normalized = normalizeEgyptPhone(phone);
  const national = '0' + normalized.slice(3); // 010...
  const withoutPlus = normalized.slice(1); // 2010...
  const with00 = '00' + normalized.slice(1); // 002010...
  return [normalized, national, withoutPlus, with00];
}

export function isValidEgyptPhone(phone: string): boolean {
  try {
    const n = normalizeEgyptPhone(phone);
    return /^\+20\d{10}$/.test(n);
  } catch {
    return false;
  }
}
