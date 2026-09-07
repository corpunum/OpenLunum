import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const outDir = path.join(root, 'experiments/protected-eval/fresh-v2-20260905');
const t = (type, id) => ({ type, id });
const q = (value, unit) => ({ type: 'quantity', value, unit });
const d = (value) => ({ type: 'date', value });
const sem = (kind, predicate, roles, extra = {}) => ({
  schema: 'lunum-sem/0.1-draft', world: 'real', kind,
  clauses: [{ predicate, roles, negated: extra.negated ?? false, ...(extra.modality ? { modality: extra.modality } : {}), ...(extra.conditions ? { conditions: extra.conditions } : {}) }]
});
const rows = [];
const pairs = [];
let multilingualGroupCount = 0;
function addGroup(group, spec, translations, atoms = []) {
  const entries = Object.entries(translations);
  const selected = entries.length > 2
    ? (multilingualGroupCount++ < 4 ? entries : entries.filter(([language]) => language === 'en' || language === 'el'))
    : entries;
  for (const [language, sourceText] of selected) {
    rows.push({ id: `${group}-${language}`, semanticGroup: group, sourceLanguage: language, sourceText, goldSem: sem(spec.kind, spec.predicate, spec.roles, spec), expectedOutcome: 'parse', ...(atoms.length ? { protectedSemanticAtoms: atoms } : {}) });
  }
}
function addPair(pairId, left, right, dimension) {
  rows.push({ ...left, expectedOutcome: 'parse' });
  rows.push({ ...right, expectedOutcome: 'parse' });
  pairs.push({ pairId, leftItemId: left.id, rightItemId: right.id, criticalDimension: dimension, expectedRelationship: 'not_semantically_equivalent' });
}

