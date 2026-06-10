import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGouvernement, splitName, slugify } from "./parse.js";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Gouvernements>
  <Gouvernement date="20140402">
    <description>Gouvernement de M. Manuel VALLS</description>
    <Ministere id="x"><Nom>Premier ministre</Nom>
      <Ministre><Fonction>Premier ministre</Fonction><Signataire>Manuel VALLS</Signataire></Ministre>
    </Ministere>
  </Gouvernement>
  <Gouvernement date="20260226">
    <description>Gouvernement de Monsieur Sébastien LECORNU</description>
    <President><Signataire>EMMANUEL MACRON</Signataire></President>
    <Ministere id="prm"><Nom>Premier ministre</Nom>
      <Ministre><Fonction>Premier ministre</Fonction><Signataire>Sébastien LECORNU</Signataire></Ministre>
    </Ministere>
    <Ministere id="int"><Nom>ministère de l&apos;intérieur</Nom>
      <Ministre><Fonction>Ministre de l&apos;intérieur<?Pub _newline?> et des outre-mer</Fonction><Signataire>Laurent NUNEZ</Signataire></Ministre>
    </Ministere>
  </Gouvernement>
</Gouvernements>`;

test("parseGouvernement prend le gouvernement le plus récent", () => {
  const g = parseGouvernement(XML)!;
  assert.equal(g.date, "20260226");
  assert.match(g.description, /LECORNU/);
});

test("extrait les ministres (président exclu) avec entités + PI nettoyés", () => {
  const g = parseGouvernement(XML)!;
  const slugs = g.ministres.map((m) => m.slug);
  assert.deepEqual(slugs, ["sebastien-lecornu", "laurent-nunez"]); // pas MACRON (président)
  const nunez = g.ministres.find((m) => m.slug === "laurent-nunez")!;
  assert.equal(nunez.prenom, "Laurent");
  assert.equal(nunez.nom, "Nunez");
  assert.equal(nunez.fonction, "Ministre de l'intérieur et des outre-mer");
  assert.equal(nunez.ministere, "ministère de l'intérieur");
});

test("splitName gère prénom composé et nom en capitales", () => {
  assert.deepEqual(splitName("Jean-Pierre FARANDOU"), { prenom: "Jean-Pierre", nom: "Farandou" });
  assert.deepEqual(splitName("Sébastien LECORNU"), { prenom: "Sébastien", nom: "Lecornu" });
  assert.deepEqual(splitName("EMMANUEL MACRON"), { prenom: "Emmanuel", nom: "Macron" });
});

test("slugify normalise", () => {
  assert.equal(slugify("Sébastien", "Lecornu"), "sebastien-lecornu");
});
