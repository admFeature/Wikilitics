# Agrégateur de données politiques françaises — Phase 1 (MVP CIVIX)

Application web qui, **en contexte électoral**, permet de rechercher une
personnalité politique française et d'ouvrir une **fiche** agrégeant des
données publiques (votes Assemblée nationale via CIVIX). L'application
**n'émet aucune opinion ni score** : elle restitue des faits bruts, chacun
rattaché à sa **source officielle** (`Provenance`).

## Démarrage rapide

```bash
pnpm install
pnpm dev          # Next.js (UI + API) sur http://localhost:3000
```

- **Mode LIVE (par défaut)** : vrais députés de l'Assemblée via l'API CIVIX.
  L'annuaire complet (~600 députés) est **préchargé** au 1er appel puis filtré
  localement → **suggestions instantanées** dans la barre de recherche.
  *Limite CIVIX : pas de votes nominatifs → la liste de votes d'une fiche peut
  être vide (état vide honnête, jamais de vote inventé).*
- **Mode DÉMO (hors ligne)** : personnalités **fictives** (aucun réseau) :

  ```bash
  DEMO=1 pnpm dev
  ```

## Commandes

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Backend + frontend (vrais députés CIVIX par défaut). |
| `DEMO=1 pnpm dev` | Mode démo hors ligne (données fictives). |
| `pnpm dev:api` / `pnpm dev:web` | Lance un seul des deux. |
| `pnpm probe -- "Dupont"` | Diagnostic brut des routes CIVIX (statut, content-type, début du corps). |
| `pnpm typecheck` | Vérifie tout le monorepo en TypeScript strict. |

> En dev, Vite proxifie `/api` vers le backend : pas de CORS, et **le frontend
> ne parle jamais directement aux sources externes**.

## Arborescence

```
.
├── apps/
│   ├── web-next/            # ★ Next.js (App Router) : UI + API (route handlers) — DÉPLOYABLE
│   │   ├── app/{page.tsx, layout.tsx, api/…/route.ts}
│   │   └── components/ · lib/
│   └── etl/                 # (P3) ETL Assemblée → Postgres + script probe (diagnostic CIVIX)
│       └── src/{run-scrutins.ts, probe.ts}
├── packages/
│   ├── schema/              # types de domaine + schémas Zod partagés
│   ├── core/                # orchestration : ConnectorRegistry (partagé Next/Fastify)
│   ├── db/                  # (P2) Prisma : schéma Postgres + repository (optionnel)
│   ├── reconciliation/      # (P2) matching d'identité inter-sources + score de confiance
│   └── connectors/
│       ├── base/            # SourceConnector, Provenance, http robuste, helpers
│       ├── civix/           # connecteur CIVIX (Assemblée) ; mapping isolé
│       │   └── src/normalisation.ts   ← SEULE section NORMALISATION
│       ├── poligraph/       # (P2) connecteur PoliGraph (Sénat/ministres), même interface
│       └── assemblee/       # (P3) open data AN : parser + index votes nominatifs en mémoire
├── docker-compose.yml       # (P2) Postgres pour la persistance
└── prompt-projet-vscode.md
```

## Phase 2 — persistance, réconciliation, multi-sources

- **Recherche en autocomplétion** : la barre suggère les personnalités au fil de
  la frappe (combobox accessible, anti-rebond 250 ms) ; sélection → fiche.
- **Multi-sources** : la recherche agrège **CIVIX** (Assemblée) et **PoliGraph**
  (Sénat/ministres) via la même interface `SourceConnector`. L'uid exposé au
  frontend est préfixé par la source (`CIVIX:…`, `POLIGRAPH:…`) pour router le
  détail et les votes.
- **Réconciliation d'identité** (`packages/reconciliation`) : regroupe les
  identités d'une même personne entre sources, avec un **score de confiance**
  (Levenshtein normalisé + désambiguïsation par circonscription/groupe). Les
  résultats vus dans plusieurs sources sont annotés (« aussi dans … »).
