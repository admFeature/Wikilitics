import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreIdentity,
  reconcile,
  similarity,
  normalizeLabel,
  type IdentityCandidate,
} from "./index.js";

test("normalizeLabel retire accents, casse et ponctuation", () => {
  assert.equal(normalizeLabel("Éloïse Durand-Fictif"), "eloise durand fictif");
});

test("similarity : identique = 1, vide vs vide = 1", () => {
  assert.equal(similarity("Durand", "Durand"), 1);
  assert.equal(similarity("", ""), 1);
  assert.ok(similarity("Durand", "Durant") > 0.8);
});

test("scoreIdentity rapproche un même nom orthographié différemment", () => {
  const a: IdentityCandidate = { source: "CIVIX", sourceUid: "1", prenom: "Camille", nom: "Durand" };
  const b: IdentityCandidate = { source: "POLIGRAPH", sourceUid: "x", prenom: "Camille", nom: "Durand" };
  assert.equal(scoreIdentity(a, b), 1);
});

test("scoreIdentity sépare deux homonymes de prénom différent", () => {
  const a: IdentityCandidate = { source: "CIVIX", sourceUid: "1", prenom: "Camille", nom: "Martin" };
  const b: IdentityCandidate = { source: "SENAT", sourceUid: "2", prenom: "Théo", nom: "Martin" };
  assert.ok(scoreIdentity(a, b) < 0.82);
});

test("reconcile regroupe les identités d'une même personne entre sources", () => {
  const candidates: IdentityCandidate[] = [
    { source: "CIVIX", sourceUid: "PA1", prenom: "Camille", nom: "Durand", circonscription: "Exemplie" },
    { source: "POLIGRAPH", sourceUid: "pg-9", prenom: "Camille", nom: "Durand", circonscription: "Exemplie" },
    { source: "SENAT", sourceUid: "s-3", prenom: "Awa", nom: "Sylla" },
  ];
  const clusters = reconcile(candidates);
  assert.equal(clusters.length, 2);

  const durand = clusters.find((c) => c.nom === "Durand");
  assert.ok(durand);
  assert.equal(durand?.members.length, 2);
  // Le fondateur a une confiance de 1.0 ; le rapproché une confiance élevée.
  assert.equal(durand?.members[0]?.confidence, 1.0);
  assert.ok((durand?.members[1]?.confidence ?? 0) >= 0.82);
});

test("reconcile : homonymes parfaits non désambiguïsés restent fusionnés (limite documentée)", () => {
  // Deux 'Jean Martin' sans circonscription → indistinguables : 1 seul cluster.
  const clusters = reconcile([
    { source: "CIVIX", sourceUid: "a", prenom: "Jean", nom: "Martin" },
    { source: "SENAT", sourceUid: "b", prenom: "Jean", nom: "Martin" },
  ]);
  assert.equal(clusters.length, 1);
});
