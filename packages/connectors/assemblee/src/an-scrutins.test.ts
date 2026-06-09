import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScrutin } from "./an-scrutins.js";

// Fixture minimale reproduisant la structure réelle de l'open data AN.
const FIXTURE = {
  scrutin: {
    uid: "VTANR5L17V999",
    numero: "999",
    dateScrutin: "2026-06-04",
    titre: "scrutin de test",
    sort: { code: "adopté", libelle: "adopté" },
    ventilationVotes: {
      organe: {
        groupes: {
          groupe: [
            {
              vote: {
                decompteNominatif: {
                  pours: { votant: [{ acteurRef: "PA1" }, { acteurRef: "PA2" }] },
                  contres: { votant: { acteurRef: "PA3" } }, // votant unique (objet)
                  abstentions: "", // bloc vide
                  nonVotants: { votant: [{ acteurRef: "PA4" }] },
                },
              },
            },
          ],
        },
      },
    },
  },
};

test("parseScrutin extrait l'en-tête du scrutin", () => {
  const p = parseScrutin(FIXTURE);
  assert.ok(p);
  assert.equal(p?.uid, "VTANR5L17V999");
  assert.equal(p?.numero, 999);
  assert.equal(p?.date, "2026-06-04");
  assert.equal(p?.resultat, "adopté");
});

test("parseScrutin mappe positions et gère votant objet/tableau/vide", () => {
  const p = parseScrutin(FIXTURE)!;
  const byUid = Object.fromEntries(p.votes.map((v) => [v.acteurRef, v.position]));
  assert.deepEqual(byUid, {
    PA1: "pour",
    PA2: "pour",
    PA3: "contre", // objet unique géré
    PA4: "nonVotant",
  });
  assert.equal(p.votes.length, 4); // abstentions vide ignoré
});

test("parseScrutin renvoie null sans scrutin", () => {
  assert.equal(parseScrutin({}), null);
  assert.equal(parseScrutin(null), null);
});
