# Prompt projet — Agrégateur de données politiques françaises (à coller dans VSCode)

> Copie tout ce qui suit dans ton assistant (Claude Code, Cursor, Copilot Chat…).
> Il est autonome : aucune connaissance extérieure n'est nécessaire.

---

## Rôle

Tu es un·e développeur·se senior TypeScript/Node.js. Construis l'application décrite ci-dessous, en respectant **scrupuleusement** les contraintes, l'ordre des phases et les critères d'acceptation. Pose une question seulement si une information bloquante manque ; sinon, applique les choix par défaut indiqués.

## Contexte produit

Application web qui, **en contexte électoral**, permet de **rechercher une personnalité politique française** et d'ouvrir une **fiche** agrégeant des données publiques : ses derniers votes, ses mandats, et à terme ses déclarations d'intérêts, discours et textes liés. L'application n'émet **aucune opinion ni score** : elle restitue des faits bruts, chacun rattaché à sa source officielle.

## Principes non négociables

1. **Traçabilité.** Chaque fait affiché porte sa source, son URL d'origine et sa date de collecte. Modélise ça dès le départ (objet `Provenance` attaché à chaque donnée).
2. **Neutralité.** Aucune note, aucun « bilan », aucune qualification générée par l'app.
3. **Conformité légale par source** (voir section dédiée) — en particulier ne **jamais** ingérer ni republier les déclarations de **situation patrimoniale** HATVP des parlementaires.
4. **Anti-désinformation.** Les données de démonstration/tests utilisent des noms **fictifs** : ne jamais inventer un vote attribué à une personne réelle.

## Stack imposée

- Node.js 20+, TypeScript strict, ESM (`"type": "module"`).
- Backend : **Fastify**. Validation des entrées/sorties externes : **Zod**.
- Frontend : **React + Vite + TypeScript**, avec **TanStack Query** pour les appels.
- En dev, Vite proxifie `/api` vers le backend (évite tout problème de CORS ; le frontend ne parle JAMAIS directement aux sources externes).
- Persistance (phase 2) : **PostgreSQL + Prisma**. Jobs planifiés (phase 3) : **BullMQ + Redis**.
- Gestionnaire de paquets : **pnpm**, en monorepo (workspaces).
- Exécution dev sans étape de build : **tsx**.

## Architecture cible

Pattern **connecteur** : un adaptateur par source externe, implémentant une interface commune et renvoyant des objets **normalisés** vers une entité unique `Personnalite`. Deux modes d'ingestion :

- **LIVE** (API REST interrogeable par personne) : CIVIX, PoliGraph, Légifrance. Appel à la demande + cache.
- **BATCH/ETL** (jeux de données en masse à ingérer) : data.assemblee-nationale.fr, data.senat.fr, hatvp.fr/open-data, vie-publique.fr/discours.

Point crucial : **4 des sources ne sont pas des API par personne**, ce sont des fichiers à ingérer. La couche « live » repose surtout sur CIVIX (Assemblée) et PoliGraph (Assemblée + Sénat + ministres).

### Arborescence

```
.
├── apps/
│   ├── api/                 # Fastify : endpoints internes + orchestration
│   └── web/                 # React + Vite
├── packages/
│   ├── schema/              # types de domaine + schémas Zod partagés
│   ├── connectors/
│   │   ├── base/            # interface SourceConnector, Provenance, helpers
│   │   └── civix/           # 1er connecteur (phase 1)
│   └── reconciliation/      # matching d'identité (phase 2)
```

## Modèle de domaine (types partagés, `packages/schema`)

```ts
type VotePosition = "pour" | "contre" | "abstention" | "nonVotant";

interface Provenance {
  source: "CIVIX" | "POLIGRAPH" | "LEGIFRANCE" | "ASSEMBLEE" | "SENAT" | "HATVP" | "VIE_PUBLIQUE";
  sourceUrl: string;     // URL exacte de la donnée
  collectedAt: string;   // ISO 8601
  licence: string;       // ex: "Licence Ouverte 2.0", "ODbL"
}

interface DeputeSummary {
  uid: string; nom: string; prenom: string;
  groupe?: string; groupeAbbr?: string; circonscription?: string;
}
interface DeputeDetail extends DeputeSummary { profession?: string; provenance: Provenance; }

interface ScrutinSummary { uid: string; date?: string; titre: string; resultat?: string; }
interface DeputeVote { scrutin: ScrutinSummary; position: VotePosition; provenance: Provenance; }

interface SearchHit { uid: string; type: "depute" | "scrutin" | "groupe" | "autre"; label: string; sublabel?: string; }
```

Schéma Postgres (phase 2) : tables `personnalite`, `source_identity` (mapping personne ↔ identifiant de chaque source, avec score de confiance), `mandat`, `scrutin`, `vote`, `declaration_hatvp` (avec un champ booléen `reutilisation_ok`), `discours`, `texte_legal`. Chaque table de faits porte des colonnes de provenance (`source`, `source_url`, `collected_at`, `licence`).

## Source de la phase 1 : API CIVIX

