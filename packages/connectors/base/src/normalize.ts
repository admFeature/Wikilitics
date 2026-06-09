/**
 * Helpers de normalisation DÉFENSIVE — fonctions pures.
 *
 * Les noms de champs exacts des sources externes ne sont pas garantis.
 * Ces helpers permettent de mapper sans présumer d'une clé unique.
 */

/** Type d'enregistrement brut générique provenant d'une source. */
export type Raw = Record<string, unknown>;

/** Vrai si la valeur est un objet (non-null, non-tableau). */
export function isRecord(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Renvoie la première clé présente et non-vide parmi `keys`.
 * Ex : pick(obj, "nom", "lastName", "last_name").
 */
export function pick(obj: unknown, ...keys: string[]): string | undefined {
  if (!isRecord(obj)) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      if (value.trim() !== "") return value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return undefined;
}

/** Variante de `pick` qui renvoie l'objet brut (utile pour descendre dans des sous-objets). */
export function pickRaw(obj: unknown, ...keys: string[]): unknown {
  if (!isRecord(obj)) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * Extrait un tableau d'un payload qui peut être :
 *  - un tableau nu : [ ... ]
 *  - un objet enveloppe : { results: [...] } | { data: [...] } | { items: [...] }
 * Renvoie [] si rien d'exploitable.
 */
export function asArray(payload: unknown): Raw[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (isRecord(payload)) {
    for (const key of ["results", "data", "items", "hits", "list"]) {
      const inner = payload[key];
      if (Array.isArray(inner)) return inner.filter(isRecord);
    }
  }
  return [];
}
