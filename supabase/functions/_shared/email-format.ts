// Strict-enough email format validation for staff usernames.
// Lowercased before checking. Does NOT verify deliverability.
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function isEmailFormat(value: string): boolean {
  return EMAIL_RE.test(value);
}

export function normalizeEmailUsername(value: string): string {
  return value.trim().toLowerCase();
}
