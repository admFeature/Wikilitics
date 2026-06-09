/**
 * Parsing du jeu de données « Scrutins » de l'Assemblée nationale (open data).
 *
 * Fonctions PURES : un fichier scrutin JSON → un scrutin normalisé + ses votes
 * NOMINATIFS (un par acteurRef). C'est la source qui, contrairement à CIVIX,
 * publie le sens de vote de chaque député (champ `decompteNominatif`).
 *
 * Structure réelle :
 *   scrutin.uid / numero / dateScrutin / titre / objet.libelle / sort.code
 *   scrutin.ventilationVotes.organe.groupes.groupe[]
 *     .vote.decompteNominatif.{pours,contres,abstentions,nonVotants}.votant[].acteurRef
 */
import type { VotePosition } from "@app/schema";

export interface ParsedVote {
  acteurRef: string; // ex "PA722190" (= uid CIVIX)
  position: VotePosition;
}

export interface ParsedScrutin {
  uid: string;
  numero: number | null;
  date: string | undefined; // YYYY-MM-DD
  titre: string;
  resultat: string | undefined;
  votes: ParsedVote[];
}

function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === "") return [];
  return [v];
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

const POSITION_BY_KEY: Record<string, VotePosition> = {
  pours: "pour",
  contres: "contre",
  abstentions: "abstention",
  nonVotants: "nonVotant",
};

function votantsOf(bloc: unknown): string[] {
  const rec = asRecord(bloc);
  if (!rec) return [];
  return arr(rec["votant"])
    .map((v) => str(asRecord(v)?.["acteurRef"]))
    .filter((x): x is string => typeof x === "string");
}

/** Parse un fichier scrutin AN en scrutin + votes nominatifs. */
export function parseScrutin(json: unknown): ParsedScrutin | null {
  const root = asRecord(json);
  const s = asRecord(root?.["scrutin"]);
  if (!s) return null;

  const uid = str(s["uid"]);
  if (!uid) return null;

  const objet = asRecord(s["objet"]);
  const titre = str(s["titre"]) ?? str(objet?.["libelle"]) ?? "(intitulé indisponible)";
  const sort = asRecord(s["sort"]);
  const numeroRaw = s["numero"];
  const numero =
    typeof numeroRaw === "number"
      ? numeroRaw
      : typeof numeroRaw === "string" && numeroRaw !== ""
        ? Number(numeroRaw)
        : null;

  const votes: ParsedVote[] = [];
  const organe = asRecord(asRecord(s["ventilationVotes"])?.["organe"]);
  const groupes = arr(asRecord(organe?.["groupes"])?.["groupe"]);
  for (const g of groupes) {
    const decompte = asRecord(asRecord(asRecord(g)?.["vote"])?.["decompteNominatif"]);
    if (!decompte) continue;
    for (const [key, position] of Object.entries(POSITION_BY_KEY)) {
      for (const acteurRef of votantsOf(decompte[key])) {
        votes.push({ acteurRef, position });
      }
    }
  }

  return {
    uid,
    numero: Number.isNaN(numero) ? null : numero,
    date: str(s["dateScrutin"])?.slice(0, 10),
    titre,
    resultat: str(sort?.["code"]),
    votes,
  };
}

/** URL canonique de provenance d'un scrutin (page officielle AN). */
export function scrutinSourceUrl(numero: number | null): string {
  return numero
    ? `https://www.assemblee-nationale.fr/dyn/17/scrutins/${numero}`
    : "https://data.assemblee-nationale.fr/travaux-parlementaires/votes";
}

export const SCRUTINS_ZIP_URL =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip";
export const ASSEMBLEE_LICENCE = "Licence Ouverte 2.0";