- **Persistance Postgres/Prisma** (`packages/db`) : **optionnelle**. Sans
  `DATABASE_URL`, l'app tourne comme en phase 1. Avec une base, les clusters
  d'identité (`source_identity.confidence`) et les votes sont persistés
  (write-through). Chaque table de faits porte ses colonnes de **provenance**.
  HATVP **situation patrimoniale** : jamais stockée (`reutilisation_ok=false`,
  lien sortant uniquement).

### Activer la persistance — Supabase (recommandé) ou Docker

La persistance est **désactivée par défaut** : **aucun Docker n'est requis** pour
faire tourner l'app. Pour l'activer, il suffit de fournir une `DATABASE_URL`
Postgres — **Supabase** convient parfaitement (c'est du Postgres managé) :

```bash
# 1) Créer un projet Supabase, copier la « Connection string » (mode Session/URI)
cp .env.example .env
#    puis coller dans .env :  DATABASE_URL=postgresql://postgres:...@...supabase.com:5432/postgres
pnpm --filter @app/db db:generate          # client Prisma
pnpm --filter @app/db db:push              # crée le schéma dans Supabase
pnpm dev                                    # l'API détecte la base et persiste
```

`.env` est chargé automatiquement par l'API (via `dotenv`). Sans `DATABASE_URL`,
Prisma n'est **même pas chargé** ; l'app tourne en mode connecteur (phases 1).

> Alternative locale **optionnelle** (si tu préfères Docker à Supabase) :
> `docker compose up -d` démarre un Postgres sur `:5432`, puis même `db:push`.

### Tests

```bash
pnpm --filter @app/reconciliation test     # scoring + clustering d'identité
```

## API interne (backend → frontend)

```
GET /api/about                       -> { live, base, note }
GET /api/search?q=...                -> SearchHit[]
GET /api/deputes/:uid                -> DeputeDetail (404 si absent)
GET /api/deputes/:uid/votes?limit=8  -> DeputeVote[]
```

## Mapping CIVIX (calé sur réponses réelles via `probe`)

Tout le mapping des champs CIVIX est **isolé** dans
[`packages/connectors/civix/src/normalisation.ts`](packages/connectors/civix/src/normalisation.ts),
section `NORMALISATION`. Le diagnostic `pnpm probe` a permis de caler le mapping
sur les vraies réponses (schema_version CIVIX `2026-04-29`) :

- la recherche attend le paramètre **`search`** (et non `q`) ;
- formes réelles : `search → results.deputes[]`, `depute → data.deputy`,
  `scrutins → data.results[]`.

### ⚠ Limite réelle : pas de votes nominatifs côté CIVIX

L'endpoint `/scrutins/{uid}/votes` de CIVIX n'expose **que des décomptes
agrégés par groupe**, jamais le vote nominatif d'un·e député·e. Conformément au
principe **anti-désinformation**, on **n'invente pas** un vote individuel à
partir d'un agrégat : en mode LIVE, la liste de votes d'une fiche peut donc être
**vide** (état vide honnête). Le mécanisme d'extraction nominative reste en
place (`extractNominativeVotes`) et captera ces votes si CIVIX les expose un
jour. Le **mode DÉMO** illustre l'expérience complète avec des votes fictifs.

## Conformité légale

- **HATVP** : déclarations d'**intérêts/activités** = open data réutilisable ;
  déclarations de **situation patrimoniale** des parlementaires =
  **interdit de republier** → jamais ingérées (au mieux un lien sortant),
  champ `reutilisation_ok=false` prévu en phase 2.
- **Casier judiciaire** : non public → hors périmètre.
- **Légifrance** (décisions de justice) : anonymisées → non rattachables à une
  personne nommée. API via **PISTE** (OAuth2) — hors phase 1.
- **Mention de la source (licence) obligatoire** sur chaque donnée affichée.

## Stack

Node 20+ · TypeScript strict (ESM) · pnpm workspaces · Fastify + Zod · React +
Vite + TanStack Query · exécution dev sans build via **tsx**.

## Phase 3 — vrais votes nominatifs (ETL Assemblée nationale)

**Pourquoi** : CIVIX n'expose **pas** le sens de vote de chaque député (seulement
des décomptes par groupe). L'**open data de l'Assemblée nationale**, lui, publie
les **votes nominatifs**. On exploite ce jeu de données de deux façons.

