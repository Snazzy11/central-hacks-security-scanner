// [singular, plural]
const NAMES: Record<string, [string, string]> = {
  PERSON: ['name', 'names'],
  EMAIL_ADDRESS: ['email address', 'email addresses'],
  PHONE_NUMBER: ['phone number', 'phone numbers'],
  DATE_OF_BIRTH: ['date of birth', 'dates of birth'],
  US_SSN: ['social security number', 'social security numbers'],
  CREDIT_CARD: ['credit card number', 'credit card numbers'],
  PASSWORD: ['password', 'passwords'],
  US_BANK_NUMBER: ['bank account number', 'bank account numbers'],
  IBAN_CODE: ['IBAN', 'IBANs'],
  IP_ADDRESS: ['IP address', 'IP addresses'],
  USERNAME: ['username', 'usernames'],
};

export function typeLabel(entityType: string, count: number) {
  const fallback = entityType.toLowerCase().replace(/_/g, ' ');
  const [one, many] = NAMES[entityType] ?? [fallback, fallback];
  return count === 1 ? one : many;
}
