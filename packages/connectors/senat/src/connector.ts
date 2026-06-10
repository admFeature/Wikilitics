/**
 * Connecteur Sénat — sénateurs en exercice (open data data.senat.fr).
 *
 * Charge une fois l'annuaire des sénateurs actifs (API JSON du Sénat), le garde
 * en mémoire (cache /tmp) et l'expose via l'interface SourceConnector
 * (recherche / fiche). Données réelles, tracées (Licence Ouverte).
 *
 * NB : les votes nominatifs du Sénat relèvent d'un autre jeu de données
 * (scrutins) → non couverts ici pour l'instant (getRecentVotesForDepute = []).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeProvenance, type SourceConnector } from "@app/connectors-base";
import type { DeputeDetail, DeputeVote, SearchHit } from "@app/schema";

const API_URL = "https://www.senat.fr/api-senat/senateurs.json";
const BASE = "https://www.senat.fr";
const LICENCE = "Licence Ouverte 2.0";
const CACHE_FILE = join(tmpdir(), "wikilitic-senateurs.json");

interface RawSenateur {
  matricule?: string;
  nom?: string;
  prenom?: string;
  url?: string;
  groupe?: { libelle?: string; libelleCourt?: string; code?: string } | null;
  circonscription?: { libelle?: string } | null;
  categorieProfessionnelle?: { libelle?: string } | null;
}

interface Senateur {
  matricule: string;
  prenom: string;
  nom: string;
  groupe?: string;
  groupeAbbr?: string;
  circonscription?: string;
  profession?: string;
  url?: string;
  haystack: string;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export class SenatConnector implements SourceConnector {
  readonly source = "SENAT" as const;
  readonly isLive = true;

  private ready: Promise<void> | null = null;
  private senateurs: Senateur[] = [];
  private byId = new Map<string, Senateur>();

  private load(): Promise<void> {
    if (!this.ready) this.ready = this.build();
    return this.ready;
  }

  async search(query: string): Promise<SearchHit[]> {
    await this.load();
    const q = normalize(query.trim());
    if (q === "") return [];
    return this.senateurs
      .filter((s) => s.haystack.includes(q))
      .slice(0, 12)
      .map((s) => ({
        uid: s.matricule,
        type: "depute" as const,
        label: `${s.prenom} ${s.nom}`.trim(),
        sublabel: [s.groupeAbbr ?? s.groupe, s.circonscription].filter(Boolean).join(" · "),
      }));
  }

  async getDepute(uid: string): Promise<DeputeDetail | null> {
    await this.load();
    const s = this.byId.get(uid);
    if (!s) return null;
    const sourceUrl = s.url ? `${BASE}${s.url}` : `${BASE}/`;
    return {
      uid: s.matricule,
      prenom: s.prenom,
      nom: s.nom,
      ...(s.groupe ? { groupe: s.groupe } : {}),
      ...(s.groupeAbbr ? { groupeAbbr: s.groupeAbbr } : {}),
      ...(s.circonscription ? { circonscription: `${s.circonscription} (Sénat)` } : {}),
      ...(s.profession ? { profession: s.profession } : {}),
      provenance: makeProvenance("SENAT", sourceUrl, LICENCE),
    };
  }

  async getRecentVotesForDepute(): Promise<DeputeVote[]> {
    return []; // votes nominatifs Sénat = jeu de données distinct (à venir).
  }

  /* --- chargement --- */

  private async build(): Promise<void> {
    const raw = await this.loadJson();
    const list = Array.isArray(raw) ? (raw as RawSenateur[]) : [];
    const senateurs: Senateur[] = [];
    for (const r of list) {
      const matricule = typeof r.matricule === "string" ? r.matricule : "";
      if (matricule === "") continue;
      const prenom = r.prenom ?? "";
      const nom = r.nom ?? "";
      const groupe = r.groupe?.libelle ?? undefined;
      const groupeAbbr = r.groupe?.libelleCourt ?? r.groupe?.code ?? undefined;
      const circonscription = r.circonscription?.libelle ?? undefined;
      const profession = r.categorieProfessionnelle?.libelle ?? undefined;
      senateurs.push({
        matricule,
        prenom,
        nom,
        groupe,
        groupeAbbr,
        circonscription,
        profession,
        ...(typeof r.url === "string" ? { url: r.url } : {}),
        haystack: normalize(`${prenom} ${nom} ${groupeAbbr ?? ""}`),
      });
    }
    this.senateurs = senateurs;
    this.byId = new Map(senateurs.map((s) => [s.matricule, s]));
  }

  private async loadJson(): Promise<unknown> {
    const override = process.env.SENAT_JSON_PATH;
    if (override && existsSync(override)) return JSON.parse(readFileSync(override, "utf8"));
    if (existsSync(CACHE_FILE)) {
      try {
        return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
      } catch {
        /* cache illisible : on retélécharge */
      }
    }
    const res = await fetch(API_URL, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Téléchargement sénateurs échoué : HTTP ${res.status}`);
    const text = await res.text();
    try {
      writeFileSync(CACHE_FILE, text);
    } catch {
      /* cache non écrit : pas bloquant */
    }
    return JSON.parse(text);
  }
}

export function createSenatConnector(): SourceConnector {
  return new SenatConnector();
}
