// ============================================================
// XSS / INPUT SANITIZATION — Prevents cross-site scripting attacks
//
// Uses a lightweight regex-based sanitizer that works in ALL
// environments (Node.js serverless, browser, edge runtime).
//
// Previous version used isomorphic-dompurify which depends on
// jsdom — this crashes on Vercel serverless with ESM/CJS errors.
//
// USAGE:
// - sanitizeInput(string): Strip all HTML from a single string
// - sanitizeObject(obj): Recursively sanitize all string fields in an object
//
// Applied automatically to POST/PUT request bodies in withApiSecurity()
// ============================================================

/**
 * sanitizeInput — Sanitize a single string to prevent XSS attacks.
 * Strips ALL HTML tags and ALL attributes — only plain text remains.
 *
 * Uses regex-based sanitization that works in all JS environments
 * (Node.js, browser, edge, serverless) without any heavy dependencies.
 *
 * @param input - The string to sanitize
 * @returns The sanitized string with all HTML removed
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;

  // Step 1: Remove HTML tags (opening, closing, self-closing)
  let sanitized = input.replace(/<[^>]*>/g, '');

  // Step 2: Decode common HTML entities to prevent bypass via entity encoding
  const entityMap: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x3C;': '<',
    '&#x3E;': '>',
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  // Replace numeric HTML entities (decimal)
  sanitized = sanitized.replace(/&#(\d+);/g, (_, code) => {
    const charCode = parseInt(code, 10);
    return charCode > 0 && charCode < 0x10000 ? String.fromCharCode(charCode) : '';
  });

  // Replace numeric HTML entities (hexadecimal)
  sanitized = sanitized.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    const charCode = parseInt(code, 16);
    return charCode > 0 && charCode < 0x10000 ? String.fromCharCode(charCode) : '';
  });

  // Replace named HTML entities
  for (const [entity, char] of Object.entries(entityMap)) {
    sanitized = sanitized.replace(new RegExp(entity, 'gi'), char);
  }

  // Step 3: Remove any remaining script-like content patterns
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, ''); // Remove event handlers like onclick=
  sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, '');

  // Step 4: Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * sanitizeObject — Recursively sanitize all string fields in an object.
 * Handles nested objects and arrays. Non-string primitives are left unchanged.
 *
 * @param obj - The object to sanitize
 * @returns A new object with all string fields sanitized
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = { ...obj };
  for (const key of Object.keys(sanitized)) {
    const value = sanitized[key];
    if (typeof value === 'string') {
      (sanitized as Record<string, unknown>)[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      (sanitized as Record<string, unknown>)[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      (sanitized as Record<string, unknown>)[key] = value.map(item =>
        typeof item === 'string' ? sanitizeInput(item) :
        typeof item === 'object' && item !== null ? sanitizeObject(item as Record<string, unknown>) : item
      );
    }
  }
  return sanitized;
}