addGroup('mail-preference', { kind: 'preference', predicate: 'prefer', roles: { experiencer: t('actor', 'reviewer'), theme: t('concept', 'weekly_digest') } }, {
  en: 'The reviewer prefers the weekly digest.', el: 'Ο αξιολογητής προτιμά το εβδομαδιαίο ενημερωτικό δελτίο.', es: 'El revisor prefiere el boletín semanal.', fr: 'Le réviseur préfère le bulletin hebdomadaire.', de: 'Der Prüfer bevorzugt den Wochenbericht.', id: 'Peninjau lebih menyukai ringkasan mingguan.'
});
addGroup('invoice-delivery', { kind: 'event', predicate: 'send', roles: { agent: t('actor', 'billing_service'), object: t('document', 'invoice'), recipient: t('actor', 'supplier') } }, {
  en: 'The billing service sends the invoice to the supplier.', el: 'Η υπηρεσία τιμολόγησης στέλνει το τιμολόγιο στον προμηθευτή.', es: 'El servicio de facturación envía la factura al proveedor.', fr: 'Le service de facturation envoie la facture au fournisseur.', de: 'Der Abrechnungsdienst sendet die Rechnung an den Lieferanten.', id: 'Layanan penagihan mengirim faktur kepada pemasok.'
}, [{ path: 'clauses[0].roles.recipient.id', value: 'supplier' }]);
addGroup('package-arrival', { kind: 'event', predicate: 'receive', roles: { recipient: t('actor', 'warehouse'), theme: t('object', 'sample_package'), source: t('actor', 'courier') } }, {
  en: 'The warehouse receives the sample package from the courier.', el: 'Η αποθήκη λαμβάνει το δείγμα πακέτου από τον μεταφορέα.', es: 'El almacén recibe el paquete de muestra del mensajero.', fr: 'L’entrepôt reçoit le colis échantillon du coursier.', de: 'Das Lager erhält das Musterpaket vom Kurier.', id: 'Gudang menerima paket sampel dari kurir.'
});
addGroup('analyst-hypothesis', { kind: 'belief_state', predicate: 'believe', roles: { experiencer: t('actor', 'analyst'), theme: t('concept', 'forecast_is_reliable') } }, {
  en: 'The analyst believes the forecast is reliable.', el: 'Ο αναλυτής πιστεύει ότι η πρόβλεψη είναι αξιόπιστη.', es: 'El analista cree que el pronóstico es fiable.', fr: 'L’analyste croit que la prévision est fiable.', de: 'Der Analyst glaubt, dass die Prognose zuverlässig ist.', id: 'Analis percaya bahwa prakiraan itu dapat diandalkan.'
});
addGroup('public-notice', { kind: 'event', predicate: 'publish', roles: { agent: t('actor', 'newsroom'), theme: t('document', 'service_notice'), audience: t('group', 'subscribers') } }, {
  en: 'The newsroom publishes the service notice for subscribers.', el: 'Η αίθουσα σύνταξης δημοσιεύει την ανακοίνωση υπηρεσίας για τους συνδρομητές.', es: 'La redacción publica el aviso del servicio para los suscriptores.', fr: 'La rédaction publie l’avis de service pour les abonnés.', de: 'Die Redaktion veröffentlicht den Servicehinweis für Abonnenten.', id: 'Ruang redaksi menerbitkan pemberitahuan layanan untuk pelanggan.'
});
addGroup('thermal-control', { kind: 'conditional_instruction', predicate: 'enable', roles: { agent: t('system', 'thermostat'), theme: t('feature', 'cooling_mode') }, conditions: [{ predicate: 'above', roles: { subject: t('metric', 'room_temperature'), value: q(28, 'celsius') }, negated: false }] }, {
  en: 'If room temperature rises above 28 Celsius, enable cooling mode.', el: 'Αν η θερμοκρασία δωματίου ξεπεράσει τους 28 βαθμούς Κελσίου, ενεργοποίησε τη λειτουργία ψύξης.', es: 'Si la temperatura de la sala supera los 28 grados Celsius, activa el modo de refrigeración.', fr: 'Si la température de la pièce dépasse 28 degrés Celsius, activez le mode refroidissement.', de: 'Wenn die Raumtemperatur über 28 Grad Celsius steigt, aktiviere den Kühlmodus.', id: 'Jika suhu ruangan di atas 28 Celsius, aktifkan mode pendinginan.'
}, [{ path: 'clauses[0].conditions[0].roles.value.value', value: 28 }, { path: 'clauses[0].conditions[0].roles.value.unit', value: 'celsius' }]);
addGroup('telemetry-off', { kind: 'instruction', predicate: 'disable', roles: { agent: t('actor', 'operator'), theme: t('feature', 'debug_telemetry') } }, {
  en: 'The operator disables debug telemetry.', el: 'Ο χειριστής απενεργοποιεί την τηλεμετρία εντοπισμού σφαλμάτων.', es: 'El operador desactiva la telemetría de depuración.', fr: 'L’opérateur désactive la télémétrie de débogage.', de: 'Der Bediener deaktiviert die Debug-Telemetrie.', id: 'Operator menonaktifkan telemetri debug.'
});
addGroup('cache-safety', { kind: 'safety_constraint', predicate: 'delete', roles: { agent: t('actor', 'worker'), object: t('collection', 'stale_cache') }, negated: true, conditions: [{ predicate: 'confirmed', roles: { agent: t('actor', 'owner') }, negated: false }] }, {
  en: 'The worker must not delete the stale cache until the owner confirms.', el: 'Ο εργαζόμενος δεν πρέπει να διαγράψει την παλιά κρυφή μνήμη μέχρι να επιβεβαιώσει ο ιδιοκτήτης.', es: 'El trabajador no debe eliminar la caché antigua hasta que el propietario confirme.', fr: 'Le processus ne doit pas supprimer le cache obsolète avant la confirmation du propriétaire.', de: 'Der Worker darf den alten Cache erst löschen, wenn der Besitzer bestätigt.', id: 'Pekerja tidak boleh menghapus cache lama sampai pemilik mengonfirmasi.'
});
addGroup('staging-release', { kind: 'event', predicate: 'deploy', roles: { agent: t('actor', 'release_bot'), destination: t('environment', 'staging') } }, {
  en: 'The release bot deploys the candidate to staging.', el: 'Το bot έκδοσης αναπτύσσει την υποψήφια έκδοση στο περιβάλλον δοκιμών.', es: 'El bot de lanzamientos despliega la candidata en staging.', fr: 'Le bot de publication déploie la candidate en staging.', de: 'Der Release-Bot stellt die Kandidatin in der Staging-Umgebung bereit.', id: 'Bot rilis menerapkan kandidat ke staging.'
}, [{ path: 'clauses[0].roles.destination.id', value: 'staging' }]);
addGroup('migration-date', { kind: 'project_state', predicate: 'deadline', roles: { subject: t('project', 'catalog_migration'), time: d('2027-02-14') } }, {
  en: 'The catalog migration deadline is 2027-02-14.', el: 'Η προθεσμία για τη μεταφορά του καταλόγου είναι 2027-02-14.', es: 'La fecha límite de migración del catálogo es 2027-02-14.', fr: 'La date limite de migration du catalogue est le 2027-02-14.', de: 'Die Frist für die Katalogmigration ist der 14.02.2027.', id: 'Batas migrasi katalog adalah 2027-02-14.'
}, [{ path: 'clauses[0].roles.time.value', value: '2027-02-14' }]);
addGroup('audit-order', { kind: 'simple_fact', predicate: 'before', roles: { subject: t('event', 'privacy_audit'), object: t('event', 'data_export') } }, {
  en: 'The privacy audit occurs before the data export.', el: 'Ο έλεγχος απορρήτου γίνεται πριν από την εξαγωγή δεδομένων.', es: 'La auditoría de privacidad ocurre antes de la exportación de datos.', fr: 'L’audit de confidentialité a lieu avant l’exportation des données.', de: 'Das Datenschutzaudit findet vor dem Datenexport statt.', id: 'Audit privasi berlangsung sebelum ekspor data.'
});
addGroup('approval-order', { kind: 'simple_fact', predicate: 'after', roles: { subject: t('event', 'access_grant'), object: t('event', 'security_review') } }, {
  en: 'The access grant occurs after the security review.', el: 'Η παραχώρηση πρόσβασης γίνεται μετά τον έλεγχο ασφαλείας.', es: 'La concesión de acceso ocurre después de la revisión de seguridad.', fr: 'L’octroi de l’accès a lieu après la revue de sécurité.', de: 'Die Zugriffsfreigabe erfolgt nach der Sicherheitsprüfung.', id: 'Pemberian akses terjadi setelah tinjauan keamanan.'
});