API publique REST en lecture seule (votes de l'Assemblée nationale), sans authentification, « usage raisonnable ». Base : `https://www.civix.fr`, routes sous `/api/v1`. **Routes confirmées :**

```
GET /api/v1/search                       # recherche publique
GET /api/v1/deputes                       # liste
GET /api/v1/deputes/{uid}                 # détail député
GET /api/v1/scrutins                      # liste des scrutins
GET /api/v1/scrutins/{uid}                # détail scrutin
GET /api/v1/scrutins/{uid}/votes          # votes d'un scrutin
GET /api/v1/groupes        GET /api/v1/groupes/{abbr}
```

**Détail de conception capital :** il n'existe **pas** de route `/deputes/{uid}/votes`. Les votes sont rangés **par scrutin**. Pour « les derniers votes d'un·e député·e », récupère les N derniers scrutins puis extrais la position de la personne dans chacun (`getRecentVotesForDepute`), avec une concurrence limitée (≈4 appels parallèles) et un cache.

**Inconnue à gérer proprement :** les **noms de champs exacts** des réponses CIVIX ne sont pas garantis. Implémente la normalisation de façon **défensive** : une fonction `pick(obj, ...keys)` qui teste plusieurs clés probables (ex. `nom`/`lastName`, `prenom`/`firstName`, `titre`/`objet`/`libelle`, `position`/`vote`), et une fonction `asArray(payload)` qui gère un tableau nu **ou** enveloppé (`results`/`data`/`items`). Centralise tout le mapping dans **un seul fichier** (`packages/connectors/civix`), section `NORMALISATION`, facile à resserrer.

**Robustesse réseau obligatoire :** dans le client HTTP, après `fetch`, vérifie le `content-type` ; si ce n'est pas du JSON (cas fréquent : une SPA qui renvoie du HTML en 200), lève une erreur explicite contenant l'URL, le statut et les 200 premiers caractères du corps. Idem pour les statuts non-2xx. Les erreurs doivent être **lisibles**, jamais opaques.

**Script de diagnostic :** fournis un script `pnpm probe -- "Dupond"` qui interroge CIVIX en direct et affiche, pour chaque route, le statut, le `content-type` et le début du corps brut — pour caler le mapping sur des réponses réelles.

## API interne (backend → frontend)

```
GET /api/about                       -> { live: boolean, base: string, note: string }
GET /api/search?q=...                -> SearchHit[]
GET /api/deputes/:uid                -> DeputeDetail (404 si absent)
GET /api/deputes/:uid/votes?limit=8  -> DeputeVote[]
```

Le frontend n'appelle **que** cette API interne.

## Frontend (exigences UX)

- Champ de recherche → liste de résultats (députés) → clic → **fiche**.
- Fiche : en-tête (prénom, nom, groupe, circonscription) + section **« Derniers votes »** : pour chaque vote, une **pastille de position** colorée selon les conventions de l'hémicycle (Pour = vert, Contre = rouge, Abstention = gris, Non votant = gris clair), le titre + la date du scrutin, et un **lien vers la source** (provenance).
- Bannière indiquant le mode (démo / live).
- États vides et erreurs explicites, jamais un écran muet. Accessibilité de base : focus clavier visible, responsive mobile, `prefers-reduced-motion` respecté.
- Mode **démo** (par défaut, sans réseau) avec 2–3 personnalités **fictives**, et mode **live** activé par `CIVIX_LIVE=1`.

## Conformité légale (à implémenter ou commenter dans le code)

- HATVP **intérêts/activités** = open data réutilisable ; HATVP **situation patrimoniale** des parlementaires = **interdit de republier** (sanction pénale) → ne pas ingérer, au mieux un lien sortant. Champ `reutilisation_ok=false`.
- Casier judiciaire = **non public** → hors périmètre. Décisions de justice via Légifrance = **anonymisées** → non rattachables à une personne nommée.
- Légifrance = API via la plateforme **PISTE** (OAuth2 client-credentials, inscription gratuite). Hors phase 1.
- Mention de la source (licence) obligatoire sur chaque donnée.

## Plan de livraison (respecte cet ordre)

- **Phase 1 — MVP CIVIX (objectif immédiat) :** monorepo + `packages/schema` + connecteur CIVIX (live + démo) + API interne + frontend recherche/fiche/derniers votes + script `probe`. L'app doit **tourner** (`pnpm dev`) en démo hors ligne, et en live avec `CIVIX_LIVE=1`.
- **Phase 2 :** persistance Postgres/Prisma + réconciliation d'identité + connecteur PoliGraph (Sénat/ministres, même interface).
- **Phase 3 :** ETL des sources en masse (Assemblée, Sénat, HATVP, vie-publique) via BullMQ ; connecteur Légifrance/PISTE.

## Critères d'acceptation (Phase 1)

1. `pnpm install && pnpm dev` démarre backend + frontend sans erreur.
2. En démo, rechercher un nom fictif affiche un résultat ; ouvrir la fiche affiche les derniers votes avec pastilles et liens de source.
3. `CIVIX_LIVE=1 pnpm dev` bascule sur l'API réelle ; en cas d'échec, l'erreur affichée indique URL + statut + extrait du corps (jamais un message vide).
4. `pnpm probe -- "Dupond"` affiche le diagnostic brut des routes CIVIX.
5. `pnpm typecheck` passe sans erreur (TS strict).
6. Tout le mapping des champs CIVIX est isolé dans un seul fichier/section.

## Standards de code

TypeScript strict ; pas de `any` non justifié ; erreurs typées et messages actionnables ; fonctions pures pour la normalisation ; commentaires en français aux endroits à régler. Pas de dépendance superflue. Commits petits et nommés par phase.

## À NE PAS faire

- Ne pas faire appeler les sources externes par le frontend (toujours via le backend).
- Ne pas inventer de données réelles ni de votes pour des personnes réelles en mode démo.
- Ne pas ingérer les déclarations de patrimoine HATVP.
- Ne pas produire de score, classement ou jugement politique.
- Ne pas supposer une route `/deputes/{uid}/votes` : elle n'existe pas.

**Commence par la Phase 1. Quand elle compile et tourne, montre-moi l'arborescence et les commandes de lancement avant de passer à la Phase 2.**
