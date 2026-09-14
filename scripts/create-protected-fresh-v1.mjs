import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const outDir = path.join(root, 'experiments/protected-eval/fresh-v1-20260905');

const t = (type, id) => ({ type, id });
const q = (value, unit) => ({ type: 'quantity', value, unit });
const d = (value) => ({ type: 'date', value });
const cases = [
  ['prefer-concise', { kind: 'preference', predicate: 'prefer', roles: { experiencer: t('actor', 'user'), theme: t('concept', 'concise_answers') } }, { en: 'The user prefers concise answers.', el: 'Ο χρήστης προτιμά σύντομες απαντήσεις.', es: 'El usuario prefiere respuestas concisas.', fr: "L'utilisateur préfère des réponses concises.", de: 'Der Benutzer bevorzugt kurze Antworten.', id: 'Pengguna lebih menyukai jawaban singkat.' }],
  ['prefer-detailed', { kind: 'preference', predicate: 'prefer', roles: { experiencer: t('actor', 'editor'), theme: t('concept', 'detailed_citations') } }, { en: 'The editor prefers detailed citations.', el: 'Ο συντάκτης προτιμά λεπτομερείς παραπομπές.', es: 'El editor prefiere citas detalladas.', fr: "L'éditeur préfère des citations détaillées.", de: 'Der Redakteur bevorzugt ausführliche Zitate.', id: 'Editor lebih menyukai kutipan terperinci.' }],
  ['send-recipient', { kind: 'event', predicate: 'send', roles: { agent: t('actor', 'assistant'), object: t('document', 'report'), recipient: t('actor', 'manager') } }, { en: 'The assistant sends the report to the manager.', el: 'Ο βοηθός στέλνει την αναφορά στον διευθυντή.' }],
  ['send-destination', { kind: 'event', predicate: 'send', roles: { agent: t('actor', 'service'), object: t('document', 'backup'), destination: t('environment', 'archive_store') } }, { en: 'The service sends the backup to the archive store.', fr: 'Le service envoie la sauvegarde au stockage d’archives.' }],
  ['believe-policy', { kind: 'belief_state', predicate: 'believe', roles: { experiencer: t('actor', 'analyst'), theme: t('concept', 'policy_is_effective') } }, { en: 'The analyst believes the policy is effective.', el: 'Ο αναλυτής πιστεύει ότι η πολιτική είναι αποτελεσματική.', de: 'Der Analyst glaubt, dass die Richtlinie wirksam ist.' }],
  ['publish-bulletin', { kind: 'event', predicate: 'publish', roles: { agent: t('actor', 'publisher'), theme: t('document', 'maintenance_bulletin'), audience: t('group', 'customers') } }, { en: 'The publisher makes the maintenance bulletin available to customers.', es: 'El editor publica el boletín de mantenimiento para los clientes.' }],
  ['retry-upload', { kind: 'instruction', predicate: 'retry', roles: { agent: t('actor', 'worker'), count: q(3, 'attempts'), theme: t('concept', 'upload_report') } }, { en: 'The worker retries the report upload three times.', id: 'Pekerja mencoba lagi mengunggah laporan tiga kali.' }],
  ['enable-power', { kind: 'instruction', predicate: 'enable', roles: { agent: t('system', 'controller'), theme: t('feature', 'power_saving') } }, { en: 'The controller enables power saving.', el: 'Ο ελεγκτής ενεργοποιεί την εξοικονόμηση ενέργειας.', fr: 'Le contrôleur active les économies d’énergie.' }],
  ['disable-alerts', { kind: 'instruction', predicate: 'disable', roles: { agent: t('actor', 'operator'), theme: t('feature', 'test_alerts') } }, { en: 'The operator disables test alerts.', de: 'Der Bediener deaktiviert Testwarnungen.' }],
  ['delete-confirmed', { kind: 'safety_constraint', predicate: 'delete', roles: { agent: t('actor', 'assistant'), object: t('document', 'temporary_files') }, negated: true, conditions: [{ predicate: 'confirmed', roles: { agent: t('actor', 'user') }, negated: false }] }, { en: 'The assistant must not delete temporary files until the user confirms.', el: 'Ο βοηθός δεν πρέπει να διαγράψει τα προσωρινά αρχεία μέχρι να επιβεβαιώσει ο χρήστης.' }],
  ['confirm-deployment', { kind: 'event', predicate: 'confirm', roles: { agent: t('actor', 'release_manager'), theme: t('event', 'deployment') } }, { en: 'The release manager confirms the deployment.', es: 'El responsable de versiones confirma el despliegue.' }],
  ['deploy-production', { kind: 'event', predicate: 'deploy', roles: { agent: t('actor', 'release_manager'), destination: t('environment', 'production') } }, { en: 'The release manager deploys to production.', fr: 'Le responsable de publication déploie en production.', id: 'Manajer rilis melakukan deployment ke produksi.' }],
  ['receive-notification', { kind: 'event', predicate: 'receive', roles: { recipient: t('actor', 'user'), theme: t('document', 'notification'), source: t('system', 'monitor') } }, { en: 'The user receives a notification from the monitor.', el: 'Ο χρήστης λαμβάνει μια ειδοποίηση από την οθόνη παρακολούθησης.' }],
  ['deadline-release', { kind: 'project_state', predicate: 'deadline', roles: { subject: t('project', 'release'), time: d('2026-11-30') } }, { en: 'The release deadline is 2026-11-30.', de: 'Die Frist für die Veröffentlichung ist der 30.11.2026.' }],
  ['below-battery', { kind: 'simple_fact', predicate: 'below', roles: { subject: t('metric', 'battery_level'), value: q(20, 'percent') } }, { en: 'Battery level is below 20 percent.', el: 'Το επίπεδο μπαταρίας είναι κάτω από 20 τοις εκατό.', fr: 'Le niveau de batterie est inférieur à 20 pour cent.' }],
  ['above-capacity', { kind: 'simple_fact', predicate: 'above', roles: { subject: t('metric', 'storage_used'), value: q(90, 'percent') } }, { en: 'Storage use is above 90 percent.', es: 'El uso del almacenamiento supera el 90 por ciento.' }],
  ['before-review', { kind: 'simple_fact', predicate: 'before', roles: { subject: t('event', 'security_review'), object: t('event', 'deployment') } }, { en: 'The security review happens before the deployment.', id: 'Tinjauan keamanan terjadi sebelum deployment.' }],
  ['after-approval', { kind: 'simple_fact', predicate: 'after', roles: { subject: t('event', 'deployment'), object: t('event', 'approval') } }, { en: 'The deployment happens after approval.', el: 'Η ανάπτυξη γίνεται μετά την έγκριση.' }],
  ['allow-team', { kind: 'instruction', predicate: 'allow', roles: { agent: t('actor', 'administrator'), recipient: t('entity', 'team'), theme: t('concept', 'read_reports') }, modality: 'permission' }, { en: 'The administrator allows the team to read reports.', fr: "L’administrateur autorise l’équipe à lire les rapports." }],
  ['prohibit-public', { kind: 'safety_constraint', predicate: 'prohibit', roles: { agent: t('actor', 'administrator'), recipient: t('entity', 'public'), theme: t('concept', 'access_private_data') }, negated: true }, { en: 'The administrator prohibits the public from accessing private data.', de: 'Der Administrator verbietet der Öffentlichkeit den Zugriff auf private Daten.' }]
];