addGroup('retry-snapshot', { kind: 'command', predicate: 'retry', roles: { agent: t('actor', 'backup_agent'), count: q(4, 'attempts'), theme: t('concept', 'snapshot_upload') } }, { en: 'The backup agent retries the snapshot upload four times.' }, [{ path: 'clauses[0].roles.count.value', value: 4 }, { path: 'clauses[0].roles.count.unit', value: 'attempts' }]);
addGroup('keep-public', { kind: 'instruction', predicate: 'keep', roles: { agent: t('actor', 'publisher'), theme: t('document', 'status_page'), visibility: t('visibility', 'public') } }, { en: 'The publisher keeps the status page public.' });
addGroup('confirm-release', { kind: 'event', predicate: 'confirm', roles: { agent: t('actor', 'coordinator'), theme: t('event', 'handoff') } }, { en: 'The coordinator confirms the handoff.' });
addGroup('permission-window', { kind: 'instruction', predicate: 'request', roles: { agent: t('actor', 'analyst'), theme: t('document', 'dataset'), recipient: t('actor', 'steward') }, modality: 'permission' }, { en: 'The analyst may request the dataset from the steward.' });
addGroup('no-external-access', { kind: 'safety_constraint', predicate: 'prohibit', roles: { agent: t('actor', 'guardian'), theme: t('concept', 'external_access'), recipient: t('entity', 'visitors') }, negated: true }, { en: 'The guardian prohibits visitors from using external access.' });
addGroup('vault-transfer', { kind: 'event', predicate: 'copy', roles: { agent: t('actor', 'archiver'), source: t('object', 'vault_record'), destination: t('object', 'cold_store') } }, { en: 'The archiver copies the vault record to cold storage.' });
addGroup('key-rotation', { kind: 'command', predicate: 'rotate', roles: { agent: t('actor', 'security_service'), theme: t('credential', 'signing_key') } }, { en: 'The security service rotates the signing key.' });
addGroup('queue-threshold', { kind: 'simple_fact', predicate: 'above', roles: { subject: t('metric', 'queue_depth'), value: q(600, 'items') } }, { en: 'The queue depth is above 600 items.' }, [{ path: 'clauses[0].roles.value.value', value: 600 }, { path: 'clauses[0].roles.value.unit', value: 'items' }]);
addGroup('latency-threshold', { kind: 'simple_fact', predicate: 'below', roles: { subject: t('metric', 'request_latency'), value: q(120, 'milliseconds') } }, { en: 'Request latency is below 120 milliseconds.' });
addGroup('edge-delivery', { kind: 'event', predicate: 'send', roles: { agent: t('actor', 'relay'), object: t('document', 'manifest'), destination: t('environment', 'edge_cluster') } }, { en: 'The relay sends the manifest to the edge cluster.' });
addGroup('recipient-alert', { kind: 'event', predicate: 'receive', roles: { recipient: t('actor', 'dispatcher'), theme: t('document', 'route_alert'), source: t('system', 'scanner') } }, { en: 'The dispatcher receives the route alert from the scanner.' });

