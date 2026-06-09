/**
 * Annuaire CIVIX préchargé — pour des suggestions INSTANTANÉES.
 *
 * CIVIX expose tout l'annuaire des députés via /deputes (paginé). On le
 * récupère UNE fois, on le garde en mémoire, et la recherche au fil de la frappe
 * filtre localement (aucun appel réseau par frappe). Données réelles et tracées.
 */
import { type Raw } from "@app/connectors-base";
import type { DeputeSummary, SearchHit } from "@app/schema";
import { civixUrl } from "./routes.js";
import { extractDeputesPage, normDeputeSummary } from "./normalisation.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 12; // garde-fou (≈1200 députés max)

/** Entrée d'annuaire : résumé + libellé normalisé pour le filtrage. */
export interface RosterEntry {
  summary: DeputeSummary;
  haystack: string; // "prenom nom groupeAbbr" sans accents, en minuscule
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parcourt toutes les pages de /deputes et construit l'annuaire normalisé. */
export async function fetchRoster(
  fetchJson: (url: string) => Promise<unknown>,
): Promise<RosterEntry[]> {
  const entries: RosterEntry[] = [];
  let page = 1;

  for (let i = 0; i < MAX_PAGES; i++) {
    const payload = await fetchJson(civixUrl.deputesPage(page, PAGE_SIZE));
    const { items, nextPage } = extractDeputesPage(payload);
    for (const raw of items as Raw[]) {
      const summary = normDeputeSummary(raw);
      if (summary.uid === "") continue;
      const label = `${summary.prenom} ${summary.nom} ${summary.groupeAbbr ?? ""}`;
      entries.push({ summary, haystack: normalizeText(label) });
    }
    if (nextPage === null || nextPage === page) break;
    page = nextPage;
  }
  return entries;
}

/** Filtre l'annuaire par sous-chaîne (tous les mots de la requête présents). */
export function filterRoster(
  roster: readonly RosterEntry[],
  query: string,
  limit = 12,
): SearchHit[] {
  const terms = normalizeText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const entry of roster) {
    if (terms.every((t) => entry.haystack.includes(t))) {
      const s = entry.summary;
      const sublabel = [s.groupeAbbr ?? s.groupe, s.circonscription]
        .filter(Boolean)
        .join(" · ");
      hits.push({
        uid: s.uid,
        type: "depute",
        label: `${s.prenom} ${s.nom}`.trim(),
        ...(sublabel ? { sublabel } : {}),
      });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}
