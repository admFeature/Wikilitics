/**
 * @app/schema — Modèle de domaine partagé.
 *
 * Source unique de vérité : les schémas Zod ci-dessous définissent à la fois
 * la validation runtime (entrées/sorties externes) et les types TypeScript
 * (via z.infer). Backend et frontend importent d'ici.
 *
 * Principe non négociable : chaque FAIT porte sa `Provenance`.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Position de vote                                                     */
/* ------------------------------------------------------------------ */

export const VotePositionSchema = z.enum([
  "pour",
  "contre",
  "abstention",
  "nonVotant",
]);
export type VotePosition = z.infer<typeof VotePositionSchema>;

/* ------------------------------------------------------------------ */
/* Provenance — attachée à chaque donnée affichée                      */
/* ------------------------------------------------------------------ */

export const SourceSchema = z.enum([
  "CIVIX",
  "POLIGRAPH",
  "LEGIFRANCE",
  "ASSEMBLEE",
  "SENAT",
  "HATVP",
  "VIE_PUBLIQUE",
]);
export type Source = z.infer<typeof SourceSchema>;

export const ProvenanceSchema = z.object({
  source: SourceSchema,
  /** URL exacte de la donnée d'origine. */
  sourceUrl: z.string().url(),
  /** Date de collecte, ISO 8601. */
  collectedAt: z.string().datetime(),
  /** Licence de réutilisation, ex: "Licence Ouverte 2.0", "ODbL". */
  licence: z.string().min(1),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/* ------------------------------------------------------------------ */
/* Députés                                                             */
/* ------------------------------------------------------------------ */

export const DeputeSummarySchema = z.object({
  uid: z.string().min(1),
  nom: z.string(),
  prenom: z.string(),
  groupe: z.string().optional(),
  groupeAbbr: z.string().optional(),
  circonscription: z.string().optional(),
});
export type DeputeSummary = z.infer<typeof DeputeSummarySchema>;

export const DeputeDetailSchema = DeputeSummarySchema.extend({
  profession: z.string().optional(),
  provenance: ProvenanceSchema,
});
export type DeputeDetail = z.infer<typeof DeputeDetailSchema>;

/* ------------------------------------------------------------------ */
/* Scrutins & votes                                                    */
/* ------------------------------------------------------------------ */

export const ScrutinSummarySchema = z.object({
  uid: z.string().min(1),
  date: z.string().optional(),
  titre: z.string(),
  resultat: z.string().optional(),
});
export type ScrutinSummary = z.infer<typeof ScrutinSummarySchema>;

export const DeputeVoteSchema = z.object({
  scrutin: ScrutinSummarySchema,
  position: VotePositionSchema,
  provenance: ProvenanceSchema,
});
export type DeputeVote = z.infer<typeof DeputeVoteSchema>;

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */

export const SearchHitSchema = z.object({
  uid: z.string().min(1),
  type: z.enum(["depute", "scrutin", "groupe", "autre"]),
  label: z.string(),
  sublabel: z.string().optional(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

/* ------------------------------------------------------------------ */
/* API interne (backend → frontend)                                    */
/* ------------------------------------------------------------------ */

export const AboutSchema = z.object({
  live: z.boolean(),
  base: z.string(),
  note: z.string(),
});
export type About = z.infer<typeof AboutSchema>;

/** Réponses listes — pratiques pour la validation côté frontend. */
export const SearchHitListSchema = z.array(SearchHitSchema);
export const DeputeVoteListSchema = z.array(DeputeVoteSchema);
