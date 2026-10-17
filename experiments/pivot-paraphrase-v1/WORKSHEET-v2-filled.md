# Meaning clusters, worksheet v2: filled by models (owner-delegated)

**Level (b), model consensus, owner-delegated on 2026-10-17 (relayed by corpunum-6b). Not owner gold.** Judges: SuperGemma (Google lineage, ROG Ally) and Sol 6.1 medium (OpenAI), blind and independent; Qwen 3.8 Flash (Alibaba, local) broke ties. Gold = A and B agree, or C matches one of them. Pre-registration and amendments: [PREREGISTRATION.md](PREREGISTRATION.md); all labels: [gold.json](gold.json).

A–B agreement 0.801, Cohen's kappa 0.634; false "same" on the 40 control pairs: 0 for both judges (all 40 controls labelled different). Gold over 176 pairs and seed checks: 128 same, 27 broader/narrower, 8 different, 13 unresolved.

Columns A/B/C are SuperGemma / Sol / Qwen (– = not asked).

## s01: "call the police"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| call the police *(seed)* | καλώ την αστυνομία | S | D | S | **same** |
| alert the police | ειδοποιώ την αστυνομία | S | S | – | **same** |
| call the cops | καλώ την αστυνομία | S | S | – | **same** |
| call the police | παίρνω τηλέφωνο την αστυνομία | X | S | S | **same** |
| call the police | ειδοποιώ την αστυνομία | B | S | D | **UNRESOLVED (owner)** |
| notify the police | ειδοποιώ την αστυνομία | S | S | – | **same** |
| notify the police | καλώ την αστυνομία | S | S | – | **same** |
| phone the police | καλώ την αστυνομία | S | S | – | **same** |

## s02: "telephone someone"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| telephone someone *(seed)* | τηλεφωνώ σε κάποιον | S | S | – | **same** |
| call someone | καλώ κάποιον | S | S | – | **same** |

## s03: "at the same time"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| at the same time *(seed)* | ταυτόχρονα | S | S | – | **same** |
| at once | άμεσα | S | S | – | **same** |
| at once | ταυτόχρονα | D | S | D | **different** |
| at the same time | ενώ | B | B | – | **broader/narrower** |
| at the same time | άμεσα | D | D | – | **different** |
| at the same time | παράλληλα | S | S | – | **same** |
| in parallel | παράλληλα | S | S | – | **same** |
| in parallel | ταυτόχρονα | S | S | – | **same** |
| in tandem | παράλληλα | S | S | – | **same** |
| meanwhile | εν τω μεταξύ | S | S | – | **same** |
| simultaneously | ταυτόχρονα | S | S | – | **same** |
| while | ταυτόχρονα | S | B | B | **broader/narrower** |
| while | ενώ | S | S | – | **same** |

## s04: "must"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| must *(seed)* | πρέπει να | S | S | – | **same** |
| have to | πρέπει να | S | S | – | **same** |
| have to | χρειάζεται να | S | S | – | **same** |
| must | θα πρέπει να | S | S | – | **same** |
| must | πρέπει | S | S | – | **same** |
| must be | πρέπει να είναι | S | S | – | **same** |
| must be | πρέπει να | S | B | D | **UNRESOLVED (owner)** |
| need to | χρειάζεται να | B | S | S | **same** |
| need to | πρέπει να | S | S | – | **same** |
| ought to | πρέπει να | S | S | – | **same** |
| should | πρέπει να | S | S | – | **same** |
| should | πρέπει | B | S | S | **same** |
| should | θα έπρεπε να | S | S | – | **same** |

## s05: "human rights"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| human rights *(seed)* | ανθρώπινα δικαιώματα | S | S | – | **same** |
| basic human rights | ανθρώπινα δικαιώματα | S | B | B | **broader/narrower** |
| basic rights | βασικά δικαιώματα | S | S | – | **same** |
| civil liberties | ανθρώπινα δικαιώματα | B | B | – | **broader/narrower** |
| civil rights | πολιτικά δικαιώματα | B | S | B | **broader/narrower** |
| fundamental rights | ανθρώπινα δικαιώματα | S | B | B | **broader/narrower** |
| fundamental rights | θεμελιώδη δικαιώματα | S | S | – | **same** |
| human dignity | ανθρώπινα δικαιώματα | D | D | – | **different** |
| human rights | δικαιώματα του ανθρώπου | S | S | – | **same** |
| human rights | θεμελιώδη δικαιώματα | B | B | – | **broader/narrower** |
| human rights | βασικά ανθρώπινα δικαιώματα | B | B | – | **broader/narrower** |
| rights and freedoms | δικαιώματα και ελευθερίες | S | S | – | **same** |
| rights and freedoms | ανθρώπινα δικαιώματα | S | B | B | **broader/narrower** |

