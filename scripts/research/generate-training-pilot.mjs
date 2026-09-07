#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateConceptDisjointSplits, validateTrainingExample, summarizeTrainingDataset } from './training-program.mjs';

const languages = ['en', 'el', 'es', 'fr', 'de', 'id'];
const frames = [
  ['prefer', 'preference', ['experiencer', 'theme'], ['The curator prefers concept', 'Ο επιμελητής προτιμά την έννοια', 'El curador prefiere el concepto', 'Le conservateur préfère le concept', 'Der Kurator bevorzugt das Konzept', 'Kurator lebih menyukai konsep']],
  ['send', 'event', ['agent', 'object', 'recipient'], ['The courier sends concept to the depot', 'Ο ταχυμεταφορέας στέλνει την έννοια στην αποθήκη', 'El mensajero envía el concepto al depósito', "Le coursier envoie le concept au dépôt", 'Der Kurier sendet das Konzept an das Depot', 'Kurir mengirim konsep ke depot']],
  ['receive', 'event', ['recipient', 'theme', 'source'], ['The depot receives concept from the courier', 'Η αποθήκη παραλαμβάνει την έννοια από τον ταχυμεταφορέα', 'El depósito recibe el concepto del mensajero', "Le dépôt reçoit le concept du coursier", 'Das Depot erhält das Konzept vom Kurier', 'Depot menerima konsep dari kurir']],
  ['publish', 'event', ['agent', 'object', 'destination'], ['The editor publishes concept publicly', 'Ο συντάκτης δημοσιεύει την έννοια δημόσια', 'El editor publica el concepto públicamente', "L'éditeur publie le concept publiquement", 'Der Redakteur veröffentlicht das Konzept öffentlich', 'Editor menerbitkan konsep secara publik']],
  ['enable', 'instruction', ['agent', 'theme'], ['The operator enables concept', 'Ο χειριστής ενεργοποιεί την έννοια', 'El operador habilita el concepto', "L'opérateur active le concept", 'Der Bediener aktiviert das Konzept', 'Operator mengaktifkan konsep']],
  ['delete', 'command', ['agent', 'theme'], ['The operator deletes concept', 'Ο χειριστής διαγράφει την έννοια', 'El operador elimina el concepto', "L'opérateur supprime le concept", 'Der Bediener löscht das Konzept', 'Operator menghapus konsep']]
];
const abstainReasons = ['unsupported', 'ambiguous', 'unresolved'];
const assignments = Array.from({ length: 120 }, (_, index) => {
  const split = index < 72 ? 'train' : index < 96 ? 'dev' : 'holdout';
  return { index, split };
});
const negativeDimensions = ['concept-identity', 'concept-identity', 'concept-identity', 'concept-identity', 'concept-identity', 'concept-identity'];
const negativePairs = Array.from({ length: 6 }, (_, index) => ({ pairId: `pilot-negative-${index + 1}`, leftGroup: index, rightGroup: index + 6, criticalDimension: negativeDimensions[index] }));
const pairForGroup = new Map(negativePairs.flatMap((pair) => [[pair.leftGroup, pair], [pair.rightGroup, pair]]));

function rowFor(groupIndex, split, language, frame, outcome = 'parse') {
  const [predicate, kind, roles, texts] = frame;
  const concept = `concept-${String(groupIndex).padStart(3, '0')}`;
  const group = `pilot-group-${String(groupIndex).padStart(3, '0')}`;
  const text = outcome === 'parse' ? `${texts[languages.indexOf(language)]} ${concept.replaceAll('-', ' ')}` : `${texts[languages.indexOf(language)]} unsupported-${concept}`;
  const ir = { world: 'real', kind, predicate, roles: Object.fromEntries(roles.map((role, i) => [role, { handle: `${role}-${String(groupIndex).padStart(3, '0')}`, type: i === 0 ? 'actor' : 'concept' }])), grounding: { status: 'unresolved', handles: [concept] } };
  const pair = pairForGroup.get(groupIndex);
  return { id: `${group}-${language}`, split, source: { text, language, semanticGroup: group, templateFamily: `pilot-${predicate}-${String(groupIndex).padStart(3, '0')}`, difficultyLevel: outcome === 'abstain' ? 7 : (groupIndex % 6) + 1, conceptIds: [concept], entityIds: [`actor-${String(groupIndex).padStart(3, '0')}`] }, target: outcome === 'parse' ? { outcome, ir, ...(pair ? { criticalNegativePairIds: [pair.pairId] } : {}) } : { outcome: 'abstain', abstentionReason: abstainReasons[groupIndex % abstainReasons.length] }, provenance: { sourceKind: 'synthetic', annotationMethod: 'deterministic-template-v1', license: 'CC0-1.0', createdAt: '2026-09-06T00:00:00Z', generatorVersion: 'training-pilot/0.1' }, review: { status: 'accepted', reviewers: ['deterministic-template-validator'] } };
}

export function generatePilot() {
  return assignments.flatMap(({ index, split }) => {
    const isParse = index < 108;
    const frame = frames[index % frames.length];
    return languages.map((language) => rowFor(index, split, language, frame, isParse ? 'parse' : 'abstain'));
  });
}

function main() {
  const output = process.argv[2] ?? 'experiments/training-pilot-20260908';
  const rows = generatePilot();
  const errors = rows.flatMap((row) => validateTrainingExample(row).map((error) => `${row.id}: ${error}`));
  errors.push(...validateConceptDisjointSplits(rows));
  if (errors.length) throw new Error(errors.join('\n'));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'dataset.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify({ type: 'openlunum-training-pilot', status: 'development-only', protected: false, localInferenceUsed: false, embeddingUsed: false, summary: summarizeTrainingDataset(rows), criticalNegativePairs: negativePairs.map((pair) => ({ ...pair, expectedRelationship: 'not_semantically_equivalent' })), splitPolicy: 'semanticGroup, templateFamily, concept, entity and source text disjoint', generatedBy: 'scripts/research/generate-training-pilot.mjs' }, null, 2)}\n`, { flag: 'wx' });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
