export async function mapPool<T, R>(
  list: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const n = list.length;
  if (n === 0) return [];
  const cap = Math.max(1, Math.min(limit, n));
  const out: R[] = new Array(n);
  let cursor = 0;

  const workers = Array.from({ length: cap }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= n) return;
      out[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
