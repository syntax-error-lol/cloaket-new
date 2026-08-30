/**
 * Password rules for NEW passwords (register, change-password, unlock reset).
 * Existing accounts with older/shorter passwords can still log in — the
 * policy only gates setting a password, never checking one.
 */
export const MIN_PASSWORD_LEN = 8;
export const MAX_PASSWORD_LEN = 100;

// Passwords kids actually pick and friends actually guess. Checked
// case-insensitively. Deliberately tiny: a speed bump for the most common
// guesses, not a dictionary.
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "11111111",
  "00000000",
  "abc12345",
  "abcd1234",
  "1q2w3e4r",
  "asdfghjkl",
  "zxcvbnm123",
  "iloveyou",
  "sunshine",
  "football",
  "baseball",
  "princess",
  "letmein1",
  "welcome1",
  "dragon123",
  "minecraft",
  "fortnite1",
  "roblox123",
  "blacket123",
  "blooket123",
  "87654321",
  "qwerty12",
]);

/** Returns a user-facing problem message, or null if the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LEN) {
    return `Password must be at least ${MIN_PASSWORD_LEN} characters`;
  }
  if (password.length > MAX_PASSWORD_LEN) {
    return `Password must be at most ${MAX_PASSWORD_LEN} characters`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too easy to guess — pick something more unique";
  }
  return null;
}
