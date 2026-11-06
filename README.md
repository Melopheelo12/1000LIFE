# Mille Vies

Jeu narratif 2D en pixel art où l'on choisit un univers, incarne un personnage et vit son histoire. On se déplace dans des scènes animées, on parle aux gens et on fait des choix qui ont des conséquences, parfois plusieurs semaines plus tard. Une carrière se termine sur l'une des nombreuses fins possibles.

Le projet est un **moteur** : chaque univers n'est qu'un **fichier de données**, avec des statistiques, des personnages, des lieux et des événements écrits dans le langage de script **Trame**. Un **éditeur intégré** permet de créer, tester, simuler et publier de nouveaux univers sans toucher au code.

L'univers de référence, **« Crampons d'Or »** (football), contient :

| Contenu | Quantité |
| --- | --- |
| Événements | 132 |
| Fins | 13 |
| Lieux | 21 |
| Personnages | 17 |
| Chapitres | 5 |
| Statistiques | 17 |
| Activités | 19 |
| Lignes de script Trame | environ 4 100 |

Une partie dure environ 120 décisions, réparties sur toute une carrière, du centre de formation à la retraite.

## Lancer le jeu

```bash
npm install
npm run build          # génère dist/index.html (un seul fichier, polices et contenu inclus)
```

Ouvre ensuite `dist/index.html` dans un navigateur. Il n'y a ni serveur, ni API payante, ni connexion requise.

### Commandes

| Commande | Rôle |
| --- | --- |
| `npm run build` | Compile le contenu (`content/`) puis le jeu dans `dist/` |
| `npm test` | Tests unitaires du moteur et de l'éditeur (`node:test`) |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm run simulate -- 500` | Joue 500 parties automatiques et affiche la répartition des fins |
| `npm run content` | Compile et valide seulement le contenu des univers |

### Contrôles en jeu

| Action | Clavier | Souris ou tactile |
| --- | --- | --- |
| Se déplacer | ← → (ou Q / D) | Clic ou toucher dans la scène |
| Courir | Maj | |
| Interagir, avancer | E, Entrée ou Espace | |
| Choisir une option | 1 à 9 | |
| Journal | J | |
| Personnage | C | |
| Relations | R | |
| Carte | M | |
| Menu | Échap | |
| Débogage (mode test de l'éditeur) | F2 | |

## Fonctionnalités

- **Univers multiples** : chaque univers est un fichier JSON avec des scripts `.trame`. Les univers créés et publiés dans l'éditeur apparaissent dans « Nouvelle vie ».
- **Choix à conséquences** :
  - les statistiques, les relations et les variables changent ;
  - les **traits de personnalité** des personnages modulent leurs réactions ;
  - les personnages **se souviennent** de tes actes, et un bandeau « conséquence » rappelle le choix passé quand il ressurgit ;
  - les **conséquences différées** (`planifier`) déclenchent un événement des semaines plus tard ;
  - une relation négligée s'érode d'elle-même.
- **Convergence narrative** : après un bloc de choix, l'histoire reprend un fil commun. Des drapeaux, des souvenirs et des conditions retiennent ce qui s'est passé, plutôt que de multiplier les branches.
- **Tests de compétence** : la probabilité de réussite est affichée sur le choix.
- **Événements aléatoires cohérents** : ils ont des conditions, des priorités, une durée avant de pouvoir revenir et des poids. Le hasard est déterministe, car sa graine fait partie de la sauvegarde.
- **Progression** :
  - activités hebdomadaires, objectifs, journal, carte et fiche du personnage ;
  - **fins multiples** et galerie des fins découvertes.
- **Sauvegardes** :
  - 6 emplacements et une sauvegarde automatique ;
  - historique des décisions, statistiques et relations conservés ;
  - export et import de fichiers.
  - Stockage dans le navigateur, ou dans le compte de l'utilisateur quand le jeu est publié comme artifact claude.ai.
- **Pixel art procédural** : personnages articulés (environ 26 animations), portraits à 9 émotions, environ 70 objets de décor, parallaxe, moments de la journée, météo, foule animée et tableau d'affichage.
- **Éditeur d'histoires intégré** : voir [docs/UNIVERS.md](docs/UNIVERS.md).
  - Formulaires pour chaque élément, aperçus animés et placement au clic dans le décor.
  - Éditeur de script avec coloration, erreurs en direct, plan des nœuds, assistants d'écriture et aide-mémoire.
  - Renommage d'un identifiant partout dans l'univers.
  - Validation, simulation de centaines de parties, test en jeu (y compris à partir d'un événement ou d'une fin précise).
  - Sauvegarde, publication, import et export en JSON ou en `.trame`.

## Structure

```
content/football/        univers de référence : universe.json + story/*.trame
src/core/                moteur narratif sans affichage (testable en Node)
  expr/                  langage d'expressions (conditions, effets, textes interpolés)
  trame/                 analyseur du langage Trame et format de fichier .trame
  runtime/               compilation, session de jeu, exécution, validation, simulateur
  model/types.ts         format des univers et des sauvegardes
src/engine/              moteur 2D Canvas (320×180) : rendu, monde, sprites, décors, audio
src/game/                contrôleur (relie moteur narratif et monde 2D), sauvegardes, registre
src/platform/            stockage (navigateur ou compte claude.ai), téléchargements
src/ui/                  interface Preact : menus, écran de jeu, panneaux, éditeur
tools/                   compilation du contenu, build, simulateur en ligne de commande
tests/                   tests unitaires (moteur, éditeur)
docs/                    architecture, langage Trame, création d'univers
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : architecture technique et choix de conception.
- [docs/TRAME.md](docs/TRAME.md) : référence complète du langage de script.
- [docs/UNIVERS.md](docs/UNIVERS.md) : créer un univers, avec l'éditeur ou à la main.

## Pistes pour la suite

- De nouveaux univers sur le même moteur (vie d'artiste, entreprise, enquête…).
- Une génération de contenu locale facultative : un modèle exécuté sur la machine propose des événements dans le format Trame, puis l'éditeur les valide et les simule.
- Des musiques procédurales et plus d'effets de mise en scène.
