# Créer un univers

Un univers est un **fichier de données** au format `mille-vies/universe@1`. Le moteur n'a besoin d'aucun code spécifique : tout ce qui rend « Crampons d'Or » unique (le centre de formation, les matchs, les transferts, les 13 fins) est décrit par des données et des scripts [Trame](TRAME.md).

Il y a deux façons de travailler :

1. **L'éditeur intégré**, recommandé : bouton « Éditeur d'histoires » du menu principal.
2. **À la main** : dossier `content/<id>/`, avec `universe.json` et des fichiers `story/*.trame`, compilé par `npm run build`.

## 1. Avec l'éditeur intégré

### Démarrer

La bibliothèque propose trois façons de commencer :

- **Nouvel univers** : part d'un petit univers complet et jouable à transformer (2 personnages, 3 lieux, 3 activités, 2 chapitres, 6 événements, 4 fins). Il montre déjà chaque mécanique : un test de compétence, une conséquence différée avec rappel, un objectif et des fins conditionnelles.
- **Partir d'un univers existant** : copie modifiable, par exemple de l'univers football. L'original n'est jamais touché.
- **Importer** : un fichier `.json` exporté depuis l'éditeur.

Les univers sont enregistrés dans le navigateur, ou dans le compte de l'utilisateur quand le jeu est publié comme artifact claude.ai. Si la page se ferme sans avoir enregistré, un brouillon de secours est proposé au retour.

### Les sections

