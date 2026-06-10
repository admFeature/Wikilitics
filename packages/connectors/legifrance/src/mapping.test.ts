import { test } from "node:test";
import assert from "node:assert/strict";
import { mapResult, cleanTitle, legifranceUrl } from "./mapping.js";

test("cleanTitle retire les <mark> et normalise", () => {
  assert.equal(cleanTitle("prime de <mark>transition</mark>  énergétique"), "prime de transition énergétique");
});

test("legifranceUrl choisit jorf/loda selon l'identifiant", () => {
  assert.equal(legifranceUrl("JORFTEXT000053569113", undefined, "x"), "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053569113");
  assert.equal(legifranceUrl(undefined, "LEGITEXT000053605445", "x"), "https://www.legifrance.gouv.fr/loda/id/LEGITEXT000053605445");
  assert.match(legifranceUrl(undefined, undefined, "ma loi"), /search\/all\?query=ma%20loi/);
});

test("mapResult mappe un résultat réel", () => {
  const raw = {
    titles: [
      {
        id: "LEGITEXT000053605445_26-02-2026",
        cid: "JORFTEXT000053569113",
        title: "Arrêté du 20 février 2026 relatif à la prime de <mark>transition</mark>",
      },
    ],
    nature: "ARRETE",
    etat: "VIGUEUR",
    date: "2026-02-26T00:00:00.000+0000",
  };
  const t = mapResult(raw)!;
  assert.equal(t.titre, "Arrêté du 20 février 2026 relatif à la prime de transition");
  assert.equal(t.nature, "ARRETE");
  assert.equal(t.etat, "VIGUEUR");
  assert.equal(t.date, "2026-02-26");
  assert.equal(t.url, "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053569113");
});

test("mapResult renvoie null sans titre", () => {
  assert.equal(mapResult({ titles: [] }), null);
  assert.equal(mapResult(null), null);
});
