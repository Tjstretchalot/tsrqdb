import { randomBytes } from 'crypto';
import { getRandom53BitFloat } from './getRandom53BitFloat';

/**
 * Creates a function which can be called to get a random number between 0
 * (inclusive) and max (exclusive). This is optimized for our standard
 * cases for randomness, which involve small numbers.
 */
export const createRandomRangeFunction = (max: number): (() => number) => {
  if (max <= 0) {
    throw new Error('max must be greater than 0');
  }

  if (max === 1) {
    // Single-node cluster
    return () => 0;
  }

  if (max <= 256) {
    // if max is an exact power of 2, we can just pluck bits
    if ((max & (max - 1)) === 0) {
      const mask = max - 1;
      return () => {
        const buf = randomBytes(1);
        return buf[0] & mask;
      };
    }

    // check rejection rate using optimal modulo on a single byte.
    // for the most common case of a 3-node cluster, where we will need
    // max=3, we will have to reject one value to get a uniform distribution,
    // i.e., a (1/256)*100 ~= 0.4% rejection rate.

    const bestSingleByteMax = 256 - (256 % max);
    const rejectionRate = (1 - bestSingleByteMax / 256) * 100;

    if (rejectionRate < 5) {
      return () => {
        while (true) {
          const val = randomBytes(1)[0];
          // we start with zero so we can't end on zero
          if (val >= bestSingleByteMax) {
            continue;
          }
          return val % max;
        }
      };
    }
  }

  // use standard 53-bit random double; requires a lot of wasted
  // random bits but almost never rejects
  return () => {
    while (true) {
      const result = Math.floor(getRandom53BitFloat() * max);
      if (result !== max) {
        return result;
      }
    }
  };
};
