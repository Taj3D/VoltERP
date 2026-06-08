// ============================================================
// PASSWORD UTILITY — Centralized hashing & verification
// Uses bcryptjs (pure JS, no native compilation needed)
// Salt rounds: 10 (recommended balance of security & speed)
//
// MIGRATION SAFETY:
// - isHashed() detects bcrypt hashes (start with $2a$/$2b$)
// - verifyPassword() handles BOTH plain-text and hashed passwords
// - This allows gradual migration — old plain-text passwords
//   still work until they are re-hashed on next login
// ============================================================

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * isHashed — Checks if a password string is already a bcrypt hash.
 * Bcrypt hashes always start with $2a$, $2b$, or $2y$ and are 60 chars long.
 */
export function isHashed(password: string): boolean {
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(password);
}

/**
 * hashPassword — Hashes a plain-text password using bcrypt.
 * @param plainPassword - The plain-text password to hash
 * @returns The bcrypt hash string
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * verifyPassword — Verifies a plain-text password against a stored hash.
 * MIGRATION-SAFE: If the stored password is NOT a bcrypt hash (i.e., still
 * plain-text from before migration), it does a direct string comparison.
 * This ensures no user gets locked out during the transition period.
 *
 * @param plainPassword - The password the user typed
 * @param storedPassword - The password stored in the database (hash or plain)
 * @returns true if the password matches
 */
export async function verifyPassword(
  plainPassword: string,
  storedPassword: string
): Promise<boolean> {
  // If the stored password is already a bcrypt hash, use bcrypt comparison
  if (isHashed(storedPassword)) {
    return bcrypt.compare(plainPassword, storedPassword);
  }

  // LEGACY: Plain-text comparison for passwords not yet migrated
  // This path will naturally disappear once all passwords are re-hashed
  return plainPassword === storedPassword;
}

/**
 * needsRehash — Checks if a stored password needs to be re-hashed.
 * Returns true if the stored password is NOT a bcrypt hash (still plain-text).
 * Use this after successful login to auto-migrate passwords.
 */
export function needsRehash(storedPassword: string): boolean {
  return !isHashed(storedPassword);
}
