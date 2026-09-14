#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'experiments/natural-development-v1');
const languages = ['en', 'el', 'es', 'fr', 'de', 'id'];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

const groups = [
  {
    id: 'allow-archive', pair: 'allow-prohibit-archive', template: 'natural-permission',
    target: { outcome: 'parse', ir: { world: 'real', kind: 'event', predicate: 'allow', roles: { agent: { handle: 'security-officer', type: 'actor' }, recipient: { handle: 'contractor', type: 'actor' }, theme: { handle: 'archive-access', type: 'concept' } } } },
    text: {
      en: 'The security officer allows the contractor to access the archive.',
      el: 'Ο υπεύθυνος ασφαλείας επιτρέπει στον εργολάβο να έχει πρόσβαση στο αρχείο.',
      es: 'El responsable de seguridad permite al contratista acceder al archivo.',
      fr: 'L’agent de sécurité autorise le contractant à accéder aux archives.',
      de: 'Der Sicherheitsbeauftragte erlaubt dem Auftragnehmer den Zugriff auf das Archiv.',
      id: 'Petugas keamanan mengizinkan kontraktor mengakses arsip.'
    }
  },
  {
    id: 'prohibit-archive', pair: 'allow-prohibit-archive', template: 'natural-permission',
    target: { outcome: 'parse', ir: { world: 'real', kind: 'event', predicate: 'prohibit', roles: { agent: { handle: 'security-officer', type: 'actor' }, recipient: { handle: 'contractor', type: 'actor' }, theme: { handle: 'archive-access', type: 'concept' } } } },
    text: {
      en: 'The security officer prohibits the contractor from accessing the archive.',
      el: 'Ο υπεύθυνος ασφαλείας απαγορεύει στον εργολάβο να έχει πρόσβαση στο αρχείο.',
      es: 'El responsable de seguridad prohíbe al contratista acceder al archivo.',
      fr: 'L’agent de sécurité interdit au contractant d’accéder aux archives.',
      de: 'Der Sicherheitsbeauftragte verbietet dem Auftragnehmer den Zugriff auf das Archiv.',
      id: 'Petugas keamanan melarang kontraktor mengakses arsip.'
    }
  },
  {
    id: 'publish-audit', pair: 'publish-withhold-audit', template: 'natural-publication',
    target: { outcome: 'parse', ir: { world: 'real', kind: 'event', predicate: 'publish', roles: { agent: { handle: 'editor', type: 'actor' }, theme: { handle: 'audit-report', type: 'concept' } } } },
    text: {
      en: 'The editor publishes the audit report for the public.',
      el: 'Ο συντάκτης δημοσιεύει την έκθεση ελέγχου για το κοινό.',
      es: 'El editor publica el informe de auditoría para el público.',
      fr: 'Le rédacteur publie le rapport d’audit pour le public.',
      de: 'Der Redakteur veröffentlicht den Prüfbericht für die Öffentlichkeit.',
      id: 'Editor menerbitkan laporan audit untuk umum.'
    }
  },
  {
    id: 'withhold-audit', pair: 'publish-withhold-audit', template: 'natural-publication',
    target: { outcome: 'parse', ir: { world: 'real', kind: 'event', predicate: 'publish', negated: true, roles: { agent: { handle: 'editor', type: 'actor' }, theme: { handle: 'audit-report', type: 'concept' } } } },
    text: {
      en: 'The editor does not publish the audit report for the public.',
      el: 'Ο συντάκτης δεν δημοσιεύει την έκθεση ελέγχου για το κοινό.',
      es: 'El editor no publica el informe de auditoría para el público.',
      fr: 'Le rédacteur ne publie pas le rapport d’audit pour le public.',
      de: 'Der Redakteur veröffentlicht den Prüfbericht nicht für die Öffentlichkeit.',
      id: 'Editor tidak menerbitkan laporan audit untuk umum.'
    }
  },
  {
    id: 'retry-five', pair: 'retry-count-upload', template: 'natural-quantity',
    target: { outcome: 'parse', ir: { world: 'real', kind: 'event', predicate: 'retry', roles: { agent: { handle: 'operator', type: 'actor' }, theme: { handle: 'file-upload', type: 'concept' }, count: { type: 'quantity', value: 5, unit: 'times' } } } },
    text: {
      en: 'The operator retries the upload five times.',
      el: 'Ο χειριστής επαναλαμβάνει τη μεταφόρτωση πέντε φορές.',
      es: 'El operador repite la carga cinco veces.',
      fr: 'L’opérateur relance le téléversement cinq fois.',
      de: 'Der Bediener wiederholt den Upload fünfmal.',
      id: 'Operator mengulangi pengunggahan lima kali.'
    }
  },
  {
    id: 'retry-fifty', pair: 'retry-count-upload', template: 'natural-quantity',
    target: { outcome: 'parse', ir: { world: 'real', kind: 'event', predicate: 'retry', roles: { agent: { handle: 'operator', type: 'actor' }, theme: { handle: 'file-upload', type: 'concept' }, count: { type: 'quantity', value: 50, unit: 'times' } } } },
    text: {
      en: 'The operator retries the upload fifty times.',
      el: 'Ο χειριστής επαναλαμβάνει τη μεταφόρτωση πενήντα φορές.',
      es: 'El operador repite la carga cincuenta veces.',
      fr: 'L’opérateur relance le téléversement cinquante fois.',
      de: 'Der Bediener wiederholt den Upload fünfzigmal.',
      id: 'Operator mengulangi pengunggahan lima puluh kali.'
    }
  },
  {
    id: 'ambiguous-bank', pair: null, template: 'natural-ambiguity',
    target: { outcome: 'abstain', abstentionReason: 'ambiguous' },
    text: {
      en: 'The manager met the client by the bank after the meeting.',
      el: 'Ο διευθυντής συνάντησε τον πελάτη κοντά στην τράπεζα μετά τη συνάντηση.',
      es: 'El gerente se reunió con el cliente junto al banco después de la reunión.',
      fr: 'Le directeur a rencontré le client près de la banque après la réunion.',
      de: 'Der Manager traf den Kunden nach dem Treffen bei der Bank.',
      id: 'Manajer bertemu klien di dekat bank setelah rapat.'
    }
  }
];

