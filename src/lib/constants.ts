/**
 * Shared application constants — single source of truth.
 * Import from here instead of duplicating string literals.
 */

/** User role identifiers used throughout the application */
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  SR: 'sr',
  DEALER: 'dealer',
  VAT_AUDITOR: 'vat_auditor',
} as const;

/** Union type derived from ROLES values — use for type-safe role checks */
export type Role = typeof ROLES[keyof typeof ROLES];

/** Background color classes for role avatars/badges */
export const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-blue-500',
  manager: 'bg-green-500',
  sr: 'bg-yellow-500',
  dealer: 'bg-purple-500',
  vat_auditor: 'bg-amber-500',
};

/** Background + text color classes for role avatars with contrast */
export const ROLE_COLORS_WITH_TEXT: Record<Role, string> = {
  admin: 'bg-blue-500 text-white',
  manager: 'bg-green-500 text-white',
  sr: 'bg-yellow-500 text-black',
  dealer: 'bg-purple-500 text-white',
  vat_auditor: 'bg-amber-500 text-black',
};

/** Short role display labels */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  sr: 'SR',
  dealer: 'Dealer',
  vat_auditor: 'VAT Auditor',
};

/** Full / descriptive role display labels */
export const ROLE_LABELS_FULL: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  sr: 'Sales Representative',
  dealer: 'Dealer',
  vat_auditor: 'VAT Auditor',
};

/** Badge color classes for inline role badges (light + dark mode) */
export const ROLE_BADGE_COLORS: Record<Role, string> = {
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  manager: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
  sr: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  dealer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  vat_auditor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
};

/**
 * Helper to build role-flag objects commonly used in components.
 * Returns boolean flags for each role based on the user's role string.
 */
export function getRoleFlags(userRole: string | undefined) {
  return {
    isAdmin: userRole === ROLES.ADMIN,
    isManager: userRole === ROLES.MANAGER,
    isSR: userRole === ROLES.SR,
    isDealer: userRole === ROLES.DEALER,
    isVatAuditor: userRole === ROLES.VAT_AUDITOR,
  };
}
