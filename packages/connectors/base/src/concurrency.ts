/**
 * Limiteur de concurrence — fonction pure d'orchestration.
 *
 * Utilisé pour récupérer « les derniers votes d'un·e député·e » : on doit
 * interroger N scrutins, mais avec une concurrence bornée (≈4) pour rester
 * dans un « usage raisonnable » de la source.
 */

/**
 * Applique `worker` à chaque élément de `items`, au plus `limit` en parallèle.
 * Préserve l'ordre des résultats.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length || 1));

  async function runner(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index] as T;
      results[index] = await worker(item, index);
    }
  }

  await Promise.all(Array.from({ length: size }, () => runner()));
  return results;
}
