# Mille Vies

Jeu narratif 2D en pixel art où l'on choisit un univers, incarne un personnage et vit son histoire. On se déplace dans des scènes animées, on parle aux gens et on fait des choix qui ont des conséquences, parfois plusieurs semaines plus tard. Une carrière se termine sur l'une des nombreuses fins possibles.

Le projet est un **moteur** : chaque univers n'est qu'un **fichier de données**, avec des statistiques, des personnages, des lieux et des événements écrits dans le langage de script **Trame**. Un **éditeur intégré** permet de créer, tester, simuler et publier de nouveaux univers sans toucher au code.

Deux univers complets sont livrés :

| Contenu | « Crampons d'Or » (football) | « Ombrelune » (école de magie) |
| --- | --- | --- |
| Événements | 132 | 155 |
| Fins | 13 | 13 |
| Lieux | 21 | 18 |
| Personnages | 17 | 16 |
| Chapitres | 5 saisons | 5 années |
| Statistiques | 17 | 14 |
| Activités | 19 | 20 |
| Décisions par partie (moyenne simulée) | environ 120 | environ 85 |

- **Crampons d'Or** : une carrière de footballeur, du centre de formation à la retraite, avec un match chaque semaine.
- **Ombrelune** : cinq années dans une école de magie, de 11 à 15 ans. Tu choisis ton affinité (Flamme, Onde, Souffle ou Racine), ton origine et ton caractère. Chaque semaine : des cours (scène de classe tirée au hasard), des activités, des amitiés, des rivalités, et un grimoire qui murmure ton nom. Les cinq années convergent vers une seule nuit, au cercle de pierres, dont l'issue dépend de tout ce que tu as fait (alliés réunis, ingrédients du sceau, pacte avec l'ombre, liens avec Noé et Ayla…).

## Lancer le jeu

```bash
npm install
npm run build          # génère dist/index.html (un seul fichier, polices et contenu inclus)
```

Ouvre ensuite `dist/index.html` dans un navigateur. Il n'y a ni serveur, ni API payante, ni connexion requise.

### Partager le jeu avec GitHub Pages

```bash
npm run pages          # build + copie de dist/index.html vers index.html (à la racine)
git add -A && git commit -m "Mise à jour du jeu" && git push
```

Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**. Le jeu est alors jouable à l'adresse `https://<utilisateur>.github.io/<dépôt>/`, sur ordinateur comme sur téléphone. Chaque joueur a ses propres sauvegardes, dans son navigateur.

### Commandes

| Commande | Rôle |
| --- | --- |
| `npm run build` | Compile le contenu (`content/`) puis le jeu dans `dist/` |
| `npm test` | Tests unitaires du moteur, de l'éditeur et des univers livrés (`node:test`) |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm run simulate -- 500 ombrelune` | Joue 500 parties automatiques d'un univers et affiche la répartition des fins |
| `npm run content` | Compile et valide seulement le contenu des univers |
| `npm run pages` | Build, puis copie du jeu en `index.html` à la racine (pour GitHub Pages) |

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
- **Apparence du personnage** entièrement personnalisable, à la création puis à tout moment en jeu (« Garde-robe » dans le menu ou la fiche du personnage) :
  - corps (genre, corpulence, taille, teint), visage (couleur des yeux, pilosité, signes particuliers), 20 coiffures, tenue (haut, bas, chaussures) ;
  - 18 accessoires (lunettes, chapeau pointu, cape, baguette, écharpe, cicatrice, taches de rousseur…) ;
  - palettes de couleurs et sélecteur de couleur libre, bouton « Au hasard », aperçu animé (marche, émotions) ;
  - la tenue imposée par certains lieux (maillot au stade, robe d'école à Ombrelune) reste prioritaire.
- **Pixel art procédural** : personnages articulés (environ 26 animations), portraits à 9 émotions, une centaine d'objets de décor (dont un château, une forêt, des chaudrons, des pierres dressées, des grimoires), parallaxe, moments de la journée, météo, effets magiques, foule animée et tableau d'affichage.
- **Éditeur d'histoires intégré** : voir [docs/UNIVERS.md](docs/UNIVERS.md).
  - Formulaires pour chaque élément, aperçus animés et placement au clic dans le décor.
  - Éditeur de script avec coloration, erreurs en direct, plan des nœuds, assistants d'écriture et aide-mémoire.
  - Renommage d'un identifiant partout dans l'univers.
  - Validation, simulation de centaines de parties, test en jeu (y compris à partir d'un événement ou d'une fin précise).
  - Sauvegarde, publication, import et export en JSON ou en `.trame`.

## Structure

```
content/football/        univers football : universe.json + story/*.trame
content/ombrelune/       univers école de magie : universe.json + story/*.trame
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
tests/                   tests unitaires (moteur, éditeur, univers livrés)
docs/                    architecture, langage Trame, création d'univers
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : architecture technique et choix de conception.
- [docs/TRAME.md](docs/TRAME.md) : référence complète du langage de script.
- [docs/UNIVERS.md](docs/UNIVERS.md) : créer un univers, avec l'éditeur ou à la main.

## Pistes pour la suite

- De nouveaux univers sur le même moteur (pilote de course, vie d'artiste, enquête…).
- Une génération de contenu locale facultative : un modèle exécuté sur la machine propose des événements dans le format Trame, puis l'éditeur les valide et les simule.
- Des musiques procédurales et plus d'effets de mise en scène.
