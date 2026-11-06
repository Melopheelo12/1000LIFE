# Le langage Trame

Trame est le langage dans lequel s'écrivent les scènes : dialogues, choix, conditions, conséquences et mise en scène. Il est pensé pour des auteurs, pas pour des programmeurs. Une ligne correspond à une intention, et les mots-clés sont en français.

```trame
alex (content): Te voilà enfin !
* Lui faire un câlin. #tendresse ~ rel.alex += 8
  alex (rire): Doucement, tu m'étouffes !
* Lui serrer la main. #distant ~ rel.alex -= 2
  alex (surpris): … D'accord. Bonjour à toi aussi.
alex: Bon, on y va ?
```

Un script appartient à un **événement** (ou à une **fin**). Il est analysé et vérifié avant de jouer, et l'éditeur signale chaque erreur avec son numéro de ligne.

## Structure

| Syntaxe | Effet |
| --- | --- |
| `@nom` | Début d'un **nœud**. Le premier nœud (ou les lignes placées avant tout `@`) est l'entrée. |
| `-> nom` | Saut vers un nœud. |
| `-> fin` | Termine l'événement. |
| `// texte` | Commentaire. |

Un nœud **s'arrête à sa dernière ligne** : il n'enchaîne jamais tout seul sur le nœud suivant. Pour continuer, on écrit explicitement `-> suite`. Un nœud que rien ne cible est signalé (« Nœud jamais atteint »).

L'**indentation** (espaces) délimite les blocs : la réponse sous un choix, et le contenu d'un `si`.

## Dialogues

| Syntaxe | Effet |
| --- | --- |
| `alex: Salut !` | Réplique d'un personnage, désigné par son identifiant. |
| `alex (colere): Encore toi ?` | Réplique avec une émotion pour le portrait : `neutre`, `content`, `rire`, `triste`, `colere`, `surpris`, `inquiet`, `pensif`, `fier`. |
| `moi: …` ou `joueur: …` | Réplique du personnage joué. |
| `> Il pleut.` | Narration. |
| `[rel.alex >= 30] alex: Merci.` | Ligne jouée seulement si la condition est vraie. |

Dans tous les textes :

- `{expression}` insère une valeur, par exemple `Bravo {joueur.nom}, tu as {stat.argent} € !`.
- `[[masculin|féminin]]` accorde selon le genre du personnage joué : `Tu es [[prêt|prête]] ?`.

## Choix

```trame
* Texte du choix
+ Choix permanent
* [condition] Choix masqué si la condition est fausse
* (condition) Choix verrouillé (grisé, avec la condition affichée) si elle est fausse
* Texte #etiquette1 #etiquette2 ~ effets -> destination
```

- `*` désigne un choix qui **disparaît une fois pris**, ce qui sert quand un menu revient grâce à `->`. `+` désigne un choix **toujours proposé**.
- Les **étiquettes** `#tag` sont lisibles plus tard avec `choisi(tag)` et `tag.nom` : la personnalité qui se dessine au fil des choix. Les profils du simulateur s'en servent aussi.
- `~ effets` est appliqué au moment du choix. `-> destination` saute vers un nœud.
- Les lignes **indentées** sous un choix forment sa réponse. Ensuite, l'histoire **reprend après le bloc de choix** : c'est la convergence. Pour vraiment bifurquer, utilise `-> nœud`.
- Si tous les choix sont verrouillés, le dernier est débloqué automatiquement, pour éviter que le joueur reste bloqué.
- Si la première ligne sous un choix est un `test`, la **probabilité de réussite** s'affiche sur le choix.

## Conditions

```trame
si stat.moral < 20
  > Tu n'as plus envie de rien.
sinon si rel.ines >= 60
  ines (inquiet): Tu veux en parler ?
sinon
  > La semaine passe.
```

### Opérateurs

| Opérateurs | Rôle |
| --- | --- |
| `et`, `ou`, `non` | Logique |
| `==`, `!=`, `<`, `<=`, `>`, `>=` | Comparaison |
| `+`, `-`, `*`, `/`, `%` | Calcul |
| `( )` | Regroupement |
| `a ? b : c` | Condition en une ligne |
| `vrai`, `faux` | Valeurs logiques |
| `"texte"` | Texte entre guillemets |

Un mot nu qui n'est pas une valeur connue est un **symbole**, par exemple `lieu == stade` ou `vu(intro)`.

### Valeurs lisibles

