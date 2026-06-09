/**
 * Script de DIAGNOSTIC — `pnpm probe -- "Dupond"`.
 *
 * Interroge CIVIX en DIRECT (peu importe CIVIX_LIVE) et affiche, pour chaque
 * route, le statut, le content-type et le DÉBUT du corps BRUT. But : caler le
 * mapping (section NORMALISATION) sur des réponses réelles.
 *
 * Aucune normalisation ici : on veut voir la matière première.
 */
import { civixUrl } from "@app/connectors-civix";

// `pnpm probe -- "Dupond"` peut transmettre un "--" littéral en tête : on le
// saute pour récupérer le vrai terme de recherche.
const NAME = process.argv.slice(2).find((a) => a !== "--") ?? "Dupond";
const PREVIEW = 600;

interface ProbeTarget {
  label: string;
  url: string;
}

async function probeOne({ label, url }: ProbeTarget): Promise<void> {
  process.stdout.write(`\n=== ${label} ===\n${url}\n`);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const body = await res.text();
    const ct = res.headers.get("content-type") ?? "(absent)";
    process.stdout.write(`status        : ${res.status} ${res.statusText}\n`);
    process.stdout.write(`content-type  : ${ct}\n`);
    process.stdout.write(`taille corps  : ${body.length} octets\n`);
    process.stdout.write(`extrait corps :\n${body.slice(0, PREVIEW)}\n`);
    if (body.length > PREVIEW) process.stdout.write("… (tronqué)\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`ÉCHEC RÉSEAU  : ${msg}\n`);
  }
}

async function main(): Promise<void> {
  process.stdout.write(`Diagnostic CIVIX — terme de recherche : "${NAME}"\n`);

  // Routes de premier niveau (sans uid connu d'avance).
  const targets: ProbeTarget[] = [
    { label: "search", url: civixUrl.search(NAME) },
    { label: "deputes (liste)", url: civixUrl.deputes() },
    { label: "scrutins (liste)", url: civixUrl.scrutins(5) },
    { label: "groupes (liste)", url: civixUrl.groupes() },
  ];

  for (const t of targets) {
    await probeOne(t);
  }

  // Si la recherche renvoie un uid exploitable, on sonde aussi les routes par uid.
  try {
    const res = await fetch(civixUrl.search(NAME), { headers: { accept: "application/json" } });
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const data: unknown = await res.json();
      const uid = firstUid(data);
      if (uid) {
        process.stdout.write(`\n(uid détecté dans la recherche : ${uid})\n`);
        await probeOne({ label: "depute (détail)", url: civixUrl.depute(uid) });
      } else {
        process.stdout.write("\n(aucun uid détecté dans la recherche — voir extrait ci-dessus)\n");
      }
    }
  } catch {
    // Diagnostic best-effort : on n'interrompt pas.
  }
}

/** Tente d'extraire un premier identifiant d'un payload de recherche. */
function firstUid(data: unknown): string | undefined {
  // Forme réelle CIVIX : { results: { deputes: [...] } }. On reste tolérant.
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const results = (obj.results ?? obj.data) as Record<string, unknown> | unknown[] | undefined;
  const deputes =
    results && !Array.isArray(results)
      ? (results as Record<string, unknown>).deputes
      : undefined;
  const arr = Array.isArray(deputes)
    ? deputes
    : Array.isArray(results)
      ? results
      : Array.isArray(obj.items)
        ? obj.items
        : Array.isArray(data)
          ? data
          : undefined;
  if (!Array.isArray(arr)) return undefined;
  for (const item of arr) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      for (const key of ["acteur_uid", "uid", "id", "ref", "slug"]) {
        const v = obj[key];
        if (typeof v === "string" && v) return v;
        if (typeof v === "number") return String(v);
      }
    }
  }
  return undefined;
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
