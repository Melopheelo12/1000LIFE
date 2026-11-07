# Architecture

## Principes

1. **Données plutôt que code.** Un univers est un fichier JSON avec des scripts Trame. Le moteur ne contient rien de spécifique au football : l'éditeur intégré produit exactement le même format que les univers livrés.
2. **Un moteur narratif sans affichage.** La logique (temps, choix, conséquences, sélection des événements, fins) tourne sans DOM ni Canvas. On peut donc la tester unitairement et la **simuler** : des centaines de parties en quelques secondes, avec des profils de joueurs.
3. **Rien d'arbitraire n'est exécuté.** Les conditions et les effets passent par un interpréteur d'expressions dédié : pas d'`eval`, des boucles plafonnées.
4. **Déterminisme.** Le générateur aléatoire (sfc32) a une graine, et son état fait partie de la sauvegarde. Une partie rechargée se comporte comme l'originale.
5. **Graphismes procéduraux.** Personnages, portraits et décors sont dessinés par du code, sans fichier image. Le jeu entier tient dans un seul fichier HTML d'environ 620 Ko, polices et contenu compris, et les combinaisons visuelles sont infinies.

## Couches

```
                ┌────────────────────────── src/ui (Preact) ───────────────────────────┐
                │ menus · écran de jeu · panneaux · éditeur d'histoires                │
                └───────────────┬───────────────────────────────────┬──────────────────┘
                                │                                   │
                  src/game/controller.ts                    src/game/saves.ts · registry.ts
            (relie histoire ⇄ monde 2D ⇄ interface)          (sauvegardes, univers disponibles)
                 │                         │                                │
   src/core (moteur narratif)    src/engine (moteur 2D Canvas)     src/platform/storage.ts
   expr · trame · runtime        world · gfx · audio               (navigateur ou compte claude.ai)
```

`src/core` ne dépend d'aucune autre couche. `src/engine` ne connaît que ses propres types (scène, acteurs, apparence). Seul le contrôleur relie les deux.

## Moteur narratif (`src/core`)