| Expression | Valeur |
| --- | --- |
| `stat.x` | Statistique du joueur |
| `rel.perso` | Relation avec un personnage (−100 à 100) |
| `var.nom` | Variable (vaut 0 si elle n'a jamais été définie) |
| `mem.perso.cle` | Vrai si le personnage garde ce souvenir |
| `connu.perso` | Vrai si le personnage a été rencontré |
| `joueur.nom`, `joueur.<champ>` | Prénom et choix faits à la création du personnage |
| `temps.semaine`, `temps.chapitre`, `temps.total` | Calendrier |
| `chapitre` | Identifiant du chapitre en cours |
| `lieu` | Identifiant du lieu en cours |
| `actions` | Actions restantes cette semaine |
| `objectif.id` | Statut d'un objectif |
| `tag.x` | Nombre de choix étiquetés `#x` |
| `meta.fins` | Fins déjà découvertes, toutes parties confondues |

### Fonctions

| Fonction | Rôle |
| --- | --- |
| `hasard(a, b)` | Entier aléatoire de a à b |
| `chance(p)` | Vrai dans p % des cas |
| `vu(evt)` | L'événement a déjà eu lieu |
| `nb(evt)` | Nombre de fois qu'il a eu lieu |
| `depuis(evt)` | Semaines écoulées depuis la dernière fois |
| `planifie(evt)` | L'événement est déjà planifié |
| `choisi(tag)` | Des choix étiquetés `tag` ont été faits |
| `trait(perso, trait)` | Le personnage a ce trait de personnalité |
| `niveau(perso)` | Libellé du niveau de relation |
| `cote(compétence, difficulté)` | Chance de réussite en % |
| `min`, `max`, `abs`, `arrondi` | Calculs courants |
| `borne(x, a, b)` | x ramené entre a et b |
| `entre(x, a, b)` | Vrai si x est entre a et b |
| `nombre(x)` | Nombre formaté (12 500) |
| `liste("nom", i, "champ")`, `listeHasard("nom")`, `taille("nom")` | Listes de données de l'univers |

## Tests de compétence

```trame
* Tenter le grand pont.
  test stat.technique vs 65
  si reussite
    > Le défenseur se retourne, ridicule.
    ~ stat.confiance += 5
  sinon
    > Le ballon file en touche.
```

La chance de réussite suit une courbe logistique sur l'écart *compétence − difficulté*. L'échelle est réglable par univers (`checkScale`). La compétence et la difficulté sont des expressions quelconques.

## Effets

Une ligne d'effets commence par `~` ; plusieurs effets se séparent par `;`.

```trame
~ stat.argent += 500; rel.coach -= 5; var.capitaine = vrai
```

### Modifier des valeurs

| Effet | Rôle |
| --- | --- |
| `stat.x += n`, `stat.x -= n`, `stat.x = n` | Statistique, toujours ramenée entre son minimum et son maximum |
| `rel.perso += n` | Relation. Les **traits** du personnage multiplient les gains et les pertes : un rancunier perd confiance deux fois plus vite. |
| `var.nom = valeur` | Variable : nombre, texte ou vrai/faux |
| `actions -= 1` | Actions de la semaine |
| `connu.perso = vrai` | Marque le personnage comme rencontré |

### Fonctions d'effet

| Effet | Rôle |
| --- | --- |
| `souvenir(perso, cle, "texte")` | Le personnage **se souviendra** : condition `mem.perso.cle`, rappel `!rappel perso.cle` |
| `oublier(perso, cle)` | Efface ce souvenir |
| `planifier(evt, n)` | **Conséquence différée** : l'événement se déclenche dans n semaines |
| `annuler(evt)` | Annule une conséquence planifiée |
| `eloigner(perso, n)` | Érosion silencieuse d'une relation négligée |
| `rencontrer(perso)` | Le personnage devient connu |
| `objectif("id", "texte")`, `objectifReussi("id")`, `objectifEchoue("id")` | Objectifs du joueur |
| `actu("texte")` | Actualité dans le journal et notification |
| `journal("texte")` | Entrée dans le journal |
| `notifier("texte")` | Notification |
| `aller(lieu)` | Déplace le joueur |
| `chapitreSuivant()` | Passe directement au chapitre suivant |
| `fin(id)` | Déclenche une fin |

## Sous-événements

| Syntaxe | Effet |
| --- | --- |
| `appel evt` | Joue un autre événement (souvent en déclenchement « manuel ») puis reprend ici. |
| `tirer reserve n` | Tire n événements éligibles parmi ceux déclenchés par `pool:reserve`, puis reprend ici. Pratique pour varier les matchs ou les soirées. |

## Mise en scène

Les commandes `!…` animent la scène 2D. Le simulateur les ignore ; seules `!lieu`, `!rappel` et `!echo` ont un effet sur l'histoire.

| Commande | Effet |
| --- | --- |
| `!lieu id [x] [moment]` | Change de lieu |
| `!moment aube\|jour\|soir\|nuit` | Moment de la journée |
| `!meteo pluie\|neige\|clair` | Météo |
| `!placer perso x [gauche\|droite] [voie]` | Place un acteur. x peut être un nombre, un autre acteur ou un décalage `+20` / `-20`. |
| `!aller perso cible`, `!courir perso cible` | Déplacement |
| `!entrer perso gauche\|droite [cible]` | Entrée en scène |
| `!sortir perso [côté]` | Sortie de scène |
| `!retirer perso` | Retire l'acteur |
| `!anim perso animation [boucle]` | Animations : marche, course, parle, frappe, passe, joie, saut, triste, interagir, montrer, assis, tacle, tete, plongeon, chute, applaudir, bras_croises, reflechir, telephone, saluer, danse, garde, etirement, souleve, ecrire |
| `!face perso gauche\|droite\|autre_perso` | Orientation |
| `!emote perso ! \| ? \| coeur \| colere \| zzz` | Bulle d'émotion |
| `!tenue perso haut [couleur] [couleur2]` | Change de tenue |
| `!camera perso\|x` | Caméra |
| `!pause ms` | Pause |
| `!fondu` | Fondu |
| `!titre Texte` | Grand titre à l'écran |
| `!fx confettis\|flash\|tremblement\|flashs\|etincelles\|pluie\|neige\|filet\|foule` | Effets visuels |
| `!ballon pied perso`, `!ballon vers cible tir\|passe\|lob\|centre\|rate`, `!ballon placer x`, `!ballon cacher` | Ballon (`!objet` pour un autre objet) |
| `!figurant id rôle x` | Figurant (supporters, adversaires…) |
| `!equipe nom couleur1 couleur2` | Couleurs d'une équipe |
| `!preset nom` | Placement d'acteurs prédéfini |
| `!son nom` | Son : positif, negatif, souvenir, sifflet, but, porte, telephone, tension… |
| `!rappel perso.cle` | Bandeau « conséquence » rappelant un souvenir, seulement s'il existe |
| `!echo Texte` | Bandeau « conséquence » libre |

## Fichiers `.trame`

Les événements peuvent vivre dans des fichiers texte, regroupés par thème. Chaque bloc commence par `=== id` suivi des propriétés de l'événement, puis du script après une ligne `---` :

```trame
=== dispute_coach
titre: La dispute
declencheur: talk:coach
condition: rel.coach < 0 et non vu(dispute_coach)
chapitres: ch2, ch3
priorite: 5
unique: oui
---
coach (colere): Tu crois que je ne t'ai pas vu traîner ?
* Baisser les yeux. ~ rel.coach += 3
* Répondre. #provoc ~ rel.coach -= 8; planifier(banc_de_touche, 2)
```

Propriétés d'un événement :

| Propriété | Rôle |
| --- | --- |
| `titre` | Titre de l'événement |
| `declencheur` | Ce qui le déclenche (voir [UNIVERS.md](UNIVERS.md)) |
| `quand` (ou `condition`) | Condition d'éligibilité |
| `chapitres` | Chapitres concernés, séparés par des virgules |
| `priorite` | Ordre de passage entre événements éligibles |
| `unique: oui` | Ne se produit qu'une fois |
| `recharge` | Semaines avant de pouvoir revenir |
| `chance` | Probabilité de se déclencher |
| `poids` | Poids dans le tirage |
| `tags` | Étiquettes |
| `notes` | Notes d'auteur |

Un bloc `=== fin:id` définit une fin, avec les propriétés `titre`, `type`, `quand`, `priorite`, `resume` et `lieu`. L'éditeur exporte et importe ce format (section « JSON et fichiers »), et l'univers football est écrit ainsi (`content/football/story/*.trame`).

## Sécurité

Les expressions sont analysées par un interpréteur dédié. Il n'y a ni `eval`, ni accès au code JavaScript, ni boucle infinie possible : les sauts répétés sont plafonnés et signalés.