### Par défaut : votes nominatifs EN MÉMOIRE (aucune base requise)

`@app/connectors-assemblee` télécharge une fois le jeu « Scrutins » de l'AN (mis
en cache disque), garde en mémoire les **N scrutins récents** (défaut 500) et un
index `acteurRef → votes`. Comme `acteurRef` est le **même identifiant `PA…` que
CIVIX**, l'API ressert les vrais votes sur chaque fiche **sans aucune base de
données**. Préchargé au démarrage → premier affichage rapide.

→ Donc `pnpm dev` (mode live) montre déjà les **vrais votes** des députés. Profondeur
réglable : `ASSEMBLEE_MAX_SCRUTINS=1000 pnpm dev`.

### À quoi sert Supabase alors ? (OPTIONNEL)

La base Postgres/Supabase sert à **persister** (réconciliation inter-sources,
historisation, montée en charge, déport serverless où l'on ne veut pas garder
500 scrutins en mémoire par invocation). Elle n'est **plus nécessaire** pour voir
les votes. Pour peupler la base :

```bash
DRY_RUN=1 pnpm etl:scrutins              # aperçu sans écrire (ex. votes d'Attal)
pnpm --filter @app/db db:push            # crée les tables (Supabase configuré)
pnpm etl:scrutins                        # ingère ~300 scrutins récents
ETL_MAX_SCRUTINS=800 pnpm etl:scrutins   # plus de profondeur
```

- Provenance : chaque vote pointe vers la page officielle du scrutin
  (`assemblee-nationale.fr/dyn/17/scrutins/<n>`), licence **Licence Ouverte 2.0**.
- **Planification** (ingestion DB) : simple script → **cron**, **GitHub Actions**
  ou **Vercel Cron** (pas de Redis). BullMQ/Redis reste une option facultative.
- Ordre de résolution des votes dans l'API : **mémoire (AN)** → base (si ETL) →
  connecteur.

## Application & déploiement (Next.js sur Vercel)

L'app déployable est **`apps/web-next`** (Next.js App Router) : elle contient
**à la fois** l'interface (React) et l'API (route handlers `app/api/*`), qui
réutilisent l'orchestration partagée `@app/core`. Un seul déploiement Vercel.

```bash
pnpm dev      # Next en dev (UI + API) sur http://localhost:3000
pnpm build    # next build
pnpm start    # serveur de production
```

### Déployer sur Vercel
1. Importer le repo dans Vercel.
2. **Root Directory = `apps/web-next`** (Vercel détecte Next.js et le monorepo
   pnpm ; l'install se fait à la racine de l'espace de travail).
3. Variables d'environnement (Project Settings → Environment Variables) :
   - rien n'est obligatoire : **CIVIX live + votes Assemblée en mémoire** marchent
     d'origine ;
   - `DATABASE_URL` (+ `DIRECT_URL`) Supabase **si** tu veux la persistance. Dans
     ce cas, ajoute une étape de build `pnpm --filter @app/db db:generate` et
     lance l'ETL pour peupler la base.

> Note serverless : l'index votes en mémoire se recharge à chaque *cold start*
> (téléchargement du zip AN, mis en cache `/tmp`). Pour un coût constant en prod,
> bascule les votes sur Supabase (ETL) ; l'API lit alors la base en priorité.

## Prochaines phases

- **Phase 2** ✅ : persistance Postgres/Prisma + réconciliation d'identité +
  connecteur PoliGraph (Sénat/ministres, même interface `SourceConnector`).
- **Phase 3** 🚧 : ETL **votes nominatifs Assemblée** ✅ (`apps/etl`). Restent :
  Sénat, HATVP, vie-publique, connecteur Légifrance/PISTE, et planification
  (cron/Actions, ou BullMQ optionnel).
