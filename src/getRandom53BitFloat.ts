import { randomBytes } from 'crypto';

/**
 * Selects a float between 0 (inclusive) and 1 (inclusive),
 * with 53 bits of randomness.
 */
export const getRandom53BitFloat = (): number => {
  const randomWord = randomBytes(8);
  // mask out the first 11 bits to get to a safe integer
  randomWord[0] = 0; // remove 8 bits
  randomWord[1] &= 0b11111; // remove 3 bits
  const randomLong = Number(randomWord.readBigUInt64BE(0));
  return randomLong / Number.MAX_SAFE_INTEGER;
};