const pairBase = (id, group, sourceText, goldSem, atoms = []) => ({ id, semanticGroup: group, sourceLanguage: 'en', sourceText, goldSem, ...(atoms.length ? { protectedSemanticAtoms: atoms } : {}) });
addPair('negative-negation', pairBase('negation-open', 'negative-negation-left', 'The publisher keeps the notice public.', sem('instruction', 'keep', { agent: t('actor', 'publisher'), theme: t('document', 'notice'), visibility: t('visibility', 'public') })), pairBase('negation-closed', 'negative-negation-right', 'The publisher does not keep the notice public.', sem('instruction', 'keep', { agent: t('actor', 'publisher'), theme: t('document', 'notice'), visibility: t('visibility', 'public') }, { negated: true })), 'negation');
addPair('negative-modality', pairBase('modality-must', 'negative-modality-left', 'The coordinator must request the permit from the steward.', sem('instruction', 'request', { agent: t('actor', 'coordinator'), theme: t('document', 'permit'), recipient: t('actor', 'steward') }, { modality: 'obligation' })), pairBase('modality-may', 'negative-modality-right', 'The coordinator may request the permit from the steward.', sem('instruction', 'request', { agent: t('actor', 'coordinator'), theme: t('document', 'permit'), recipient: t('actor', 'steward') }, { modality: 'permission' })), 'modality');
addPair('negative-direction', pairBase('direction-before', 'negative-direction-left', 'The inspection occurs before the export.', sem('simple_fact', 'before', { subject: t('event', 'inspection'), object: t('event', 'export') })), pairBase('direction-after', 'negative-direction-right', 'The inspection occurs after the export.', sem('simple_fact', 'after', { subject: t('event', 'inspection'), object: t('event', 'export') })), 'temporal-direction');
addPair('negative-quantity', pairBase('quantity-five', 'negative-quantity-left', 'The agent retries five times.', sem('command', 'retry', { agent: t('actor', 'agent'), count: q(5, 'attempts') })), pairBase('quantity-fifty', 'negative-quantity-right', 'The agent retries fifty times.', sem('command', 'retry', { agent: t('actor', 'agent'), count: q(50, 'attempts') })), 'quantity');
addPair('negative-unit', pairBase('unit-percent', 'negative-unit-left', 'The reading is below 30 percent.', sem('simple_fact', 'below', { subject: t('metric', 'reading'), value: q(30, 'percent') })), pairBase('unit-celsius', 'negative-unit-right', 'The reading is below 30 Celsius.', sem('simple_fact', 'below', { subject: t('metric', 'reading'), value: q(30, 'celsius') })), 'unit');
addPair('negative-environment', pairBase('environment-production', 'negative-environment-left', 'The release bot deploys to production.', sem('event', 'deploy', { agent: t('actor', 'release_bot'), destination: t('environment', 'production') })), pairBase('environment-staging', 'negative-environment-right', 'The release bot deploys to staging.', sem('event', 'deploy', { agent: t('actor', 'release_bot'), destination: t('environment', 'staging') })), 'environment');
addPair('negative-visibility', pairBase('visibility-public', 'negative-visibility-left', 'The publisher keeps the notice public.', sem('instruction', 'keep', { agent: t('actor', 'publisher'), theme: t('document', 'notice'), visibility: t('visibility', 'public') })), pairBase('visibility-private', 'negative-visibility-right', 'The publisher keeps the notice private.', sem('instruction', 'keep', { agent: t('actor', 'publisher'), theme: t('document', 'notice'), visibility: t('visibility', 'private') })), 'visibility');
addPair('negative-role', pairBase('role-agent', 'negative-role-left', 'The relay sends the manifest to the owner.', sem('event', 'send', { agent: t('actor', 'relay'), object: t('document', 'manifest'), recipient: t('actor', 'owner') })), pairBase('role-recipient', 'negative-role-right', 'The owner sends the manifest to the relay.', sem('event', 'send', { agent: t('actor', 'owner'), object: t('document', 'manifest'), recipient: t('actor', 'relay') })), 'agent-recipient');
addPair('negative-source-destination', pairBase('source-destination', 'negative-source-destination-left', 'The archiver copies the record from the vault to cold storage.', sem('event', 'copy', { agent: t('actor', 'archiver'), source: t('object', 'vault_record'), destination: t('object', 'cold_store') })), pairBase('destination-source', 'negative-source-destination-right', 'The archiver copies the record from cold storage to the vault.', sem('event', 'copy', { agent: t('actor', 'archiver'), source: t('object', 'cold_store'), destination: t('object', 'vault_record') })), 'source-destination');
addPair('negative-date', pairBase('date-february', 'negative-date-left', 'The migration deadline is 2027-02-14.', sem('project_state', 'deadline', { subject: t('project', 'catalog_migration'), time: d('2027-02-14') })), pairBase('date-march', 'negative-date-right', 'The migration deadline is 2027-03-14.', sem('project_state', 'deadline', { subject: t('project', 'catalog_migration'), time: d('2027-03-14') })), 'date');

