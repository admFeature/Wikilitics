/**
 * ====================================================================
 *  NORMALISATION — mapping PoliGraph → modèle de domaine
 * ====================================================================
 *
 * Mêmes principes défensifs que CIVIX (plusieurs clés candidates par champ).
 * À resserrer sur des réponses réelles une fois les routes PoliGraph confirmées.
 */
import { pick, pickRaw, isRecord, asArray, type Raw } from "@app/connectors-base";
import type {
  DeputeSummary,
  ScrutinSummary,
  SearchHit,
  VotePosition,
} from "@app/schema";

const KEYS = {
  uid: ["uid", "id", "ref", "slug", "matricule"],
  nom: ["nom", "lastName", "last_name"],
  prenom: ["prenom", "prénom", "firstName", "first_name"],
  groupe: ["groupe", "groupe_libelle", "group", "parti"],
  groupeAbbr: ["groupe_abrev", "groupeAbbr", "abbr", "sigle"],
  circonscription: ["circonscription", "departement", "territoire", "fonction"],
  profession: ["profession", "metier", "fonction"],
  titre: ["titre", "objet", "libelle", "objet_libelle", "title"],
  date: ["date", "date_scrutin", "datePublication"],
  resultat: ["resultat", "result", "sort"],
  position: ["position", "vote", "sens", "choix"],
  role: ["role", "type", "qualite"],
} as const;

export function normUid(raw: Raw, fallback = ""): string {
  return pick(raw, ...KEYS.uid) ?? fallback;
}

export function normSummary(raw: Raw): DeputeSummary & { role?: string } {
  const role = pick(raw, ...KEYS.role);
  return {
    uid: normUid(raw),
    nom: pick(raw, ...KEYS.nom) ?? "",
    prenom: pick(raw, ...KEYS.prenom) ?? "",
    ...optional("groupe", pick(raw, ...KEYS.groupe)),
    ...optional("groupeAbbr", pick(raw, ...KEYS.groupeAbbr)),
    ...optional("circonscription", pick(raw, ...KEYS.circonscription)),
    ...optional("role", role),
  };
}

export function normProfession(raw: Raw): string | undefined {
  return pick(raw, ...KEYS.profession);
}

export function normScrutinSummary(raw: Raw): ScrutinSummary {
  const objet = pickRaw(raw, "objet");
  const titreImbrique = isRecord(objet) ? pick(objet, "libelle") : undefined;
  return {
    uid: normUid(raw),
    titre: pick(raw, ...KEYS.titre) ?? titreImbrique ?? "(intitulé indisponible)",
    ...optional("date", pick(raw, ...KEYS.date)),
    ...optional("resultat", pick(raw, ...KEYS.resultat)),
  };
}

export function normPosition(value: string | undefined): VotePosition | undefined {
  if (!value) return undefined;
  const v = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (/non[ _-]?votant|nonvotant|absent|^nv$/.test(v)) return "nonVotant";
  if (/abstention|abstenu/.test(v)) return "abstention";
  if (/\b(pour|oui|for)\b/.test(v)) return "pour";
  if (/\b(contre|non|against)\b/.test(v)) return "contre";
  return undefined;
}

export function extractList(payload: unknown): Raw[] {
  // PoliGraph : on tente results.{personnes|senateurs}, puis fallback générique.
  const results = pickRaw(payload, "results", "data");
  const inner = pickRaw(results, "personnes", "senateurs", "membres");
  if (Array.isArray(inner)) return inner.filter(isRecord);
  return asArray(payload);
}

export function normSearchHit(raw: Raw): SearchHit {
  const s = normSummary(raw);
  const label = [s.prenom, s.nom].filter(Boolean).join(" ").trim();
  const sublabel = [s.role ?? s.groupeAbbr ?? s.groupe, s.circonscription]
    .filter(Boolean)
    .join(" · ");
  return {
    uid: s.uid,
    type: "depute",
    label: label || s.uid || "(sans nom)",
    ...optional("sublabel", sublabel || undefined),
  };
}

function optional<K extends string>(
  key: K,
  value: string | undefined,
): Record<K, string> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}
