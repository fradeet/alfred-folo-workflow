/**
 * Runs `operation` on every value with at most `limit` calls in flight and
 * resolves with each result in `values` order, like `Promise.all`.
 */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(values.length);
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < values.length) {
      const current = index++;
      results[current] = await operation(values[current]);
    }
  };
  const size = Math.max(1, Math.min(limit, values.length));
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