const rows = [];
for (const [group, spec, translations] of cases) {
  for (const [language, sourceText] of Object.entries(translations)) {
    const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: spec.kind, clauses: [{ predicate: spec.predicate, roles: spec.roles, negated: spec.negated ?? false, ...(spec.modality ? { modality: spec.modality } : {}), ...(spec.conditions ? { conditions: spec.conditions } : {}) }] };
    const atoms = [];
    if (group === 'send-recipient') atoms.push({ path: 'clauses[0].roles.recipient.id', value: 'manager' });
    if (group === 'deploy-production') atoms.push({ path: 'clauses[0].roles.destination.id', value: 'production' });
    if (group === 'deadline-release') atoms.push({ path: 'clauses[0].roles.time.value', value: '2026-11-30' });
    if (group === 'below-battery') atoms.push({ path: 'clauses[0].roles.value.value', value: 20 }, { path: 'clauses[0].roles.value.unit', value: 'percent' });
    if (group === 'allow-team') atoms.push({ path: 'clauses[0].roles.theme.id', value: 'read_reports' }, { path: 'clauses[0].roles.recipient.id', value: 'team' });
    rows.push({ id: `${group}-${language}`, semanticGroup: group, sourceLanguage: language, sourceText, goldSem: sem, expectedOutcome: 'parse', ...(atoms.length ? { protectedSemanticAtoms: atoms } : {}) });
  }
}
rows.push(
  { id: 'unframed-share-en', semanticGroup: 'unframed-abstention', sourceLanguage: 'en', sourceText: 'Share the report with the team.', goldSem: null, expectedOutcome: 'abstain', tags: ['registered-unframed'] },
  { id: 'unframed-share-el', semanticGroup: 'unframed-abstention', sourceLanguage: 'el', sourceText: 'Μοιράσου την αναφορά με την ομάδα.', goldSem: null, expectedOutcome: 'abstain', tags: ['registered-unframed'] },
  { id: 'unsupported-charge-en', semanticGroup: 'unsupported-abstention', sourceLanguage: 'en', sourceText: 'Charge the client 30 EUR.', goldSem: null, expectedOutcome: 'abstain', tags: ['unsupported-predicate'] },
  { id: 'unsupported-charge-el', semanticGroup: 'unsupported-abstention', sourceLanguage: 'el', sourceText: 'Χρέωσε τον πελάτη 30 EUR.', goldSem: null, expectedOutcome: 'abstain', tags: ['unsupported-predicate'] }
);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'corpus.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
await writeFile(path.join(outDir, 'README.md'), '# Fresh protected corpus v1\n\nParent-generated on 2026-09-05 after implementation freeze at `a89ec02`. No corpus subagent was available; independence is weaker than an independently generated holdout. This corpus must not be edited after preflight passes.\n', 'utf8');
console.log(JSON.stringify({ outDir, rows: rows.length, groups: new Set(rows.map((row) => row.semanticGroup)).size }));
