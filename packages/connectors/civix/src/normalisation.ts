/**
 * ====================================================================
 *  NORMALISATION — mapping CIVIX → modèle de domaine
 * ====================================================================
 *
 * UNIQUE point de mapping des champs CIVIX. Les noms de champs exacts ne sont
 * pas garantis : tout est fait de façon DÉFENSIVE (plusieurs clés candidates
 * par champ via `pick`, déballage tolérant des enveloppes). Pour resserrer le
 * mapping sur des réponses réelles : `pnpm probe -- "<nom>"` puis ajuster ICI.
 *
 * Calé sur les réponses réelles observées (schema_version CIVIX 2026-04-29) :
 *   - search   → payload.results.deputes[]   (acteur_uid, prenom, nom, …)
 *   - depute   → payload.data.deputy         (uid, prenom, nom, groupe_*, circ_*)
 *   - scrutins → payload.data.results[]      (uid, date_scrutin, titre, …)
 *   - votes    → payload.data.results_by_group[]  → AGRÉGATS PAR GROUPE
 *
 * ⚠ LIMITE IMPORTANTE : l'endpoint /scrutins/{uid}/votes de CIVIX n'expose
 *   QUE des décomptes agrégés (par groupe), JAMAIS le vote nominatif d'un·e
 *   député·e. On NE reconstruit donc PAS un vote individuel à partir d'un
 *   agrégat (ce serait inventer une donnée → interdit). `extractNominativeVotes`
 *   reste défensif : si CIVIX expose un jour des votes nominatifs, le mapping
 *   les captera ; sinon il renvoie [] et la fiche affiche un état vide honnête.
 *
 * Toutes les fonctions sont pures.
 */
import { pick, pickRaw, isRecord, type Raw } from "@app/connectors-base";
import type {
  DeputeSummary,
  ScrutinSummary,
  SearchHit,
  VotePosition,
} from "@app/schema";

/* ------------------------------------------------------------------ */
/* Clés candidates (ordre = priorité ; à resserrer après diagnostic)   */
/* ------------------------------------------------------------------ */

const KEYS = {
  uid: ["acteur_uid", "uid", "id", "ref", "identifiant", "slug"],
  nom: ["nom", "lastName", "last_name"],
  prenom: ["prenom", "prénom", "firstName", "first_name"],
  groupe: ["groupe_libelle", "groupe", "group", "groupe_politique"],
  groupeAbbr: ["groupe_libelle_abrev", "groupe_abrev", "groupeAbbr", "abbr", "sigle"],
  circonscription: ["circ_departement", "circonscription", "circo", "departement"],
  profession: ["profession", "metier", "job"],
  titre: ["objet_libelle", "titre", "objet", "libelle", "libellé", "title"],
  date: ["date_scrutin", "date", "datePublication", "date_publication"],
  resultat: ["resultat", "résultat", "result", "issue", "sort"],
  position: ["position", "vote", "sens", "choix", "positionVote"],
  acteurRef: ["acteur_uid", "depute_uid", "depute", "acteur", "personne", "membre"],
} as const;

/* ------------------------------------------------------------------ */
/* Déballage des enveloppes CIVIX                                      */
/* ------------------------------------------------------------------ */

/** Liste des députés d'une réponse /search : payload.results.deputes[]. */
export function extractDeputesFromSearch(payload: unknown): Raw[] {
  const results = pickRaw(payload, "results", "data");
  const deputes = pickRaw(results, "deputes");
  if (Array.isArray(deputes)) return deputes.filter(isRecord);
  // Repli défensif : enveloppe plate ou tableau nu.
  if (Array.isArray(results)) return results.filter(isRecord);
  if (Array.isArray(payload)) return payload.filter(isRecord);
  return [];
}

/** Détail d'un député : payload.data.deputy (ou .attributes.deputy, ou .data). */
export function extractDeputeDetail(payload: unknown): Raw | undefined {
  const data = pickRaw(payload, "data", "result");
  const deputy =
    pickRaw(data, "deputy", "depute") ??
    pickRaw(pickRaw(data, "attributes"), "deputy", "depute");
  if (isRecord(deputy)) return deputy;
  if (isRecord(data)) return data;
  if (isRecord(payload)) return payload;
  return undefined;
}

/**
 * Une page de l'annuaire /deputes : { items, nextPage }.
 * Forme réelle : payload.data.results[] + payload.meta.pagination.next_page.
 */
export function extractDeputesPage(payload: unknown): {
  items: Raw[];
  nextPage: number | null;
} {
  const data = pickRaw(payload, "data");
  const results = pickRaw(data, "results", "deputes", "items");
  const items = Array.isArray(results) ? results.filter(isRecord) : [];

  const meta = pickRaw(payload, "meta");
  const pagination = pickRaw(meta, "pagination") ?? pickRaw(data, "pagination");
  const rawNext = isRecord(pagination) ? pagination["next_page"] : undefined;
  const nextPage = typeof rawNext === "number" ? rawNext : null;

  return { items, nextPage };
}

/** Liste des scrutins : payload.data.results[]. */
export function extractScrutinsList(payload: unknown): Raw[] {
  const data = pickRaw(payload, "data");
  const results = pickRaw(data, "results", "scrutins", "items");
  if (Array.isArray(results)) return results.filter(isRecord);
  if (Array.isArray(data)) return data.filter(isRecord);
  if (Array.isArray(payload)) return payload.filter(isRecord);
  return [];
}

