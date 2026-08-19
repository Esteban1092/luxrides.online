const SCHEMA_MISSING_PATTERNS = [
  'could not find the table',
  'could not find the column',
  'does not exist',
  'relation',
  'schema cache',
  'no such table',
  'undefined column'
];

export function isSchemaMissingError(error) {
  const message = String(error?.message || error?.error || error?.details || '').toLowerCase();
  if (!message) return false;
  return SCHEMA_MISSING_PATTERNS.some((pattern) => message.includes(pattern));
}