## s06: "delete the file"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| delete the file *(seed)* | διαγράφω το αρχείο | S | S | – | **same** |

## s07: "restart the service"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| restart the service *(seed)* | επανεκκινώ την υπηρεσία | S | S | – | **same** |

## s08: "deadline"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| deadline *(seed)* | προθεσμία | S | S | – | **same** |
| deadline | καταληκτική ημερομηνία | S | S | – | **same** |
| deadline | λήξη | S | B | B | **broader/narrower** |
| deadline | χρονικό όριο | S | S | – | **same** |
| final date | τελική ημερομηνία | S | S | – | **same** |
| last day | τελευταία ημέρα | S | S | – | **same** |
| target date | προθεσμία | S | B | B | **broader/narrower** |
| time limit | χρονικό όριο | S | S | – | **same** |
| time limit | προθεσμία | S | S | – | **same** |

## s09: "approve"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| approve *(seed)* | εγκρίνω | S | S | – | **same** |
| accept | εγκρίνω | B | B | – | **broader/narrower** |
| accept | αποδέχομαι | S | S | – | **same** |
| approve | επιτρέπω | S | I | D | **UNRESOLVED (owner)** |
| approve | αποδέχομαι | S | B | D | **UNRESOLVED (owner)** |
| authorize | εγκρίνω | S | S | – | **same** |
| authorize | εξουσιοδοτώ | S | S | – | **same** |
| authorize | επιτρέπω | S | S | – | **same** |
| endorse | εγκρίνω | S | S | – | **same** |
| endorse | υποστηρίζω | S | S | – | **same** |
| give the go-ahead | δίνω το πράσινο φως | S | S | – | **same** |
| pass | περνάω | S | S | – | **same** |
| sanction | εγκρίνω | S | S | – | **same** |

## s10: "refuse"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| refuse *(seed)* | αρνούμαι | S | S | – | **same** |
| decline | αρνούμαι | B | S | S | **same** |
| deny | αρνούμαι | S | S | – | **same** |
| deny | αρνείται | S | S | – | **same** |
| refuse | αρνείται | S | S | – | **same** |
| refuse | αρνιέμαι | S | S | – | **same** |
| reject | αρνούμαι | S | S | – | **same** |
| reject | απορρίπτω | S | S | – | **same** |

## s11: "in my opinion"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| in my opinion *(seed)* | κατά τη γνώμη μου | S | S | – | **same** |
| as far as i'm concerned | όσον αφορά εμένα | S | S | – | **same** |
| as far as i'm concerned | κατά τη γνώμη μου | S | S | – | **same** |
| i believe | κατά τη γνώμη μου | S | S | – | **same** |
| i believe | εγώ πιστεύω | S | S | – | **same** |
| i think | νομίζω | S | S | – | **same** |
| i think | κατά τη γνώμη μου | S | S | – | **same** |
| in my opinion | για μένα | S | S | – | **same** |
| in my opinion | νομίζω | S | S | – | **same** |
| in my opinion | εγώ πιστεύω | S | S | – | **same** |
| in my view | κατά τη γνώμη μου | S | S | – | **same** |
| personally | για μένα | S | B | I | **UNRESOLVED (owner)** |
| to my mind | κατά τη γνώμη μου | S | S | – | **same** |

## s12: "as soon as possible"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| as soon as possible *(seed)* | το συντομότερο δυνατό | S | S | – | **same** |
| as quickly as possible | το συντομότερο δυνατό | S | S | – | **same** |
| as quickly as possible | όσο πιο γρήγορα | S | S | – | **same** |
| as soon as possible | άμεσα | S | S | – | **same** |
| as soon as possible | όσο πιο γρήγορα | S | S | – | **same** |
| as soon as possible | αμέσως | S | B | B | **broader/narrower** |
| as soon as possible | χωρίς καθυστέρηση | S | S | – | **same** |
| as soon as possible | γρήγορα | S | B | D | **UNRESOLVED (owner)** |
| at once | αμέσως | S | S | – | **same** |
| at the earliest opportunity | το συντομότερο δυνατό | S | S | – | **same** |
| promptly | άμεσα | S | S | – | **same** |
| right away | γρήγορα | S | D | D | **different** |
| without delay | χωρίς καθυστέρηση | S | S | – | **same** |

## s13: "ask for help"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| ask for help *(seed)* | ζητώ βοήθεια | S | S | – | **same** |
| need assistance | χρειάζομαι βοήθεια | B | S | S | **same** |