/**
 * Votes NOMINATIFS d'un scrutin, s'ils existent. Cherche un tableau dont les
 * éléments référencent un acteur ET portent une position. Le payload CIVIX
 * actuel ne contient que des agrégats (results_by_group) → renvoie [].
 */
export function extractNominativeVotes(payload: unknown): Raw[] {
  const data = pickRaw(payload, "data") ?? payload;
  const candidates = [
    pickRaw(data, "votes"),
    pickRaw(data, "votants"),
    pickRaw(data, "nominatif"),
    pickRaw(pickRaw(data, "attributes"), "votes"),
  ];
  for (const cand of candidates) {
    if (Array.isArray(cand)) {
      const rows = cand.filter(isRecord);
      // On ne garde que si ça ressemble à du nominatif (réf. acteur présente).
      if (rows.some((r) => pick(r, ...KEYS.acteurRef) !== undefined)) return rows;
    }
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Identité & libellés                                                 */
/* ------------------------------------------------------------------ */

export function normUid(raw: Raw, fallback = ""): string {
  return pick(raw, ...KEYS.uid) ?? fallback;
}

export function normDeputeSummary(raw: Raw): DeputeSummary {
  return {
    uid: normUid(raw),
    nom: pick(raw, ...KEYS.nom) ?? "",
    prenom: pick(raw, ...KEYS.prenom) ?? "",
    ...optional("groupe", pick(raw, ...KEYS.groupe)),
    ...optional("groupeAbbr", pick(raw, ...KEYS.groupeAbbr)),
    ...optional("circonscription", normCirconscription(raw)),
  };
}

/** Compose la circonscription (département + n° de circ. si disponible). */
function normCirconscription(raw: Raw): string | undefined {
  const dep = pick(raw, ...KEYS.circonscription);
  const num = pick(raw, "circ_num");
  if (dep && num) return `${dep} (${num}e circ.)`;
  return dep;
}

export function normProfession(raw: Raw): string | undefined {
  return pick(raw, ...KEYS.profession);
}

export function normScrutinSummary(raw: Raw): ScrutinSummary {
  // Le titre peut être imbriqué (objet.libelle).
  const objet = pickRaw(raw, "objet", "objet_raw");
  const titreImbrique = isRecord(objet) ? pick(objet, "libelle", "libellé") : undefined;
  return {
    uid: normUid(raw),
    titre: pick(raw, ...KEYS.titre) ?? titreImbrique ?? "(intitulé indisponible)",
    ...optional("date", normDate(pick(raw, ...KEYS.date))),
    ...optional("resultat", pick(raw, ...KEYS.resultat)),
  };
}

/** Réduit un datetime ISO ("2026-06-04T00:00:00+00:00") à sa date. */
function normDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : value;
}

/* ------------------------------------------------------------------ */
/* Position de vote (nominatif uniquement)                            */
/* ------------------------------------------------------------------ */

/** Normalise une valeur de position CIVIX vers le vocabulaire du domaine. */
export function normPosition(value: string | undefined): VotePosition | undefined {
  if (!value) return undefined;
  const v = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // retire les diacritiques combinants

  if (/non[ _-]?votant|nonvotant|^nv$|absent/.test(v)) return "nonVotant";
  if (/abstention|abstenu|abstain/.test(v)) return "abstention";
  if (/\b(pour|for|yes|oui)\b/.test(v) || v === "pour") return "pour";
  if (/\b(contre|against|no|non)\b/.test(v)) return "contre";
  return undefined;
}

/**
 * Dans un tableau de votes NOMINATIFS, retrouve l'enregistrement du député
 * ciblé puis en extrait sa position. (Sans nominatif côté CIVIX → undefined.)
 */
export function extractPositionForDepute(
  nominativeVotes: Raw[],
  deputeUid: string,
): VotePosition | undefined {
  for (const entry of nominativeVotes) {
    if (recordMatchesDepute(entry, deputeUid)) {
      return normPosition(pick(entry, ...KEYS.position));
    }
  }
  return undefined;
}

function recordMatchesDepute(entry: Raw, deputeUid: string): boolean {
  const directUid = pick(entry, ...KEYS.uid, ...KEYS.acteurRef);
  if (directUid && directUid === deputeUid) return true;
  const nested = pickRaw(entry, ...KEYS.acteurRef);
  if (isRecord(nested) && normUid(nested) === deputeUid) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Recherche                                                          */
/* ------------------------------------------------------------------ */

/** Mappe un résultat de recherche brut en SearchHit (députés en phase 1). */
export function normSearchHit(raw: Raw): SearchHit {
  const summary = normDeputeSummary(raw);
  const label = [summary.prenom, summary.nom].filter(Boolean).join(" ").trim();
  const sublabel = [summary.groupeAbbr ?? summary.groupe, summary.circonscription]
    .filter(Boolean)
    .join(" · ");
  return {
    uid: summary.uid,
    type: "depute",
    label: label || summary.uid || "(sans nom)",
    ...optional("sublabel", sublabel || undefined),
  };
}

/* ------------------------------------------------------------------ */
/* Utilitaire interne                                                  */
/* ------------------------------------------------------------------ */

/** Inclut une clé optionnelle uniquement si la valeur est définie. */
function optional<K extends string>(
  key: K,
  value: string | undefined,
): Record<K, string> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}
