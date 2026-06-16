// ============================================================
// PASSWORD UTILITY — Centralized hashing & verification
// Uses bcryptjs (pure JS, no native compilation needed)
// Salt rounds: 10 (recommended balance of security & speed)
//
// SECURITY:
// - isHashed() detects bcrypt hashes (start with $2a$/$2b$/$2y$)
// - verifyPassword() ONLY accepts bcrypt hashes — plaintext
//   comparison is removed to prevent timing attacks
// - If a stored password is not a bcrypt hash, verification fails
//   (use the /api/auth/migrate-passwords endpoint to bulk-migrate)
// - needsRehash() identifies non-bcrypt passwords for migration
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
 * SECURITY: Only bcrypt hashes are accepted. If the stored password is
 * NOT a bcrypt hash (e.g., legacy plaintext), verification returns false.
 * This eliminates the timing-attack vector from plaintext comparison.
 *
 * To migrate legacy plaintext passwords, use the /api/auth/migrate-passwords
 * endpoint or trigger migration through an admin workflow.
 *
 * @param plainPassword - The password the user typed
 * @param storedPassword - The password stored in the database (must be bcrypt hash)
 * @returns true if the password matches the bcrypt hash
 */
export async function verifyPassword(
  plainPassword: string,
  storedPassword: string
): Promise<boolean> {
  // If the stored password is not a bcrypt hash, reject immediately.
  // Legacy plaintext passwords must be migrated via admin tools.
  if (!isHashed(storedPassword)) {
    return false;
  }

  // Use bcrypt's constant-time comparison
  return bcrypt.compare(plainPassword, storedPassword);
}

/**
 * needsRehash — Checks if a stored password needs to be re-hashed.
 * Returns true if the stored password is NOT a bcrypt hash (still plain-text).
 * Use this to identify accounts that need password migration.
 */
export function needsRehash(storedPassword: string): boolean {
  return !isHashed(storedPassword);
}
