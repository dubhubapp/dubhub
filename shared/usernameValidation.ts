/**
 * Username Validation Utility
 * Shared validation rules for frontend and backend
 */

// Reserved usernames (case-insensitive)
export const RESERVED_USERNAMES = [
  'admin',
  'dubhubadmin',
  'support',
  'dubhubsupport',
  'moderator',
  'dubhubmoderator',
  'dubhubhelp',
  'joshdubhub',
  'dubhubjosh',
  'dubhub.uk',
] as const;

// Username validation regex
// Rules:
// - No leading dots or underscores: ^(?![._])
// - No trailing dots or underscores: (?!.*[._]$)
// - No double dots: (?!.*\.\.)
// - Only letters, numbers, underscores, dots: [a-zA-Z0-9._]
// - Length 3-20: {3,20}
export const USERNAME_REGEX = /^(?![._])(?!.*[._]$)(?!.*\.\.)[a-zA-Z0-9._]{3,20}$/;

export type UsernameValidationResult = {
  valid: boolean;
  error?: string;
  reason?: 'regex_fail' | 'reserved_word' | 'format' | 'length';
};

/**
 * Validate username format and check against reserved words
 * @param username - Username to validate
 * @returns Validation result with error message if invalid
 */
export function validateUsername(username: string): UsernameValidationResult {
  // Trim whitespace
  const trimmed = username.trim();

  // Check length
  if (trimmed.length < 3) {
    return {
      valid: false,
      error: 'Username must be at least 3 characters long',
      reason: 'length',
    };
  }

  if (trimmed.length > 20) {
    return {
      valid: false,
      error: 'Username must be 20 characters or less',
      reason: 'length',
    };
  }

  // Check for spaces
  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      error: 'Usernames cannot contain spaces',
      reason: 'format',
    };
  }

  // Check regex pattern
  if (!USERNAME_REGEX.test(trimmed)) {
    // Provide specific error messages
    if (trimmed.startsWith('.') || trimmed.startsWith('_')) {
      return {
        valid: false,
        error: "Usernames can't start with a dot or underscore",
        reason: 'format',
      };
    }

    if (trimmed.endsWith('.') || trimmed.endsWith('_')) {
      return {
        valid: false,
        error: "Usernames can't end with a dot or underscore",
        reason: 'format',
      };
    }

    if (trimmed.includes('..')) {
      return {
        valid: false,
        error: 'Double dots are not allowed',
        reason: 'format',
      };
    }

    // Check for invalid characters
    if (!/^[a-zA-Z0-9._]+$/.test(trimmed)) {
      return {
        valid: false,
        error: 'Only letters, numbers, underscores and dots are allowed',
        reason: 'regex_fail',
      };
    }

    return {
      valid: false,
      error: 'Invalid username format',
      reason: 'regex_fail',
    };
  }

  // Check reserved words (case-insensitive)
  const lowerUsername = trimmed.toLowerCase();
  if (RESERVED_USERNAMES.some((reserved) => reserved.toLowerCase() === lowerUsername)) {
    return {
      valid: false,
      error: 'This username is unavailable',
      reason: 'reserved_word',
    };
  }

  return { valid: true };
}

/**
 * Normalize username for storage (lowercase)
 * @param username - Username to normalize
 * @returns Normalized username (lowercase)
 */
export function normalizeUsernameForStorage(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Check if username is reserved (case-insensitive)
 * @param username - Username to check
 * @returns True if reserved
 */
export function isReservedUsername(username: string): boolean {
  const lowerUsername = username.trim().toLowerCase();
  return RESERVED_USERNAMES.some((reserved) => reserved.toLowerCase() === lowerUsername);
}


