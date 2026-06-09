// ============================================================
// XSS / INPUT SANITIZATION — Prevents cross-site scripting attacks
//
// Uses isomorphic-dompurify (works in both server and client)
// to strip all HTML tags and attributes from user input strings.
//
// USAGE:
// - sanitizeInput(string): Strip all HTML from a single string
// - sanitizeObject(obj): Recursively sanitize all string fields in an object
//
// Applied automatically to POST/PUT request bodies in withApiSecurity()
// ============================================================

import DOMPurify from 'isomorphic-dompurify';

/**
 * sanitizeInput — Sanitize a single string to prevent XSS attacks.
 * Strips ALL HTML tags and ALL attributes — only plain text remains.
 *
 * @param input - The string to sanitize
 * @returns The sanitized string with all HTML removed
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],  // Strip all HTML tags
    ALLOWED_ATTR: [],  // Strip all attributes
  });
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
