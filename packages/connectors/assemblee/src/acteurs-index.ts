/**
 * Index EN MÉMOIRE des acteurs de l'Assemblée nationale (open data AMO10).
 *
 * Enrichit les fiches députés : profession, naissance, et appartenance au
 * Gouvernement (mandat GOUVERNEMENT en cours). Données réelles, tracées.
 *
 * NB : l'open data AN ne contient QUE les ministres qui sont aussi députés
 * (les ministres non-députés ne sont pas des « acteurs » AN). La liste complète
 * du Gouvernement viendra d'une autre source (vie-publique / data.gouv).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ZIP_URL =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip";
const CACHE_FILE = join(tmpdir(), "wikilitic-an-amo10.json.zip");

export interface ActeurDetail {
  profession?: string;
  dateNaissance?: string; // JJ/MM/AAAA
  lieuNaissance?: string; // "Ville (Département)"
  membreGouvernement?: boolean;
  roleGouvernement?: string;
}

/* --- helpers défensifs (mêmes principes que le parser scrutins) --- */
function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}
function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === "") return [];
  return [v];
}
/** Un uid AN est `{ "#text": "PA123" }` (ou directement une string). */
function textId(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  return str(asRecord(v)?.["#text"]);
}
function frDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Parse un fichier acteur AMO en (uid, détail). Pur. */
export function parseActeur(json: unknown): { uid: string; detail: ActeurDetail } | null {
  const acteur = asRecord(asRecord(json)?.["acteur"]) ?? asRecord(json);
  if (!acteur) return null;
  const uid = textId(acteur["uid"]);
  if (!uid) return null;

  const naiss = asRecord(asRecord(acteur["etatCivil"])?.["infoNaissance"]);
  const ville = str(naiss?.["villeNais"]);
  const dep = str(naiss?.["depNais"]);
  const lieu = ville ? (dep ? `${ville} (${dep})` : ville) : undefined;

  // Appartenance au Gouvernement : mandat GOUVERNEMENT en cours (dateFin null).
  let membreGouvernement = false;
  let roleGouvernement: string | undefined;
  for (const mRaw of arr(asRecord(acteur["mandats"])?.["mandat"])) {
    const m = asRecord(mRaw);
    if (!m) continue;
    if (m["typeOrgane"] === "GOUVERNEMENT" && (m["dateFin"] === null || m["dateFin"] === undefined)) {
      membreGouvernement = true;
      roleGouvernement = str(asRecord(m["infosQualite"])?.["libQualite"]) ?? roleGouvernement;
    }
  }

  const detail: ActeurDetail = {
    ...(str(asRecord(acteur["profession"])?.["libelleCourant"]) && {
      profession: str(asRecord(acteur["profession"])?.["libelleCourant"]),
    }),
    ...(frDate(str(naiss?.["dateNais"])) && { dateNaissance: frDate(str(naiss?.["dateNais"])) }),
    ...(lieu && { lieuNaissance: lieu }),
    ...(membreGouvernement && { membreGouvernement: true }),
    ...(membreGouvernement && roleGouvernement && roleGouvernement !== "membre"
      ? { roleGouvernement }
      : {}),
  };
  return { uid, detail };
}

export class AssembleeActeursIndex {
  private ready: Promise<void> | null = null;
  private byUid = new Map<string, ActeurDetail>();

  load(): Promise<void> {
    if (!this.ready) this.ready = this.build();
    return this.ready;
  }

  get size(): number {
    return this.byUid.size;
  }

  getDetail(uid: string): ActeurDetail | undefined {
    return this.byUid.get(uid);
  }

  private async loadZipBuffer(): Promise<Buffer> {
    const override = process.env.AN_AMO_ZIP_PATH;
    if (override && existsSync(override)) return readFileSync(override);
    if (existsSync(CACHE_FILE)) {
      try {
        return readFileSync(CACHE_FILE);
      } catch {
        /* cache illisible : on retélécharge */
      }
    }
    const res = await fetch(ZIP_URL);
    if (!res.ok) throw new Error(`Téléchargement acteurs AN échoué : HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      writeFileSync(CACHE_FILE, buf);
    } catch {
      /* cache non écrit : pas bloquant */
    }
    return buf;
  }

  private async build(): Promise<void> {
    const { default: AdmZip } = await import("adm-zip");
    const zip = new AdmZip(await this.loadZipBuffer());
    const byUid = new Map<string, ActeurDetail>();
    for (const e of zip.getEntries()) {
      if (!/\/acteur\/.*\.json$/.test(e.entryName)) continue;
      try {
        const parsed = parseActeur(JSON.parse(e.getData().toString("utf8")));
        if (parsed) byUid.set(parsed.uid, parsed.detail);
      } catch {
        /* fichier isolé illisible : on continue */
      }
    }
    this.byUid = byUid;
  }
}
