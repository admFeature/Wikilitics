/**
 * ETL — Scrutins de l'Assemblée nationale (votes NOMINATIFS) → Postgres.
 *
 * Pourquoi : CIVIX n'expose pas le sens de vote de chaque député. L'open data
 * de l'AN, si. On ingère les N scrutins les plus récents (votes nominatifs),
 * et l'API les ressert sur les fiches (jointure par `acteurRef` = uid CIVIX).
 *
 * Usage :
 *   # nécessite DATABASE_URL (Supabase ou Postgres local) dans .env
 *   pnpm --filter @app/etl etl:scrutins
 *   ETL_MAX_SCRUTINS=500 pnpm --filter @app/etl etl:scrutins   # plus de profondeur
 *   AN_ZIP_PATH=/chemin/Scrutins.json.zip pnpm ...              # zip déjà téléchargé
 */
import "./load-env.js"; // charge le .env racine (doit rester le 1er import)
import { readFileSync } from "node:fs";
import AdmZip from "adm-zip";
import { isDbConfigured, Repository } from "@app/db";
import { fetchAllCivixDeputes } from "@app/connectors-civix";
import type { Provenance } from "@app/schema";
import { parseScrutin, scrutinSourceUrl, type ParsedScrutin } from "@app/connectors-assemblee";

const ZIP_URL =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip";
const LICENCE = "Licence Ouverte 2.0";
const MAX_SCRUTINS = Number(process.env.ETL_MAX_SCRUTINS ?? 300);

function log(msg: string): void {
  process.stdout.write(`[etl] ${msg}\n`);
}

/** Récupère le contenu du zip (local si AN_ZIP_PATH, sinon téléchargement). */
async function loadZip(): Promise<Buffer> {
  const local = process.env.AN_ZIP_PATH;
  if (local) {
    log(`lecture du zip local ${local}`);
    return readFileSync(local);
  }
  log(`téléchargement ${ZIP_URL}`);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Téléchargement échoué : HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Numéro de scrutin extrait du nom de fichier (VTANR5L17V<numero>.json). */
function numeroFromName(name: string): number {
  const m = /V(\d+)\.json$/.exec(name);
  return m ? Number(m[1]) : 0;
}

const DRY_RUN = process.env.DRY_RUN === "1";
const PROBE_UID = process.env.ETL_PROBE_UID ?? "PA722190"; // Gabriel Attal

async function main(): Promise<void> {
  if (!isDbConfigured() && !DRY_RUN) {
    log("ERREUR : DATABASE_URL absent. Configure une base (Supabase) dans .env,");
    log("ou lance en simulation : DRY_RUN=1 pnpm --filter @app/etl etl:scrutins");
    process.exit(1);
  }

  const zipBuf = await loadZip();
  const zip = new AdmZip(zipBuf);
  const entries = zip
    .getEntries()
    .filter((e) => /VTANR.*\.json$/.test(e.entryName))
    .sort((a, b) => numeroFromName(b.entryName) - numeroFromName(a.entryName))
    .slice(0, MAX_SCRUTINS);
  log(`${entries.length} scrutins les plus récents sélectionnés (sur le jeu complet)`);

  // Parse.
  const scrutins: ParsedScrutin[] = [];
  for (const e of entries) {
    try {
      const parsed = parseScrutin(JSON.parse(e.getData().toString("utf8")));
      if (parsed && parsed.votes.length > 0) scrutins.push(parsed);
    } catch {
      // fichier isolé illisible : on continue.
    }
  }
  const totalVotes = scrutins.reduce((n, s) => n + s.votes.length, 0);
  log(`${scrutins.length} scrutins parsés, ${totalVotes} votes nominatifs`);

  // Noms des députés via l'annuaire CIVIX (PA uid → prénom/nom).
  log("récupération de l'annuaire CIVIX pour les noms…");
  const names = new Map<string, { prenom: string; nom: string }>();
  try {
    for (const d of await fetchAllCivixDeputes()) {
      names.set(d.uid, { prenom: d.prenom, nom: d.nom });
    }
    log(`${names.size} députés connus par nom`);
  } catch {
    log("annuaire CIVIX indisponible : noms par défaut.");
  }

  // --- Mode SIMULATION : on n'écrit rien, on montre ce qui serait ingéré. ---
  if (DRY_RUN) {
    const probe = names.get(PROBE_UID);
    const label = probe ? `${probe.prenom} ${probe.nom}` : PROBE_UID;
    const votes = scrutins
      .map((s) => {
        const v = s.votes.find((x) => x.acteurRef === PROBE_UID);
        return v ? { titre: s.titre, date: s.date, resultat: s.resultat, position: v.position } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    log(`SIMULATION (aucune écriture). Derniers votes de ${label} (${PROBE_UID}) :`);
    for (const v of votes.slice(0, 8)) {
      log(`  • [${v.position.toUpperCase()}] ${v.date} — ${v.titre.slice(0, 70)} (${v.resultat})`);
    }
    log(`(${votes.length} votes trouvés pour cette personne sur ${scrutins.length} scrutins)`);
    log("Pour ingérer réellement : renseigne DATABASE_URL (Supabase) puis relance sans DRY_RUN.");
    process.exit(0);
  }

  const repo = new Repository();

  // 1) Personnalités (acteurs uniques).
  const uniqueActeurs = [...new Set(scrutins.flatMap((s) => s.votes.map((v) => v.acteurRef)))];
  const people = uniqueActeurs.map((uid) => ({
    sourceUid: uid,
    prenom: names.get(uid)?.prenom ?? "",
    nom: names.get(uid)?.nom ?? uid,
  }));
  log(`résolution de ${people.length} personnalités…`);
  const personMap = await repo.bulkResolvePersonnalites("ASSEMBLEE", people);

  // 2) Scrutins.
  log(`upsert de ${scrutins.length} scrutins…`);
  const scrutinInputs = scrutins.map((s) => {
    const prov: Provenance = {
      source: "ASSEMBLEE",
      sourceUrl: scrutinSourceUrl(s.numero),
      collectedAt: new Date().toISOString(),
      licence: LICENCE,
    };
    return { sourceUid: s.uid, titre: s.titre, date: s.date, resultat: s.resultat, prov };
  });
  const scrutinMap = await repo.bulkUpsertScrutins("ASSEMBLEE", scrutinInputs);

  // 3) Votes.
  const voteRows = [];
  for (const s of scrutins) {
    const scrutinId = scrutinMap.get(s.uid);
    if (!scrutinId) continue;
    const prov: Provenance = {
      source: "ASSEMBLEE",
      sourceUrl: scrutinSourceUrl(s.numero),
      collectedAt: new Date().toISOString(),
      licence: LICENCE,
    };
    for (const v of s.votes) {
      const personnaliteId = personMap.get(v.acteurRef);
      if (personnaliteId) {
        voteRows.push({ personnaliteId, scrutinId, position: v.position, prov });
      }
    }
  }
  log(`insertion de ${voteRows.length} votes…`);
  const inserted = await repo.bulkInsertVotes(voteRows);
  log(`terminé : ${inserted} votes insérés (doublons ignorés).`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[etl] échec : ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
