import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePartialArray, toDiscours, normName } from "./parse.js";

test("parsePartialArray ignore le dernier objet tronqué", () => {
  const truncated =
    '[\n {"titre":"A","url":"http://x/1"},\n {"titre":"B","url":"http://x/2"},\n {"titre":"tron';
  const objs = parsePartialArray(truncated);
  assert.equal(objs.length, 2);
  assert.equal((objs[0] as { titre: string }).titre, "A");
});

test("parsePartialArray gère accolades dans les chaînes", () => {
  const s = '[ {"titre":"a } b","url":"http://x/1"}, {"titre":"c","url":"http://x/2"} ]';
  assert.equal(parsePartialArray(s).length, 2);
});

test("toDiscours extrait titre, date, url, intervenants", () => {
  const d = toDiscours({
    titre: "  Déclaration X ",
    url: "https://www.vie-publique.fr/discours/1",
    prononciation: "2026-06-05",
    intervenants: [{ nom: "Gérald Darmanin" }, { nom: null }],
  });
  assert.ok(d);
  assert.equal(d?.titre, "Déclaration X");
  assert.equal(d?.date, "2026-06-05");
  assert.deepEqual(d?.intervenants, ["Gérald Darmanin"]);
});

test("toDiscours renvoie null sans titre ou url", () => {
  assert.equal(toDiscours({ titre: "x" }), null);
  assert.equal(toDiscours({ url: "http://x" }), null);
});

test("normName normalise", () => {
  assert.equal(normName("Gérald  DARMANIN"), "gerald darmanin");
});
