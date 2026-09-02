#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const directory = path.join(root, 'experiments/protected-eval/stage3-superqwen-semantic-contract-v2-20260902');
const schema = 'lunum-sem/0.1-draft';

const actor = (id) => ({ type: 'actor', id });
const concept = (id) => ({ type: 'concept', id });
const quantity = (value, unit) => ({ type: 'quantity', value, unit });
const date = (value) => ({ type: 'date', value });
const sem = (kind, clauses, extra = {}) => ({ schema, world: 'real', kind, clauses, ...extra });

const groups = [
  {
    id: 'pref-csv-digest',
    tags: ['preference', 'format-preservation'],
    goldSem: sem('preference', [{
      predicate: 'prefer',
      roles: { experiencer: actor('user'), theme: concept('csv'), object: concept('weekly_digest') },
      negated: false
    }]),
    protectedLiterals: {
      en: ['CSV', 'weekly digest'], el: ['CSV', 'εβδομαδιαία σύνοψη'], es: ['CSV', 'resumen semanal'],
      id: ['CSV', 'ringkasan mingguan'], fr: ['CSV', 'récapitulatif hebdomadaire'], de: ['CSV', 'Wochenzusammenfassung']
    },
    texts: {
      en: 'I prefer the weekly digest in CSV format.',
      el: 'Προτιμώ την εβδομαδιαία σύνοψη σε μορφή CSV.',
      es: 'Prefiero el resumen semanal en formato CSV.',
      id: 'Saya lebih memilih ringkasan mingguan dalam format CSV.',
      fr: 'Je préfère le récapitulatif hebdomadaire au format CSV.',
      de: 'Ich bevorzuge die Wochenzusammenfassung im CSV-Format.'
    }
  },
  {
    id: 'prohibit-address-publish',
    tags: ['safety', 'negation', 'critical-semantic-negative'],
    goldSem: sem('safety_constraint', [{
      predicate: 'publish',
      roles: { agent: actor('assistant'), object: concept('customer_addresses'), audience: concept('public_channel') },
      negated: true
    }]),
    protectedLiterals: {
      en: ['customer addresses', 'public channel'], el: ['διευθύνσεις πελατών', 'δημόσιο κανάλι'],
      es: ['direcciones de clientes', 'canal público'], id: ['alamat pelanggan', 'kanal publik'],
      fr: ['adresses des clients', 'canal public'], de: ['Kundenadressen', 'öffentlichen Kanal']
    },
    texts: {
      en: 'Do not publish customer addresses in the public channel.',
      el: 'Μην δημοσιεύσεις τις διευθύνσεις πελατών στο δημόσιο κανάλι.',
      es: 'No publiques las direcciones de clientes en el canal público.',
      id: 'Jangan publikasikan alamat pelanggan di kanal publik.',
      fr: 'Ne publie pas les adresses des clients sur le canal public.',
      de: 'Veröffentliche die Kundenadressen nicht im öffentlichen Kanal.'
    }
  },
  {
    id: 'obligation-rotate-key',
    tags: ['modality', 'date', 'obligation'],
    goldSem: sem('instruction', [{
      predicate: 'rotate', modality: 'obligation',
      roles: { agent: actor('nora'), object: concept('signing_key'), time: date('2026-11-30') },
      negated: false
    }]),
    protectedLiterals: {
      en: ['Nora', 'signing key', '2026-11-30'], el: ['Nora', 'κλειδί υπογραφής', '2026-11-30'],
      es: ['Nora', 'clave de firma', '2026-11-30'], id: ['Nora', 'kunci penandatanganan', '2026-11-30'],
      fr: ['Nora', 'clé de signature', '2026-11-30'], de: ['Nora', 'Signaturschlüssel', '2026-11-30']
    },
    texts: {
      en: 'Nora must rotate the signing key by 2026-11-30.',
      el: 'Η Nora πρέπει να αλλάξει το κλειδί υπογραφής έως τις 2026-11-30.',
      es: 'Nora debe rotar la clave de firma antes del 2026-11-30.',
      id: 'Nora wajib mengganti kunci penandatanganan sebelum 2026-11-30.',
      fr: 'Nora doit renouveler la clé de signature avant le 2026-11-30.',
      de: 'Nora muss den Signaturschlüssel bis zum 2026-11-30 rotieren.'
    }
  },
  {
    id: 'conditional-retry-batch',
    tags: ['condition', 'quantity', 'control-flow'],
    goldSem: sem('conditional_instruction', [{
      predicate: 'retry',
      roles: { agent: actor('assistant'), object: concept('upload_batch') },
      negated: false,
      conditions: [{ predicate: 'above', roles: { subject: concept('upload_queue'), value: quantity(80, 'items') }, negated: false }]
    }]),
    protectedLiterals: {
      en: ['80 items', 'upload batch'], el: ['80 στοιχεία', 'δέσμη μεταφόρτωσης'],
      es: ['80 elementos', 'lote de carga'], id: ['80 item', 'batch unggahan'],
      fr: ['80 éléments', 'lot de téléversement'], de: ['80 Elemente', 'Upload-Stapel']
    },
    texts: {
      en: 'If the upload queue exceeds 80 items, retry the upload batch.',
      el: 'Αν η ουρά μεταφόρτωσης ξεπεράσει τα 80 στοιχεία, επανάλαβε τη δέσμη μεταφόρτωσης.',
      es: 'Si la cola de carga supera los 80 elementos, reintenta el lote de carga.',
      id: 'Jika antrean unggahan melebihi 80 item, coba lagi batch unggahan tersebut.',
      fr: 'Si la file de téléversement dépasse 80 éléments, relance le lot de téléversement.',
      de: 'Wenn die Upload-Warteschlange 80 Elemente überschreitet, wiederhole den Upload-Stapel.'
    }
  },
  {
    id: 'belief-incident-resolved',
    tags: ['belief', 'modality', 'agent-binding'],
    goldSem: sem('belief_state', [{
      predicate: 'believe', modality: 'belief',
      roles: { experiencer: actor('operator'), theme: concept('incident_resolved') },
      negated: false
    }]),
    protectedLiterals: {
      en: ['operator', 'incident'], el: ['χειριστής', 'περιστατικό'], es: ['operador', 'incidente'],
      id: ['operator', 'insiden'], fr: ['opérateur', 'incident'], de: ['Bediener', 'Vorfall']
    },
    texts: {
      en: 'The operator believes that the incident is resolved.',
      el: 'Ο χειριστής πιστεύει ότι το περιστατικό έχει επιλυθεί.',
      es: 'El operador cree que el incidente está resuelto.',
      id: 'Operator percaya bahwa insiden tersebut telah diselesaikan.',
      fr: 'L’opérateur croit que l’incident est résolu.',
      de: 'Der Bediener glaubt, dass der Vorfall gelöst ist.'
    }
  },
  {
    id: 'reference-send-waiver',
    tags: ['references', 'role-binding', 'plan'],
    goldSem: sem('plan', [{
      predicate: 'send',
      roles: { agent: actor('priya'), recipient: actor('omar'), theme: concept('signed_waiver') },
      negated: false
    }], {
      references: [
        { referenceKind: 'semantic', type: 'pronoun', ref: 'priya' },
        { referenceKind: 'semantic', type: 'pronoun', ref: 'omar' }
      ]
    }),
    protectedLiterals: {
      en: ['Priya', 'Omar', 'signed waiver'], el: ['Priya', 'Omar', 'υπογεγραμμένη δήλωση'],
      es: ['Priya', 'Omar', 'renuncia firmada'], id: ['Priya', 'Omar', 'surat pelepasan yang ditandatangani'],
      fr: ['Priya', 'Omar', 'renonciation signée'], de: ['Priya', 'Omar', 'unterzeichnete Verzichtserklärung']
    },
    texts: {
      en: 'Priya told Omar that she would send him the signed waiver.',
      el: 'Η Priya είπε στον Omar ότι θα του έστελνε την υπογεγραμμένη δήλωση.',
      es: 'Priya le dijo a Omar que le enviaría la renuncia firmada.',
      id: 'Priya memberi tahu Omar bahwa dia akan mengirimkan surat pelepasan yang ditandatangani kepadanya.',
      fr: 'Priya a dit à Omar qu’elle lui enverrait la renonciation signée.',
      de: 'Priya sagte Omar, dass sie ihm die unterzeichnete Verzichtserklärung schicken werde.'
    }
  },
  {
    id: 'critical-send-jules-kim',
    tags: ['critical-semantic-negative', 'role-swap-pair', 'quantity'],
    goldSem: sem('simple_fact', [{
      predicate: 'send',
      roles: { agent: actor('jules'), recipient: actor('kim'), amount: quantity(30, 'eur') },
      negated: false
    }]),
    protectedLiterals: {
      en: ['Jules', 'Kim', '30 EUR'], el: ['Jules', 'Kim', '30 EUR'], es: ['Jules', 'Kim', '30 EUR'],
      id: ['Jules', 'Kim', '30 EUR'], fr: ['Jules', 'Kim', '30 EUR'], de: ['Jules', 'Kim', '30 EUR']
    },
    texts: {
      en: 'Jules sends 30 EUR to Kim.', el: 'Ο Jules στέλνει 30 EUR στην Kim.', es: 'Jules envía 30 EUR a Kim.',
      id: 'Jules mengirim 30 EUR kepada Kim.', fr: 'Jules envoie 30 EUR à Kim.', de: 'Jules schickt Kim 30 EUR.'
    }
  },
  {
    id: 'critical-send-kim-jules',
    tags: ['critical-semantic-negative', 'role-swap-pair', 'quantity'],
    goldSem: sem('simple_fact', [{
      predicate: 'send',
      roles: { agent: actor('kim'), recipient: actor('jules'), amount: quantity(30, 'eur') },
      negated: false
    }]),
    protectedLiterals: {
      en: ['Kim', 'Jules', '30 EUR'], el: ['Kim', 'Jules', '30 EUR'], es: ['Kim', 'Jules', '30 EUR'],
      id: ['Kim', 'Jules', '30 EUR'], fr: ['Kim', 'Jules', '30 EUR'], de: ['Kim', 'Jules', '30 EUR']
    },
    texts: {
      en: 'Kim sends 30 EUR to Jules.', el: 'Η Kim στέλνει 30 EUR στον Jules.', es: 'Kim envía 30 EUR a Jules.',
      id: 'Kim mengirim 30 EUR kepada Jules.', fr: 'Kim envoie 30 EUR à Jules.', de: 'Kim schickt Jules 30 EUR.'
    }
  },
  {
    id: 'critical-negated-archive',
    tags: ['critical-semantic-negative', 'negation', 'safety'],
    goldSem: sem('safety_constraint', [{
      predicate: 'archive',
      roles: { agent: actor('assistant'), object: concept('incident_archive') },
      negated: true
    }]),
    protectedLiterals: {
      en: ['archive', 'incident log'], el: ['αρχειοθετήσεις', 'αρχείο περιστατικού'],
      es: ['archives', 'registro del incidente'], id: ['mengarsipkan', 'log insiden'],
      fr: ['archives', 'journal d’incident'], de: ['archivierst', 'Vorfallsprotokoll']
    },
    texts: {
      en: 'Do not archive the incident log.',
      el: 'Μην αρχειοθετήσεις το αρχείο του περιστατικού.',
      es: 'No archives el registro del incidente.',
      id: 'Jangan mengarsipkan log insiden tersebut.',
      fr: 'N’archive pas le journal d’incident.',
      de: 'Archiviere das Vorfallsprotokoll nicht.'
    }
  },
  {
    id: 'abstain-vendor-exception',
    expectedOutcome: 'abstain',
    tags: ['abstention', 'missing-referent'],
    goldSem: null,
    protectedLiterals: {},
    texts: {
      en: 'Handle the vendor exception like before.',
      el: 'Χειρίσου την εξαίρεση του προμηθευτή όπως πριν.',
      es: 'Gestiona la excepción del proveedor como antes.',
      id: 'Tangani pengecualian vendor seperti sebelumnya.',
      fr: 'Traite l’exception du fournisseur comme avant.',
      de: 'Behandle die Ausnahme des Anbieters wie zuvor.'
    }
  },
  {
    id: 'abstain-less-noisy',
    expectedOutcome: 'abstain',
    tags: ['abstention', 'underspecified'],
    goldSem: null,
    protectedLiterals: {},
    texts: {
      en: 'Make the dashboard less noisy.',
      el: 'Κάνε τον πίνακα ελέγχου λιγότερο θορυβώδη.',
      es: 'Haz que el panel sea menos ruidoso.',
      id: 'Buat dasbor menjadi tidak terlalu bising.',
      fr: 'Rends le tableau de bord moins bruyant.',
      de: 'Mach das Dashboard weniger unruhig.'
    }
  }
];

const languages = ['en', 'el', 'es', 'id', 'fr', 'de'];
const rows = [];
for (const group of groups) {
  for (const language of languages) {
    rows.push({
      id: `${group.id}-${language}`,
      semanticGroup: group.id,
      sourceLanguage: language,
      sourceText: group.texts[language],
      goldSem: group.goldSem,
      ...(group.expectedOutcome ? { expectedOutcome: group.expectedOutcome } : {}),
      ...(group.protectedLiterals[language]?.length ? { protectedLiterals: group.protectedLiterals[language] } : {}),
      tags: [...group.tags, `language-${language}`]
    });
  }
}

if (rows.length !== 66 || new Set(rows.map((row) => row.id)).size !== rows.length) {
  throw new Error(`Unexpected fresh corpus shape: ${rows.length} rows`);
}
if (new Set(rows.map((row) => row.sourceText)).size !== rows.length) throw new Error('Source text is not unique');
if (!languages.every((language) => rows.filter((row) => row.sourceLanguage === language).length === 11)) {
  throw new Error('Language balance check failed');
}

await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'corpus.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ rows: rows.length, languages, groups: groups.length, abstentions: rows.filter((row) => row.expectedOutcome === 'abstain').length }));