for (const [id, language, sourceText, tag] of [
  ['abstain-share-en', 'en', 'Share the draft with the committee.', 'registered-unframed'],
  ['abstain-share-el', 'el', 'Μοιράσου το σχέδιο με την επιτροπή.', 'registered-unframed'],
  ['abstain-charge-en', 'en', 'Charge the account 30 EUR.', 'unsupported'],
  ['abstain-charge-el', 'el', 'Χρέωσε τον λογαριασμό 30 EUR.', 'unsupported'],
  ['abstain-interpret-en', 'en', 'It might refer to the old schedule, but the reference is unclear.', 'uncertain'],
  ['abstain-interpret-el', 'el', 'Ίσως αναφέρεται στο παλιό πρόγραμμα, αλλά η αναφορά είναι ασαφής.', 'uncertain']
]) rows.push({ id, semanticGroup: `abstention-${tag}`, sourceLanguage: language, sourceText, goldSem: null, expectedOutcome: 'abstain', tags: [tag] });

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'corpus.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
await writeFile(path.join(outDir, 'critical-negative-pairs.json'), `${JSON.stringify(pairs, null, 2)}\n`, 'utf8');
await writeFile(path.join(outDir, 'experiment.json'), `${JSON.stringify({ schema: 'openlunum-experiment/0.1', id: 'protected-fresh-v2-20260905', area: 'multilingual-parse', task: 'parse', hypothesis: 'A frozen model-independent Lunum protocol extracts unseen multilingual meaning into stable identities and rejects critical semantic collapse.', baselineCommit: '7427150384fecc90586727953955f5cbf3af99bb', dataset: { path: 'experiments/protected-eval/fresh-v2-20260905/corpus.jsonl', sha256: 'TO_BE_FILLED_AFTER_PREFLIGHT' }, criticalNegativePairs: { path: 'experiments/protected-eval/fresh-v2-20260905/critical-negative-pairs.json', count: pairs.length }, modelProfile: 'profiles/models/superqwen3.8-27b-abliterated-live.json', limits: { maxItems: rows.length, maxAttemptsPerItem: 1, maxModelCalls: rows.length }, gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false }, outputDirectory: 'reports/experiments/protected-fresh-v2-20260905', evidenceClass: 'protected', implementationCommit: '7427150384fecc90586727953955f5cbf3af99bb' }, null, 2)}\n`, 'utf8');
await writeFile(path.join(outDir, 'README.md'), '# Fresh protected corpus v2\n\nParent-generated on 2026-09-05 after freezing implementation `7427150`. No independent corpus agent was available; this limitation is explicit. Sentences and semantic structures are newly authored and do not reuse the retired corpus. Critical-negative judgments are stored separately and must be preflighted before model contact.\n', 'utf8');
await writeFile(path.join(outDir, 'CLAIM.md'), '# Evidence claim\n\nThis corpus is a first frozen empirical evaluation of OpenLunum extraction and multilingual convergence. It is parent-generated because no independent evaluator subagent was available. Any implementation change after corpus freeze permanently makes this corpus diagnostic only.\n', 'utf8');
console.log(JSON.stringify({ outDir, rows: rows.length, semanticGroups: new Set(rows.map((row) => row.semanticGroup)).size, multilingualGroups: new Set(rows.filter((row) => row.sourceLanguage !== 'en' && row.expectedOutcome === 'parse').map((row) => row.semanticGroup)).size, abstentionTargets: rows.filter((row) => row.expectedOutcome === 'abstain').length, criticalNegativePairs: pairs.length }));
