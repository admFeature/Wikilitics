import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeclarationInterets } from "./declaration.js";

const XML = `<?xml version="1.0"?><declaration>
  <activProfCinqDerniereDto><items><items>
    <description>Etat</description><employeur>Ministère</employeur>
    <dateDebut>09/2024</dateDebut><dateFin>12/2024</dateFin>
    <remuneration><montant>
      <montant><annee>2023</annee><montant>0</montant></montant>
      <montant><annee>2024</annee><montant>26234</montant></montant>
    </montant></remuneration>
  </items></items><neant>false</neant></activProfCinqDerniereDto>
  <participationFinanciereDto><items/><neant>true</neant></participationFinanciereDto>
  <activProfConjointDto><items><items><activiteProf>NEANT</activiteProf></items></items><neant>false</neant></activProfConjointDto>
</declaration>`;

test("ne garde que les rubriques avec contenu réel", () => {
  const rubriques = parseDeclarationInterets(XML);
  const labels = rubriques.map((r) => r.label);
  // financiere (néant) et conjoint (item « NEANT ») exclues :
  assert.deepEqual(labels, ["Activités professionnelles (5 dernières années)"]);
});

test("extrait période et dernière rémunération non nulle", () => {
  const [r] = parseDeclarationInterets(XML);
  const item = r!.items[0]!;
  assert.equal(item.periode, "09/2024 – 12/2024");
  assert.match(item.remuneration ?? "", /26234.*2024/);
});

test("XML invalide → []", () => {
  assert.deepEqual(parseDeclarationInterets("<x>"), []);
});
