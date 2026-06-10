/**
 * Parsing du CONTENU d'une déclaration d'INTÉRÊTS HATVP (XML individuel).
 *
 * ⚠ CONFORMITÉ : on ne traite QUE des fichiers d'intérêts (di*). Les données
 * personnelles (email/téléphone/adresse) sont déjà caviardées par HATVP
 * (« [Données non publiées] ») et on ne les expose pas. On affiche les
 * rubriques d'intérêts déclarées (open data, Licence Ouverte).
 *
 * Fonctions PURES (XMLParser sur une chaîne).
 */
import { XMLParser } from "fast-xml-parser";
import type { InteretItem, InteretRubrique } from "@app/schema";

/** Rubriques affichées (clé DTO → libellé). Ordre = ordre d'affichage. */
const RUBRIQUES: Array<[string, string]> = [
  ["activProfCinqDerniereDto", "Activités professionnelles (5 dernières années)"],
  ["activConsultantDto", "Activités de consultant"],
  ["participationDirigeantDto", "Participation à la direction d'organismes"],
  ["participationFinanciereDto", "Participations financières"],
  ["fonctionBenevoleDto", "Fonctions bénévoles"],
  ["mandatElectifDto", "Autres mandats électifs"],
  ["activProfConjointDto", "Activité professionnelle du conjoint"],
  ["observationInteretDto", "Observations"],
  // NB : activCollaborateursDto (nomme des tiers) volontairement non affiché.
];

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

function toArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object");
  if (v && typeof v === "object") return [v as Record<string, unknown>];
  return [];
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") {
    const t = v.replace(/\[Données non publiées\]/g, "").replace(/\s+/g, " ").trim();
    return t === "" ? undefined : t;
  }
  if (typeof v === "number") return String(v);
  return undefined;
}

/** Première valeur non vide parmi des clés candidates. */
function pick(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return undefined;
}

/** Construit la période "MM/AAAA – MM/AAAA" (ou "depuis …"). */
function periode(o: Record<string, unknown>): string | undefined {
  const debut = pick(o, "dateDebut");
  const fin = pick(o, "dateFin");
  if (debut && fin) return `${debut} – ${fin}`;
  if (debut) return `depuis ${debut}`;
  if (fin) return `jusqu'à ${fin}`;
  return undefined;
}

/** Dernière rémunération non nulle (année la plus récente). */
function remuneration(o: Record<string, unknown>): string | undefined {
  const rem = o["remuneration"];
  if (!rem || typeof rem !== "object") {
    return pick(o, "evaluation");
  }
  const inner = (rem as Record<string, unknown>)["montant"];
  const lignes = inner && typeof inner === "object"
    ? toArray((inner as Record<string, unknown>)["montant"])
    : [];
  let best: { annee: string; montant: string } | undefined;
  for (const l of lignes) {
    const annee = str(l["annee"]);
    const montant = str(l["montant"]);
    if (!annee || !montant || montant === "0") continue;
    if (!best || annee > best.annee) best = { annee, montant };
  }
  return best ? `${best.montant} € (${best.annee})` : undefined;
}

/** Certains déclarants écrivent littéralement « néant » dans un champ. */
function isNeantWord(s: string | undefined): boolean {
  return !!s && /^(neant|néant|n\/a|na|ras|sans objet|aucun[e]?)$/i.test(s.trim());
}

function toItem(o: Record<string, unknown>): InteretItem | null {
  let titre = pick(o, "nomSociete", "employeur", "employeurConjoint", "descriptionMandat", "description", "nom", "contenu");
  let detailRaw = pick(o, "activite", "activiteProf", "fonction", "commentaire", "contenu", "description", "descriptionMandat");
  if (isNeantWord(titre)) titre = undefined;
  if (isNeantWord(detailRaw)) detailRaw = undefined;
  const detail = detailRaw && detailRaw !== titre ? detailRaw : undefined;
  const item: InteretItem = {
    ...(titre ? { titre } : {}),
    ...(detail ? { detail } : {}),
    ...(periode(o) ? { periode: periode(o) } : {}),
    ...(remuneration(o) ? { remuneration: remuneration(o) } : {}),
  };
  return item.titre || item.detail ? item : null;
}

/** Parse une déclaration d'intérêts (XML) → rubriques affichables. */
export function parseDeclarationInterets(xml: string): InteretRubrique[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const decl = doc["declaration"];
  if (!decl || typeof decl !== "object") return [];
  const d = decl as Record<string, unknown>;

  const out: InteretRubrique[] = [];
  for (const [key, label] of RUBRIQUES) {
    const dto = d[key];
    if (!dto || typeof dto !== "object") continue;
    const node = dto as Record<string, unknown>;
    const neant = str(node["neant"]) === "true";
    const itemsNode = node["items"];
    const rawItems = itemsNode && typeof itemsNode === "object"
      ? toArray((itemsNode as Record<string, unknown>)["items"])
      : [];
    const items = rawItems.map(toItem).filter((x): x is InteretItem => x !== null);
    // On n'affiche que les rubriques avec un contenu réellement déclaré.
    if (items.length === 0) continue;
    out.push({ label, neant, items });
  }
  return out;
}