## s14: "agree"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| agree *(seed)* | συμφωνώ | S | S | – | **same** |
| accept | συμφωνώ | B | I | B | **broader/narrower** |
| agree | αποδέχομαι | D | I | B | **UNRESOLVED (owner)** |
| agree | εγκρίνω | S | I | D | **UNRESOLVED (owner)** |
| agree | εγκρίνουμε | B | I | D | **UNRESOLVED (owner)** |
| approve | εγκρίνουμε | S | B | S | **same** |
| approve | συμφωνώ | S | I | B | **UNRESOLVED (owner)** |
| assent | συμφωνώ | S | S | – | **same** |
| concur | συμφωνώ | S | S | – | **same** |
| consent | συμφωνώ | S | S | – | **same** |
| see eye to eye | συμφωνώ | S | S | – | **same** |

## s15: "postpone"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| postpone *(seed)* | αναβάλλω | S | S | – | **same** |
| defer | αναβάλλω | S | S | – | **same** |
| delay | αναβάλλω | S | B | D | **UNRESOLVED (owner)** |
| postpone | αναβάλλω επ' αόριστον | B | B | – | **broader/narrower** |
| postpone | να το αναβάλουμε | S | S | – | **same** |
| put off | αναβάλλω | S | S | – | **same** |

## s16: "citizens"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| citizens *(seed)* | πολίτες | S | S | – | **same** |
| citizen | πολίτης | S | S | – | **same** |
| citizen | πολίτες | B | D | B | **broader/narrower** |
| citizens | το κοινό | B | B | – | **broader/narrower** |
| citizens | ψηφοφόροι | B | B | – | **broader/narrower** |
| citizens | πρόσωπο | B | D | D | **different** |
| citizens | πολίτης | B | B | – | **broader/narrower** |
| electorate | ψηφοφόροι | B | S | S | **same** |
| resident | πολίτες | B | D | B | **broader/narrower** |
| the people | ο λαός | S | S | – | **same** |
| the people | πολίτες | B | B | – | **broader/narrower** |
| the public | πολίτες | B | B | – | **broader/narrower** |
| the public | το κοινό | S | S | – | **same** |

## s17: "unemployment"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| unemployment *(seed)* | ανεργία | S | S | – | **same** |
| joblessness | ανεργία | S | S | – | **same** |
| no job | χωρίς δουλειά | S | S | – | **same** |
| no job | ανεργία | S | S | – | **same** |
| on the job market | στην αγορά εργασίας | S | S | – | **same** |
| out of work | χωρίς δουλειά | S | S | – | **same** |
| out of work | ανεργία | S | S | – | **same** |
| unemployed | ανεργία | S | D | D | **different** |
| unemployment | απασχόληση | D | D | – | **different** |
| without work | χωρίς εργασία | S | S | – | **same** |
| without work | ανεργία | S | B | S | **same** |

## s18: "inform"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| inform *(seed)* | ενημερώνω | S | S | – | **same** |
| advise | συμβουλεύω | S | S | – | **same** |
| inform | αναφέρω | S | B | D | **UNRESOLVED (owner)** |
| inform | δίνω πληροφορίες | S | S | – | **same** |
| inform | λέω | B | B | – | **broader/narrower** |
| inform | ειδοποιώ | S | S | – | **same** |
| inform | πληροφορώ | S | S | – | **same** |
| inform | ανακοινώνω | S | B | B | **broader/narrower** |
| notify | ειδοποιώ | S | S | – | **same** |
| notify | ενημερώνω | S | S | – | **same** |
| tell | ενημερώνω | B | B | – | **broader/narrower** |
| tell | λέω | D | S | B | **UNRESOLVED (owner)** |

## s19: "the vote"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| the vote *(seed)* | η ψηφοφορία | S | S | – | **same** |
| ballot | ψηφοδέλτιο | B | S | S | **same** |
| ballot box | κάλπη | B | S | S | **same** |
| election | εκλογές | S | S | – | **same** |
| referendum | δημοψήφισμα | S | S | – | **same** |
| the election | η εκλογή | S | S | – | **same** |
| the vote | ψήφισμα | S | D | D | **different** |
| the vote | ψηφοφορία | B | S | S | **same** |
| the vote | εκλογές | B | B | – | **broader/narrower** |
| vote | η ψηφοφορία | S | S | – | **same** |
| vote | ψηφοφορία | B | S | B | **broader/narrower** |
| voting | η ψηφοφορία | S | S | – | **same** |
| voting | ψηφοφορία | S | S | – | **same** |

## s20: "reject a proposal"

| English | Greek | A | B | C | Gold |
|---|---|---|---|---|---|
| reject a proposal *(seed)* | απορρίπτω μια πρόταση | S | S | – | **same** |
