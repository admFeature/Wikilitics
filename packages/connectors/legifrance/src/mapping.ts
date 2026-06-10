/**
 * NORMALISATION Légifrance — un résultat brut de /search → LegifranceText.
 * Fonctions PURES (testables sans réseau).
 *
 * Forme observée : results[].titles[0] = { id, cid, title } + nature, etat, date.
 */
import type { LegifranceText } from "@app/schema";

const LF_BASE = "https://www.legifrance.gouv.fr";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Retire les balises de surbrillance <mark> et normalise les espaces. */
export function cleanTitle(s: string): string {
  return s.replace(/<\/?mark>/gi, "").replace(/\s+/g, " ").trim();
}

/** Construit l'URL legifrance.gouv.fr la plus pertinente pour un texte. */
export function legifranceUrl(cid: string | undefined, legiId: string | undefined, titre: string): string {
  if (cid && cid.startsWith("JORFTEXT")) return `${LF_BASE}/jorf/id/${cid}`;
  if (legiId && legiId.startsWith("LEGITEXT")) return `${LF_BASE}/loda/id/${legiId}`;
  if (cid && cid.startsWith("LEGITEXT")) return `${LF_BASE}/loda/id/${cid}`;
  return `${LF_BASE}/search/all?query=${encodeURIComponent(titre)}`;
}

/** Mappe un résultat de recherche en LegifranceText (null si inexploitable). */
export function mapResult(raw: unknown): LegifranceText | null {
  if (!isRecord(raw)) return null;
  const titles = Array.isArray(raw["titles"]) ? raw["titles"] : [];
  const t0 = isRecord(titles[0]) ? titles[0] : undefined;
  const rawTitle = str(t0?.["title"]);
  if (!rawTitle) return null;
  const titre = cleanTitle(rawTitle);

  // id LEGITEXT vient parfois suffixé d'une date ("LEGITEXT..._26-02-2026").
  const legiId = str(t0?.["id"])?.split("_")[0];
  const cid = str(t0?.["cid"]);
  const url = legifranceUrl(cid, legiId, titre);

  const dateRaw = str(raw["date"]);
  const date = dateRaw ? dateRaw.slice(0, 10) : undefined;

  return {
    id: cid ?? legiId ?? titre,
    titre,
    ...(str(raw["nature"]) ? { nature: str(raw["nature"]) } : {}),
    ...(date ? { date } : {}),
    ...(str(raw["etat"]) ? { etat: str(raw["etat"]) } : {}),
    url,
  };
}
