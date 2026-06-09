/**
 * @app/reconciliation — rapprochement d'identité entre sources.
 *
 * Problème : la même personne porte un identifiant différent dans chaque source
 * (CIVIX `acteur_uid`, PoliGraph `id`, …). On regroupe ces identités en
 * « clusters » correspondant à une seule personne, en attribuant à chaque
 * rapprochement un SCORE DE CONFIANCE (0..1) — stocké ensuite dans
 * `source_identity.confidence`.
 *
 * Toutes les fonctions de scoring sont pures et déterministes.
 */
import type { Source } from "@app/schema";
import { normalizeLabel, similarity } from "./normalize.js";

export { normalizeLabel, levenshtein, similarity } from "./normalize.js";

/** Candidat d'identité issu d'une source. */
export interface IdentityCandidate {
  source: Source;
  sourceUid: string;
  prenom: string;
  nom: string;
  circonscription?: string;
  groupeAbbr?: string;
}

/** Identité rattachée à un cluster, avec sa confiance de rapprochement. */
export interface ClusterMember extends IdentityCandidate {
  confidence: number;
}

/** Un cluster = une personne supposée unique, vue par ≥1 source. */
export interface IdentityCluster {
  /** Clé lisible et stable (nom normalisé). */
  key: string;
  prenom: string;
  nom: string;
  members: ClusterMember[];
}

/** Seuil de rapprochement par défaut (au-dessus = même personne). */
export const DEFAULT_MATCH_THRESHOLD = 0.82;

/**
 * Score de similarité 0..1 entre deux identités.
 * Le nom de famille pèse le plus ; prénom ensuite ; la circonscription et le
 * groupe servent de bonus de désambiguïsation (homonymes).
 */
export function scoreIdentity(a: IdentityCandidate, b: IdentityCandidate): number {
  const nom = similarity(a.nom, b.nom);
  const prenom = similarity(a.prenom, b.prenom);

  // Base pondérée nom/prénom.
  let score = nom * 0.6 + prenom * 0.4;

  // Bonus si la circonscription concorde (forte désambiguïsation).
  if (a.circonscription && b.circonscription) {
    const circ = similarity(a.circonscription, b.circonscription);
    score = score * 0.85 + circ * 0.15;
  }

  // Petit bonus si le sigle de groupe concorde exactement.
  if (
    a.groupeAbbr &&
    b.groupeAbbr &&
    normalizeLabel(a.groupeAbbr) === normalizeLabel(b.groupeAbbr)
  ) {
    score = Math.min(1, score + 0.03);
  }

  return Number(score.toFixed(4));
}

/**
 * Regroupe une liste de candidats en clusters d'identité.
 * Algorithme glouton : chaque candidat rejoint le meilleur cluster compatible
 * (score ≥ seuil), sinon il fonde un nouveau cluster.
 */
export function reconcile(
  candidates: readonly IdentityCandidate[],
  threshold: number = DEFAULT_MATCH_THRESHOLD,
): IdentityCluster[] {
  const clusters: IdentityCluster[] = [];

  for (const cand of candidates) {
    let best: { cluster: IdentityCluster; score: number } | undefined;

    for (const cluster of clusters) {
      // On compare au représentant (1er membre) du cluster.
      const rep = cluster.members[0]!;
      const score = scoreIdentity(rep, cand);
      if (score >= threshold && (!best || score > best.score)) {
        best = { cluster, score };
      }
    }

    if (best) {
      best.cluster.members.push({ ...cand, confidence: best.score });
    } else {
      clusters.push({
        key: normalizeLabel(`${cand.nom} ${cand.prenom}`),
        prenom: cand.prenom,
        nom: cand.nom,
        members: [{ ...cand, confidence: 1.0 }], // fondateur : identifiant direct
      });
    }
  }

  return clusters;
}

/**
 * Confiance à attribuer à `source_identity` pour un candidat donné dans son
 * cluster (1.0 si fondateur / identifiant direct).
 */
export function memberConfidence(member: ClusterMember): number {
  return member.confidence;
}