| Module | Rôle |
| --- | --- |
| `model/types.ts` | Format des univers (`UniverseDef`), de l'état de jeu (`GameState`) et des sauvegardes |
| `expr/expr.ts` | Langage d'expressions : analyse, évaluation, effets, textes interpolés `{…}` et accords `[[m\|f]]` |
| `trame/trame.ts` | Analyseur Trame : nœuds, répliques, choix, conditions, tests, mise en scène, sous-événements. Les erreurs portent leur numéro de ligne. |
| `trame/bundle.ts` | Fichiers `.trame` regroupant plusieurs événements et fins, dans les deux sens |
| `runtime/compile.ts` | Compile un univers : scripts analysés, index des déclencheurs, accès rapide aux statistiques, personnages et lieux |
| `runtime/session.ts` | `GameSession` : état, temps, effets, relations modulées par les traits, souvenirs, conséquences planifiées, sélection des événements, fins, journal, objectifs |
| `runtime/runner.ts` | `StoryRunner` : exécute un script pas à pas et produit des étapes (`line`, `choices`, `stage`, `echo`, `end`) que l'interface affiche |
| `runtime/validate.ts` | Validation complète : références inconnues, expressions invalides, nœuds jamais atteints, fins par défaut, fin de semaine possible… |
| `runtime/simulate.ts` | Simulateur : parties complètes avec profils (curiosité, préférences d'étiquettes) ; répartition des fins, événements jamais vus, blocages |
| `rng.ts` | Générateur aléatoire déterministe et sérialisable |

### Le temps

Une partie avance par **unités de temps** (des semaines pour le football). Chaque semaine donne des **actions** à dépenser en activités, dans les lieux. La session gère une **file de travaux** : début de semaine (événements planifiés, événements d'histoire, tirage aléatoire), événements, fin de semaine, changements de chapitre, fin de partie. Le contrôleur vide cette file en enchaînant les scènes.

### Les conséquences

| Mécanisme | Effet |
| --- | --- |
| Immédiates | Effets `~` sur les statistiques, relations, variables et objectifs |
| Modulées | Chaque trait de personnage multiplie les gains (`gain`) et les pertes (`loss`) de relation |
| Mémorisées | `souvenir(perso, cle, texte)` ; lu par `mem.perso.cle`, rappelé à l'écran par `!rappel` |
| Différées | `planifier(evt, n)` place l'événement dans la liste `scheduled` de l'état ; il se déclenche n semaines plus tard |
| Silencieuses | `eloigner(perso, n)` : une relation négligée s'érode d'elle-même |
| Structurelles | Conditions des lieux, des personnages présents, des sorties, des activités et des fins |

### La convergence

Après un bloc de choix, le script reprend au même endroit. Les branches ne se multiplient pas ; ce sont les **traces** (variables, souvenirs, étiquettes `#tag`, relations) qui font diverger les histoires plus tard, à travers des conditions. L'univers football compte ainsi environ 120 décisions par partie, avec une base de scripts qui reste lisible.

## Moteur 2D (`src/engine`)

| Module | Rôle |
| --- | --- |
| `engine.ts` | Boucle d'animation, résolution interne de 320×180 avec agrandissement pixel par pixel, mise en page portrait et paysage, entrées clavier, souris et tactile |
| `world/world.ts` | Monde : acteurs, joueur, caméra, scène libre (« hub ») et commandes de mise en scène (`!aller`, `!anim`, `!ballon`…) |
| `gfx/character.ts` | Sprites articulés : squelette, environ 26 animations, tenues, coiffures, accessoires, apparences aléatoires |
| `gfx/portrait.ts` | Portraits de face, 9 émotions |
| `gfx/scenery.ts` | Rendu des lieux en couches (fond en parallaxe, plan principal, premier plan, objets animés, lueurs), environ 70 objets, murs, sols, ciels, météo |
| `gfx/pixel.ts` | Couleurs, ombrages, mini-police 3×5 pour les enseignes |
| `audio.ts` | Sons synthétisés en Web Audio (voix des personnages, interface, ambiances), sans fichier audio |

## Contrôleur et interface

- `game/controller.ts` consomme la file de travaux de la session et traduit les étapes du runner en états d'interface : réplique, choix, bandeau de conséquence, carte de chapitre, résumé de semaine, fin. Il exécute la mise en scène dans le monde 2D, gère les interactions (personnages, sorties, éléments du décor) et la sauvegarde automatique. Il expose `window.__mv`, utilisé par les tests de navigateur.
- `ui/` (Preact) :
  - **menus** : titre, choix de l'univers, création du personnage, chargement, galerie des fins, réglages ;
  - **écran de jeu** : HUD, boîte de dialogue avec portrait, choix avec probabilités et raisons de verrouillage, notifications ;
  - **panneaux** : journal, fiche, relations, carte, menu, débogage ;
  - **éditeur** (`ui/editor/`).

## Éditeur (`src/ui/editor`)

| Fichier | Rôle |
| --- | --- |
| `Editor.tsx` | Bibliothèque des univers créés, espace de travail : navigation, validation en continu avec un délai, aperçus, sauvegarde, publication, test, brouillon de secours |
| `sections1.tsx` | Univers, statistiques, traits, personnages (aperçu animé), lieux (aperçu du décor, placement au clic), activités, chapitres, création du joueur |
| `sections2.tsx` | Événements, fins, variables et listes, JSON et `.trame`, validation, simulation, aide |
| `script.tsx` | Éditeur de script : calque de coloration sous une zone de texte transparente, marge des lignes, erreurs, plan, assistants, aide-mémoire |
| `refactor.ts` | Renommage d'un identifiant et de toutes ses références, en distinguant le code des textes affichés |
| `templates.ts` | Univers modèle complet et jouable, utilitaires d'identifiants |
| `fields.tsx`, `common.tsx` | Champs de formulaire (dont la saisie de code vérifiée à chaque frappe), liste maître et détail |

Le brouillon vit dans l'état de l'application. Le mode test lance une partie jetable à partir de ce brouillon, puis revient exactement à la même section de l'éditeur.

## Stockage et sauvegardes

- `platform/storage.ts` fournit un stockage clé-valeur asynchrone. Par défaut, c'est `localStorage`. Quand le jeu est publié comme artifact claude.ai avec la capacité `db`, les données vont dans l'espace privé de l'utilisateur (`data/users/<id>/`), découpées en morceaux si elles sont grosses, avec repli local.
- Une sauvegarde (`mille-vies/save@1`) contient l'état complet, compacté : statistiques, relations, variables, souvenirs, historique des décisions, journal, objectifs, événements planifiés, graine et état du générateur aléatoire. Il y a 6 emplacements et une sauvegarde automatique, qui a lieu chaque semaine, après les événements de début de semaine. L'export et l'import passent par des fichiers.
- Les univers créés dans l'éditeur sont stockés de la même manière (`universe:<id>` et un index).

## Chaîne de construction

1. `tools/build-content.ts` lit `content/<id>/universe.json` et `story/*.trame`, fusionne, **valide** (et échoue en cas d'erreur), puis écrit `src/data/universes.gen.json`.
2. `tools/build.mjs` (esbuild) produit un **fichier unique** : JavaScript minifié, CSS en texte, polices en data URL. Il génère `dist/index.html` (page complète) et `dist/artifact.html` (fragment pour la publication en artifact).

## Tests

| Niveau | Contenu |
| --- | --- |
| Unitaires (`npm test`, 54 tests) | Expressions, analyseur Trame, effets, relations et traits, souvenirs, conséquences différées, sélection des événements, fins, sauvegarde, validation (dont les lieux sans sortie et les portes verrouillées contournables par la carte), déclencheur des éléments du décor ; côté éditeur : modèle valide et jouable, renommage global (y compris sur tout l'univers football), aller-retour `.trame` ; entourage : accords `[[id:…|…]]`, prénoms remplacés avec l'élision, proches absents, sauvegarde ; univers livrés : zéro erreur et zéro avertissement pour les quatre univers, 450 parties d'Ombrelune simulées avec toutes les fins atteintes et aucune fin à plus de 40 % ; histoires courtes : 600 parties du rappeur et 700 de l'enquête simulées (toutes les fins, tous les événements, aucun blocage), coupable tiré au sort parmi les six suspects et jamais le même que la partie précédente (`precedent`), chaque coupable confondu par un joueur méthodique, aucun innocent avec plus de deux éléments à charge |
| Simulation (`npm run simulate -- 500 <univers>`) | Entourage tiré au hasard à chaque partie (proches présents ou non, genre choisi). Football : 0 partie bloquée, 0 plantage, 13 fins sur 13, 147 événements sur 147, environ 125 décisions par partie. Ombrelune : 0 blocage, 0 plantage, 13 fins sur 13, 176 événements sur 176, environ 90 décisions par partie |
| Navigateur (Playwright) | Carrière complète (football) et scolarité complète (Ombrelune) jouées par un robot jusqu'à une fin, sans erreur console, en vérifiant que chaque lieu visité a une sortie. Parcours complet de l'éditeur : création, renommage, placement au clic, erreurs en direct, assistant de choix, validation, simulation, sauvegarde, publication, test en jeu, test d'une fin, puis partie complète de l'univers créé depuis « Nouvelle vie ». Sauvegarde manuelle, rechargement, chargement et « Continuer ». Mise en page téléphone. |
