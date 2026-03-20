/**
 * Client-side only utilities for personnummer validation.
 * CRITICAL: Personnummer must NEVER leave the client browser.
 * Only the HMAC hash is sent to the server.
 */

const PERSONNUMMER_REGEX = /^\d{8}-\d{4}$/;

export function validatePersonnummerFormat(pnr: string): boolean {
  if (!PERSONNUMMER_REGEX.test(pnr)) {
    return false;
  }

  return validateLuhn(pnr);
}

function validateLuhn(pnr: string): boolean {
  // Use the last 10 digits (YYMMDDXXXX) for Luhn check
  const digits = pnr.replace('-', '').slice(2);

  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

export function formatPersonnummer(pnr: string): string {
  const clean = pnr.replace(/\D/g, '');
  if (clean.length === 12) {
    return `${clean.slice(0, 8)}-${clean.slice(8)}`;
  }
  return pnr;
}
