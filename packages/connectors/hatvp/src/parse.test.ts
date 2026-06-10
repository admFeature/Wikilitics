import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListeCsv, isInteret, normName } from "./parse.js";

const CSV = [
  "civilite;prenom;nom;classement;type_mandat;qualite;type_document;departement;date_publication;date_depot;nom_fichier;url_dossier;open_data;statut_publication;id_origine;url_photo",
  "M.;Abdelkader;LAHMAR;x;depute;Député du Rhône;dia;69;;;;/pages_nominatives/lahmar-abdelkader-27452;;Livrée;;",
  "Mme;Agnès;CANAYER;x;senateur;Sénatrice;di;76;;;;/pages_nominatives/canayer-agnes;;Livrée;;",
  // ⛔ patrimoine : DOIT être exclu
  "M.;Jean;PATRIMOINE;x;depute;Député;dsp;75;;;;/pages_nominatives/jean-patrimoine;;Livrée;;",
  "M.;Paul;MODIF;x;gouvernement;Ministre;dspm;75;;;;/pages_nominatives/paul-modif;;Livrée;;",
].join("\n");

test("isInteret garde les intérêts, exclut le patrimoine", () => {
  assert.equal(isInteret("di"), true);
  assert.equal(isInteret("dia"), true);
  assert.equal(isInteret("dim"), true);
  assert.equal(isInteret("dsp"), false);
  assert.equal(isInteret("dspm"), false);
  assert.equal(isInteret("dspfm"), false);
});

test("parseListeCsv n'ingère JAMAIS le patrimoine", () => {
  const rows = parseListeCsv(CSV);
  const keys = rows.map((r) => r.key);
  assert.ok(keys.includes(normName("Abdelkader", "LAHMAR")));
  assert.ok(keys.includes(normName("Agnès", "CANAYER")));
  // Les déclarations patrimoniales sont absentes :
  assert.ok(!keys.includes(normName("Jean", "PATRIMOINE")));
  assert.ok(!keys.includes(normName("Paul", "MODIF")));
  assert.equal(rows.length, 2);
});

test("URL = page nominative HATVP absolue", () => {
  const rows = parseListeCsv(CSV);
  const lahmar = rows.find((r) => r.key === normName("Abdelkader", "LAHMAR"))!;
  assert.equal(lahmar.url, "https://www.hatvp.fr/pages_nominatives/lahmar-abdelkader-27452");
  assert.equal(lahmar.mandat, "depute");
});
