import { createRandomRangeFunction } from './createRandomRangeFunction';
import { getRandom53BitFloat } from './getRandom53BitFloat';

/**
 * Creates a function which can generate a random permutation of the given
 * length, where the entries are 0, 1, ..., length - 1.
 *
 * @param length The length of the permutation
 * @returns A function which can generate a random permutation
 */
export const createRandomShuffleFunction = (
  length: number
): (() => number[]) => {
  if (length < 0) {
    throw new Error('length must be at least 0');
  }

  if (length === 0) {
    return () => [];
  }

  if (length === 1) {
    return () => [0];
  }

  if (length === 2) {
    const selectFirst = createRandomRangeFunction(2);
    return () => {
      const first = selectFirst();
      return [first, 1 - first];
    };
  }

  if (length < 16) {
    // fisher-yates inside-out shuffle using optimized generators
    const generators: (() => number)[] = [];
    for (let i = 0; i < length; i++) {
      generators.push(createRandomRangeFunction(i + 1));
    }

    return () => {
      const result = new Array<number>(length);
      for (let i = 0; i < length; i++) {
        const j = generators[i]();
        result[i] = result[j];
        result[j] = i;
      }
      return result;
    };
  }

  // fisher yates inside-out shuffle with unoptimized generators
  return () => {
    const result = new Array<number>(length);
    for (let i = 0; i < length; i++) {
      while (true) {
        const j = Math.floor(getRandom53BitFloat() * (i + 1));
        if (j === i + 1) {
          continue;
        }
        result[i] = result[j];
        result[j] = i;
      }
    }
    return result;
  };
};
