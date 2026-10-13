import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string, rounds = ROUNDS): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A valid hash of a random string. Comparing against it when the user does not
 * exist keeps login timing uniform, so response time doesn't reveal which
 * emails are registered.
 */
export const TIMING_SAFE_DUMMY_HASH = "$2b$12$IC.ZKkI8ZY7HBZKtq6kW1u34sneIl0OB9p1BkWsFUIO4brv0LzMMu";