| Section | Ce qu'on y fait |
| --- | --- |
| Univers | Nom, accroche, couleurs, lieu de couverture, lieu et événement de départ, rythme (unité de temps, actions par semaine, chance d'événement aléatoire, échelle des tests), jauges du HUD, niveaux de relation, effets de début et de fin de semaine, fiche du personnage |
| Statistiques | Identifiant, nom, catégorie, bornes, valeur de départ, format (nombre, argent, %), couleur, visibilité, présence dans le HUD |
| Traits de personnalité | Multiplicateurs des gains et pertes de relation (rancunier, généreux…) |
| Personnages | Identité, rôle, objectif, traits, relation de départ, voix, répliques d'ambiance, apparence avec **aperçu animé** (sprite et portrait, émotions), lieux où il apparaît, conversations prévues |
| Lieux | **Aperçu du décor en direct** avec défilement, moment de la journée et repères. Murs, sols, arrière-plans, objets (une centaine de types), sorties, personnages présents, éléments interactifs, tenue du joueur. Le bouton 📍 place un élément **en cliquant dans l'aperçu**. |
| Activités | Coût (actions ou statistiques), effets, message, condition, limite par semaine, où elle est proposée |
| Chapitres | Ordre, durée, lieu de départ, texte d'introduction, effets de début et de fin |
| Création du joueur | Prénom, apparence de base, choix de départ (origine, poste…) avec leurs effets, et **entourage personnalisable** (proches renommables, genre au choix, proches facultatifs) |
| Événements | Déclencheur, condition, chapitres, priorité, répétition, probabilité, poids, étiquettes, notes, et l'**éditeur de script** |
| Fins | Condition, priorité, type, résumé, lieu, épilogue, ordre d'évaluation |
| Variables et listes | Variables de départ, listes de données (JSON), mises en scène prédéfinies |
| JSON et fichiers | Édition directe du JSON ; export et import des scripts au format `.trame` |
| Validation | Toutes les erreurs et tous les avertissements, cliquables (le clic mène à l'élément et à la ligne du script), avec les chiffres de l'univers |
| Simulation | Des centaines de parties automatiques, avec des profils de joueurs |
| Aide | Guide en 8 étapes et aide-mémoire Trame |

### L'éditeur de script

- **Coloration** de chaque élément du langage. Un personnage inconnu est souligné.
- **Erreurs en direct** : numéro de ligne dans la marge, ligne surlignée, message sous l'éditeur et dans la barre d'état.
- **Plan** des nœuds et de leurs choix, cliquable.
- **Assistants** :
  - **Réplique** : personnage, émotion, condition.
  - **Choix** : texte, condition d'apparition (masqué ou verrouillé), conséquences, destination, étiquettes, réponse.
  - **Effet** : statistique, relation, variable, souvenir, conséquence différée, objectif, actualité, déplacement, fin.
  - **Test de compétence**.
  - **Condition** (`si` / `sinon si` / `sinon`).
- **Raccourcis** :
  - Tab et Maj+Tab indentent et désindentent.
  - Entrée conserve l'indentation.
  - Échap puis Tab sort de l'éditeur.
  - Ctrl+S enregistre.
- **Aide Trame** avec recherche ; les identifiants de l'univers s'insèrent d'un clic.

### Renommer sans rien casser

Le bouton « Renommer… » d'un identifiant (personnage, lieu, événement, statistique, activité, chapitre, fin, trait) peut **mettre à jour toutes les références** :

- les champs structurés : sorties, déclencheurs, personnages présents, HUD, coûts, chapitres des événements ;
- le code : conditions, effets, scripts Trame, expressions dans les textes.

Les textes lus par le joueur ne sont jamais modifiés. C'est vérifié par les tests sur l'univers football entier : aucune référence cassée après renommage.

### Vérifier, tester, publier

1. **Validation** : chaque modification est revalidée automatiquement. La pastille de la barre du haut indique l'état.
2. **Simulation** : le simulateur joue des parties complètes sans affichage. Il vérifie que la partie se termine toujours, que chaque fin est atteignable, quels événements ne se produisent jamais, et la durée et le nombre de décisions moyens. Des profils (« préfère les choix #loyal », « évite #trahison ») orientent les choix.
3. **Tester** : joue le brouillon dans le vrai jeu, sans toucher aux sauvegardes.
   - « ▶ Tester d'ici » sur un événement lance une partie qui commence par lui.
   - « ▶ Tester cette fin » joue directement l'épilogue.
   - En jeu, F2 ouvre le **panneau de débogage** : modifier statistiques, relations et variables, déclencher un événement, sauter une semaine.
4. **Enregistrer** (Ctrl+S), puis **Publier**. La publication est refusée tant qu'il reste des erreurs. L'univers publié apparaît dans « Nouvelle vie ». « Dépublier » le retire de la liste sans le supprimer.
5. **Exporter** télécharge le fichier `.json` de l'univers.

## 2. Le format d'un univers

### Champs principaux (`universe.json`)

| Champ | Contenu |
| --- | --- |
| `format`, `id`, `version`, `name`, `tagline`, `description`, `author`, `tags` | Identité |
| `theme` | `accent`, `accent2`, `cover` (lieu de couverture) |
| `config` | `tickLabel`, `actionsPerTick`, `actionsLabel`, `endTickLabel`, `randomEventChance`, `maxStoryEventsPerTick`, `checkScale`, `hud`, `dateLine`, `relationLevels`, `showValues`, `remember` (variables retenues pour la partie suivante, lues avec `precedent("nom")`) |
| `stats[]` | `id`, `label`, `short`, `category`, `min`, `max`, `initial`, `format`, `color`, `visible`, `description` |
| `traits[]` | `id`, `label`, `description`, `gain`, `loss` |
| `characters[]` | `id`, `name`, `short`, `role`, `description`, `goals`, `traits`, `relation`, `relationLabel`, `look`, `barks`, `voice`, `hidden` |
| `locations[]` | `id`, `name`, `kind`, `time`, `width`, `spawn`, `wall`, `floor`, `backdrop`, `props`, `exits`, `npcs`, `hotspots`, `playerLook`, `ambient`, `group`, `when` |
| `activities[]` | `id`, `label`, `description`, `cost`, `effects`, `feedback`, `when`, `lockedText`, `maxPerTick` |
| `chapters[]` | `id`, `title`, `subtitle`, `weeks`, `location`, `intro`, `onStart`, `onEnd` |
| `creation` | `nameLabel`, `defaultName`, `look`, `baseLook`, `fields[]` (`id`, `label`, `options[]` avec `effects`) |
| `start` | `location`, `event` |
| `vars`, `lists`, `presets` | Variables de départ, listes de données, mises en scène prédéfinies |
| `onTickStart`, `onTickEnd` | Effets appliqués chaque semaine |
| `sheet[]` | Sections de la fiche du personnage (textes interpolés) |
| `events[]` | Voir ci-dessous |
| `endings[]` | `id`, `title`, `type`, `when`, `priority`, `summary`, `location`, `script` |

Les couleurs acceptent `#rrggbb`, un nom de couleur (`rouge`, `bleu_nuit`…) ou `$variable`, pour une couleur stockée dans une variable comme les couleurs d'un club.

### Événements

```json
{ "id": "dispute_coach", "title": "La dispute", "trigger": "talk:coach", "when": "rel.coach < 0",
  "chapters": ["ch2"], "priority": 5, "once": true, "cooldown": 0, "chance": 100, "weight": 1,
  "tags": ["important"], "script": "coach (colere): …" }
```

| Déclencheur | Quand |
| --- | --- |
| `enter:lieu` | En entrant dans un lieu |
| `talk:perso` | En parlant à un personnage |
| `activity:act` | Après une activité |
| `hotspot:element` | En utilisant un élément du décor (avant le menu d'activités) |
| `tick_start`, `tick_end` | Début ou fin de chaque semaine |
| `random` | Tirage aléatoire en début de semaine (`config.randomEventChance`) |
| `scheduled` | Conséquence différée, programmée par `planifier(evt, n)` |
| `chapter_start`, `chapter_end` | Début ou fin de chapitre |
| `pool:nom` | Réserve dans laquelle un script tire avec `tirer nom n` |
| `manual` | Seulement par `appel evt` ou comme événement de départ |

**Sélection** : parmi les événements dont le déclencheur correspond, sont éligibles ceux qui remplissent ces conditions :

- le chapitre convient ;
- la condition `when` est vraie ;
- un événement `once` n'a pas déjà eu lieu ;
- le délai `cooldown` est écoulé ;
- le tirage de `chance` est réussi.

On garde ensuite la **priorité** la plus haute, puis on tire au sort selon le **poids**. Les événements `once` ou étiquetés `important` sont signalés comme nouveautés, sur la carte et au-dessus des personnages. Le simulateur considère aussi qu'un joueur fait en priorité les activités qui ont un événement `important` en attente : c'est l'équivalent d'un joueur qui suit ses objectifs (ex. « Distiller la Larme de Lune (préparer des potions) »).

### Fins

À la fin du dernier chapitre, la fin de **priorité la plus haute dont la condition est vraie** est jouée. Une fin sans condition sert de fin par défaut. Un script peut forcer une fin avec `~ fin(id)`, pour une blessure ou un scandale par exemple. Chaque fin découverte est ajoutée à la galerie des fins.

## 3. Un univers « intégré » (dans le code source)

```
content/mon_univers/
  universe.json          tout sauf les scripts (events et endings peuvent rester vides)
  story/*.trame          événements et fins, regroupés par thème
```

`npm run build` charge le dossier, fusionne les `.trame`, **valide** l'univers et refuse les erreurs. Le résultat est intégré au jeu. `npm run simulate -- 500 mon_univers` donne la répartition des fins.

## Conseils d'écriture

- **Une conséquence qu'on voit** : quand un choix ancien ressurgit, `!rappel perso.cle` affiche un bandeau qui rappelle ce que le joueur a fait.
- **Converger plutôt que bifurquer** : après les choix, l'histoire reprend un fil commun ; la différence vit dans les variables, les souvenirs et les relations, puis réapparaît plus tard dans des conditions.
- **Différer** : `planifier(evt, 4)` fait payer une promesse non tenue un mois plus tard.
- **Un « filet » de sécurité** : une fin sans condition, et au moins un élément interactif qui termine la semaine. La validation le vérifie.
- **Un entourage personnalisable** : dans « Création », liste les proches que le joueur pourra renommer et dessiner. Pour un proche dont il choisit le genre, écris les accords avec `[[id:il|elle]]` ; pour un proche facultatif, protège chacune de ses scènes avec `present(id)` (la validation signale les répliques non protégées). Si le joueur ne change rien, l'histoire reste telle qu'elle est écrite.
- **Toujours une sortie** : chaque lieu doit avoir au moins une porte ou un bord de scène (`exits`), sinon le joueur ne peut le quitter qu'avec la carte. La validation le signale.
- **Verrouiller vraiment** : une porte conditionnelle (`exits[].when`) ne suffit pas, car la carte permet d'aller partout. Si toutes les portes vers un lieu sont verrouillées, donne la même condition au lieu (`when`) ; la validation le signale aussi.
- **Un rythme hebdomadaire** : un événement `tick_end` (recharge 1) qui tire dans une réserve (`tirer cours 1`) donne une scène récurrente variée, comme le match de foot ou le cours de la semaine à Ombrelune.
- **Des décors qui évoluent** : un objet de décor peut avoir une condition (`props[].when`). À Ombrelune, les pierres dressées n'apparaissent dans la forêt qu'une fois le cercle découvert, et les disciples encapuchonnés seulement la dernière nuit.
- **Une énigme qui change à chaque partie** : « Six Suspects » tire son coupable dans l'introduction (`var.n_coupable = hasard(0, 5)`, puis `liste("suspects", var.n_coupable, "id")`) et le retient avec `config.remember` ; `precedent("n_coupable", -1)` permet d'en tirer un autre à la partie suivante. Chaque scène d'enquête écrit une version par coupable (`si var.coupable == helene …`), et les fausses pistes sont plafonnées pour qu'un dossier solide désigne toujours le bon suspect.
- **Simuler souvent** : un événement « jamais déclenché » a presque toujours une condition trop stricte.