const rows = [];
for (const group of groups) for (const language of languages) {
  const critical = group.pair ? [group.pair] : [];
  rows.push({
    id: `natural-${group.id}-${language}`,
    split: 'dev',
    source: { text: group.text[language], language, semanticGroup: group.id, templateFamily: group.template, difficultyLevel: group.pair ? (group.id.startsWith('retry') ? 3 : 2) : 7, conceptIds: group.pair ? [group.id] : [], entityIds: group.pair ? ['human-role-context'] : [] },
    target: { ...group.target, ...(critical.length ? { criticalNegativePairIds: critical } : {}) },
    provenance: { sourceKind: 'human-authored-development', annotationMethod: 'explicit-proposition-authoring', license: 'CC0-1.0', createdAt: '2026-09-07T00:00:00Z', generatorVersion: 'natural-development-v1' },
    review: { status: 'needs-review', reviewers: ['independent-review-pending'] }
  });
}

fs.mkdirSync(root, { recursive: true });
const datasetFile = path.join(root, 'dataset.jsonl');
const content = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
fs.writeFileSync(datasetFile, content, { flag: 'wx' });
const manifest = {
  format: 'openlunum-natural-development/0.1', status: 'awaiting-independent-review', datasetSha256: hash(content), rows: rows.length,
  semanticGroups: groups.length, languages, contrastFamilies: groups.filter((group) => group.pair).map((group) => group.pair).filter((pair, index, all) => all.indexOf(pair) === index),
  abstentionGroups: groups.filter((group) => !group.pair).map((group) => group.id),
  authoringPolicy: 'Natural multilingual development-only examples with explicit source-visible contrasts; no protected evaluation or training use.'
};
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ datasetFile, manifestFile: path.join(root, 'manifest.json'), ...manifest }, null, 2));
