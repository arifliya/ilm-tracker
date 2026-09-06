// Fast client-side feedback only — backend/src/routes/auth.ts enforces the
// same rule server-side and is the real source of truth. Keep these in sync.
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 72) {
    return "Password must be at most 72 characters";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number";
  }
  return null;
}
