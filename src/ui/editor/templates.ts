// Modèles et utilitaires d'identifiants pour l'éditeur.
// Le modèle « univers vierge » est un petit univers COMPLET et jouable : il montre
// chaque mécanique (stats, relations, traits, choix, test de compétence,
// conséquence différée avec rappel, objectifs, fins conditionnelles).
import type { UniverseDef } from '../../core/model/types';

/** Identifiant sûr pour les scripts : minuscules, chiffres, « _ ». */
export const ID_PATTERN = /^[a-z_][a-z0-9_]*$/;

export function slugify(s: string): string {
  const out = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!out) return 'element';
  return /^\d/.test(out) ? `_${out}` : out;
}

export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const id = slugify(base);
  if (!set.has(id)) return id;
  for (let i = 2; ; i++) if (!set.has(`${id}_${i}`)) return `${id}_${i}`;
}

export function newUniverseTemplate(id: string, name: string): UniverseDef {
  return {
    format: 'mille-vies/universe@1',
    id,
    version: '0.1',
    name,
    tagline: 'Une nouvelle vie commence.',
    description: 'Univers créé avec l\'éditeur. Remplace ce texte par le résumé de ton histoire.',
    author: '',
    tags: ['Nouveau'],
    published: false,
    theme: { accent: '#f5c542', accent2: '#3fb36b', cover: 'place' },
    config: {
      tickLabel: 'Semaine', actionsPerTick: 3, actionsLabel: 'Actions', randomEventChance: 35, maxStoryEventsPerTick: 2,
      checkScale: 12, hud: ['energie', 'moral', 'argent'], endTickLabel: 'Dormir et terminer la semaine', showValues: true,
    },
    stats: [
      { id: 'energie', label: 'Énergie', min: 0, max: 100, initial: 80, color: '#5fcf7d', category: 'Corps', description: 'Baisse avec le travail, remonte avec le repos.' },
      { id: 'moral', label: 'Moral', min: 0, max: 100, initial: 60, color: '#7cb7ff', category: 'Esprit' },
      { id: 'reputation', label: 'Réputation', min: 0, max: 100, initial: 15, color: '#ffd25a', category: 'Social' },
      { id: 'argent', label: 'Argent', min: 0, max: 1000000, initial: 100, format: 'argent', color: '#f5c542', category: 'Social' },
    ],
    vars: { promesse: false, responsable: false },
    traits: [
      { id: 'chaleureux', label: 'Chaleureux', description: 'S\'attache vite et pardonne facilement.', gain: 1.3, loss: 0.7 },
      { id: 'exigeant', label: 'Exigeant', description: 'Difficile à impressionner, déteste être déçu.', gain: 0.7, loss: 1.4 },
    ],
    characters: [
      {
        id: 'alex', name: 'Alex Martin', short: 'Alex', role: 'Ton ami d\'enfance', traits: ['chaleureux'], relation: 30, relationLabel: 'Amitié',
        description: 'Toujours là pour toi, parfois un peu trop.', goals: 'ouvrir son propre café.',
        look: { skin: 'peau2', hair: 'boucle', hairColor: 'chatain', top: 'sweat', topColor: '#d1495b', bottom: 'jean', bottomColor: '#2e4a7a' },
        barks: [{ text: 'Alors, cette semaine ?' }, { text: 'Tu n\'as pas oublié le café, hein ?', if: 'var.promesse' }],
      },
      {
        id: 'morgane', name: 'Morgane Leroy', short: 'Morgane', role: 'La patronne de l\'atelier', traits: ['exigeant'], relation: 0, relationLabel: 'Confiance',
        description: 'Dirige l\'atelier d\'une main de fer.', goals: 'trouver à qui transmettre l\'atelier.',
        look: { skin: 'peau4', hair: 'chignon', hairColor: 'noir', top: 'chemise', topColor: '#3b3f58', bottom: 'pantalon', bottomColor: '#1d2230', acc: ['lunettes'], gender: 'f' },
        barks: [{ text: 'Le travail ne va pas se faire tout seul.' }],
      },
    ],
    locations: [
      {
        id: 'maison', name: 'Ton appartement', width: 340, kind: 'interieur', spawn: 170, ambient: 'interieur',
        wall: { style: 'papier', color: '#d9cbb3', color2: '#b09070' }, floor: { style: 'parquet', color: '#a8794e' },
        props: [
          { type: 'porte', x: 24, label: 'SORTIE' }, { type: 'fenetre', x: 120, rideaux: '#b04848' }, { type: 'lit', x: 200, color: '#3f6fb0' },
          { type: 'plante', x: 248 }, { type: 'bureau', x: 296, lampe: true }, { type: 'chaise', x: 280 }, { type: 'lampe_plafond', x: 170 },
          { type: 'tapis', x: 150, w: 50, color: '#7a3b3b' },
        ],
        exits: [{ to: 'place', x: 24, kind: 'porte', label: 'Sortir' }],
        hotspots: [
          { id: 'lit', x: 200, label: 'Ton lit', activities: ['se_reposer'], endTick: true },
          { id: 'bureau', x: 296, label: 'Ton bureau', activities: ['etudier'] },
        ],
      },
      {
        id: 'place', name: 'La place du quartier', width: 520, kind: 'exterieur', time: 'jour', spawn: 60, ambient: 'ville',
        floor: { style: 'trottoir', color: '#4a4a52', color2: '#b9b2a6' },
        backdrop: [{ type: 'ville', x: 0 }],
        props: [
          { type: 'immeuble', x: 60, w: 90, h: 90, text: '12' }, { type: 'poubelle', x: 150 }, { type: 'arbre', x: 190 },
          { type: 'banc_public', x: 240 }, { type: 'lampadaire', x: 300 }, { type: 'maison', x: 410, w: 100 },
        ],
        exits: [{ to: 'maison', x: 60, label: 'Chez toi' }, { to: 'atelier', x: 410, label: 'L\'atelier' }],
        npcs: [{ id: 'alex', x: 240, face: 'gauche' }],
      },
      {
        id: 'atelier', name: 'L\'atelier de Morgane', width: 360, kind: 'interieur', spawn: 30, ambient: 'interieur',
        wall: { style: 'briques', color: '#9a5a44' }, floor: { style: 'beton', color: '#7d7d84' },
        props: [
          { type: 'porte', x: 24, label: 'SORTIE' }, { type: 'etagere', x: 110, y: 50, w: 40 }, { type: 'table', x: 180 },
          { type: 'comptoir', x: 296, w: 70 }, { type: 'lampe_plafond', x: 180 }, { type: 'horloge', x: 240, y: 40 },
        ],
        exits: [{ to: 'place', x: 24, kind: 'porte' }],
        npcs: [{ id: 'morgane', x: 296, face: 'gauche' }],
        hotspots: [{ id: 'etabli', x: 180, label: 'L\'établi', activities: ['travailler'], when: 'vu(rencontre_morgane)' }],
      },
    ],
    activities: [
      { id: 'travailler', label: 'Travailler à l\'atelier', description: 'Quelques heures payées, et l\'estime de Morgane.', cost: { actions: 1, energie: 20 }, effects: 'stat.argent += 40; stat.reputation += 2; rel.morgane += 1', feedback: 'Les heures passent vite quand on a les mains occupées.', maxPerTick: 2 },
      { id: 'se_reposer', label: 'Faire une sieste', description: 'Récupérer un peu d\'énergie.', cost: { actions: 1 }, effects: 'stat.energie += 25; stat.moral += 3', feedback: 'Tu te réveilles reposé.' },
      { id: 'etudier', label: 'Lire et apprendre', description: 'Un peu de culture pour faire bonne impression.', cost: { actions: 1, energie: 10 }, effects: 'stat.reputation += 1; stat.moral += 1', feedback: 'Une page de plus. Ça finira par payer.' },
    ],
    chapters: [
      { id: 'ch1', title: 'Les débuts', subtitle: 'Une nouvelle ville, une nouvelle vie', weeks: 4, location: 'maison' },
      { id: 'ch2', title: 'Le tournant', subtitle: 'Les choix commencent à peser', weeks: 4, intro: 'Quelques semaines ont passé. On commence à te connaître, ici.' },
    ],
    creation: {
      nameLabel: 'Ton prénom', defaultName: 'Camille', look: true,
      baseLook: { skin: 'peau3', hair: 'court', hairColor: 'brun', top: 'tshirt', topColor: '#2f9a4c', bottom: 'jean' },
      fields: [{
        id: 'caractere', label: 'Ton caractère', options: [
          { id: 'sociable', label: 'Sociable', description: 'Les gens viennent naturellement vers toi.', effects: 'rel.alex += 10; stat.moral += 5' },
          { id: 'travailleur', label: 'Travailleur', description: 'Tu ne lâches jamais rien.', effects: 'stat.reputation += 10; stat.energie -= 10' },
        ],
      }],
    },
    start: { location: 'maison', event: 'intro' },
    onTickEnd: 'stat.energie += 20; stat.moral -= 1; eloigner(alex, 1)',
    sheet: [{ title: 'Ta vie', rows: [{ label: 'Argent', value: '{nombre(stat.argent)} €' }, { label: 'Promesse faite à Alex', value: '{var.promesse ? "oui" : "non"}' }] }],
    events: [
      {
        id: 'intro', title: 'Premier matin', trigger: 'manual', script: [
          '!lieu maison',
          '> Premier matin dans ta nouvelle ville. Les cartons ne sont même pas défaits.',
          '!entrer alex gauche',
          'alex (content): Debout ! Je t\'avais dit que je passerais.',
          'alex: Alors, c\'est quoi le plan ?',
          '* Trouver du travail, et vite. #ambition ~ stat.reputation += 3',
          '  alex (surpris): Ambitieux dès le premier jour !',
          '* Profiter un peu de la ville avec toi. #amitie ~ rel.alex += 8; stat.moral += 5',
          '  alex (rire): Ça, c\'est mon ami !',
          'alex (pensif): Au fait… tu pourras m\'aider à repeindre mon futur café, un de ces jours ?',
          '* Promis, je serai là. #promesse ~ var.promesse = vrai; souvenir(alex, "promesse", "Tu as promis de l\'aider à repeindre son café"); planifier(alex_cafe, 3)',
          '* On verra, je ne promets rien. #prudent ~ rel.alex -= 4',
          'alex: Bon, je file. Passe à l\'atelier de Morgane, sur la place : elle cherche quelqu\'un.',
          '!sortir alex gauche',
          '~ objectif("atelier", "Rencontrer Morgane à l\'atelier")',
        ].join('\n'),
      },
      {
        id: 'rencontre_morgane', title: 'La patronne', trigger: 'enter:atelier', once: true, priority: 5, script: [
          'morgane (pensif): Tu dois être la personne dont Alex m\'a parlé.',
          'morgane: Ici, on travaille dur et on ne se plaint pas. Ça te va ?',
          '* Ça me va parfaitement. #serieux ~ rel.morgane += 6',
          '  morgane: On verra ça sur pièce.',
          '* Ça dépend du salaire. #argent ~ rel.morgane -= 4; stat.argent += 20',
          '  morgane (colere): Insolent… mais honnête. Tiens, une avance.',
          '~ objectifReussi("atelier")',
          '> Tu peux maintenant travailler à l\'établi.',
        ].join('\n'),
      },
      {
        id: 'alex_discussion', title: 'Discuter avec Alex', trigger: 'talk:alex', cooldown: 1, script: [
          'si var.promesse et non vu(alex_cafe)',
          '  alex (content): Le café avance ! Tu viendras bien m\'aider, hein ?',
          'sinon si rel.alex >= 50',
          '  alex (rire): Toi et moi, c\'est pour la vie, tu le sais ?',
          'sinon',
          '  alex: Tu bosses trop. Fais attention à toi.',
          '+ (stat.argent >= 10) Lui offrir un verre. ~ stat.argent -= 10; rel.alex += 3',
          '  alex (content): Merci, ça fait plaisir !',
          '+ Lui dire au revoir.',
        ].join('\n'),
      },
      {
        id: 'alex_cafe', title: 'Le jour du café', trigger: 'scheduled', script: [
          '!lieu place',
          '!rappel alex.promesse',
          'alex (inquiet): C\'est aujourd\'hui qu\'on repeint le café… Tu viens ?',
          '* (stat.energie >= 30) J\'arrive, pinceau à la main ! #promesse ~ rel.alex += 15; stat.energie -= 30; stat.moral += 5',
          '  alex (rire): Je savais que je pouvais compter sur toi !',
          '* Désolé, je suis épuisé. #trahison ~ rel.alex -= 15; oublier(alex, "promesse"); souvenir(alex, "lache", "Tu l\'as laissé tomber le jour du café")',
          '  alex (triste): … Je vois. Pas grave.',
        ].join('\n'),
      },
      {
        id: 'fatigue', title: 'Coup de fatigue', trigger: 'random', when: 'stat.energie < 45', cooldown: 2, script: [
          '> Tes paupières sont lourdes. Tu as du mal à te concentrer.',
          '~ stat.moral -= 4',
          '* Te forcer à continuer. #courage ~ stat.reputation += 1; stat.energie -= 5',
          '* T\'accorder une vraie pause. #prudent ~ stat.energie += 15; actions -= 1',
        ].join('\n'),
      },
      {
        id: 'proposition', title: 'La grosse commande', trigger: 'tick_start', chapters: ['ch2'], once: true, when: 'rel.morgane >= 5', script: [
          '!lieu atelier',
          'morgane (pensif): J\'ai une grosse commande. Si tu la réussis, je te confie l\'atelier le samedi.',
          '* Relever le défi. #ambition',
          '  test stat.reputation vs 30',
          '  si reussite',
          '    morgane (fier): Impeccable. Je savais que j\'avais fait le bon choix.',
          '    ~ stat.reputation += 15; rel.morgane += 10; stat.argent += 150; var.responsable = vrai',
          '  sinon',
          '    morgane (colere): Le client a tout renvoyé. On en reparlera.',
          '    ~ stat.reputation -= 5; rel.morgane -= 8',
          '* Refuser, ce n\'est pas pour toi. #prudent ~ rel.morgane -= 3',
          '  morgane: Dommage. L\'offre ne se représentera pas.',
        ].join('\n'),
      },
    ],
    endings: [
      {
        id: 'associe', title: 'L\'associé', type: 'heureuse', when: 'var.responsable et rel.morgane >= 10', priority: 3, location: 'atelier',
        summary: 'Morgane t\'a confié les clés de l\'atelier.',
        script: 'morgane (fier): {joueur.nom}, l\'atelier est à toi le samedi. Et peut-être un jour, tout entier.\n> Ta vie a pris racine ici.',
      },
      {
        id: 'inseparables', title: 'Inséparables', type: 'heureuse', when: 'rel.alex >= 55', priority: 2, location: 'place',
        summary: 'Le café d\'Alex porte une plaque à ton nom.',
        script: 'alex (rire): Le café porte ton nom sur une plaque, tu sais ?\n> Certaines amitiés valent toutes les carrières.',
      },
      {
        id: 'seul', title: 'Seul en ville', type: 'tragique', when: 'rel.alex < 20 et rel.morgane < 5', priority: 1, location: 'maison',
        summary: 'Personne ne t\'attend plus, ici.',
        script: '> Les cartons sont toujours là. Personne ne frappe plus à ta porte.',
      },
      {
        id: 'nouvelle_page', title: 'Une nouvelle page', type: 'neutre', priority: 0, location: 'place',
        summary: 'Une vie simple, ni regrets ni miracles.',
        script: '> La ville est devenue la tienne, sans bruit. La suite reste à écrire.',
      },
    ],
  };
}
