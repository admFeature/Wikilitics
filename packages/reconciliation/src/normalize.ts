/**
 * Normalisation des libellés d'identité — fonctions PURES.
 * Sert de base au calcul de similarité entre identités de sources différentes.
 */

/** minuscule, sans accents, sans ponctuation, espaces normalisés. */
export function normalizeLabel(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritiques combinants
    .replace(/[-'']/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distance de Levenshtein (itérative, O(n·m)). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1, // suppression
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

/** Similarité 0..1 dérivée de la distance de Levenshtein normalisée. */
export function similarity(a: string, b: string): number {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (na === "" && nb === "") return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}
