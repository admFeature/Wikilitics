# DESIGN.md — système visuel

Registre **product**, direction **« moderne / Linear-like »**. Sobre, net,
crédible. Clair + sombre via `prefers-color-scheme`.

## Typographie
- **Une famille** : Geist (grotesque premium), fallback `system-ui`. Mono : Geist
  Mono pour identifiants et raccourcis clavier (`⌘K`, uid `PA…`).
- Échelle rem fixe, ratio serré (~1.2). Tracking display `-0.02em` (jamais < -0.04).
- Pas de police display dans les labels/boutons/données.

## Couleur (tokens, restreint)
- Neutres en couches : `--bg` (fond), `--surface` (contenu), `--elevated`
  (popovers/cartes), `--panel` (bandeaux). Hairlines `--border` / `--border-strong`.
- Encre : `--ink` (texte), `--muted` (secondaire, contraste AA ≥ 4.5:1).
- **Accent unique** indigo (`--accent`) : action primaire, sélection, focus, état
  actif. Jamais décoratif.
- Hémicycle (faits, pas opinion) : pour=vert, contre=rouge, abstention=gris,
  non-votant=gris clair. Pastilles discrètes (teinte douce + texte lisible).

## Profondeur
- Hairline + ombre douce diffuse (`--shadow-1`, `--shadow-2`). Pas de bordure
  grise franche, pas d'ombre dure sombre. Rayons nets 8–14px (pas de squircle géant).
- Pas de cartes imbriquées.

## Motion (Emil + product)
- Courbes : `--ease-out: cubic-bezier(0.23,1,0.32,1)`. Durées 120–220ms.
- Motion = état uniquement (ouverture popover, focus, press, hover). **Pas** de
  chorégraphie au chargement. `:active { transform: scale(.97) }` sur le pressable.
- Popover origin-aware (depuis le champ). `prefers-reduced-motion` : crossfade,
  aucun transform.

## États (chaque composant)
default / hover / focus-visible / active / disabled / loading (skeleton) /
empty (qui explique) / error (lisible : message + détail).

## z-index sémantique
`--z-dropdown: 10` < `--z-sticky: 20` < `--z-overlay: 30` < `--z-toast: 40`.
