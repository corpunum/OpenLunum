/**
 * Context Compaction Benchmark
 *
 * Benchmarks natural vs Lunum vs mixed context on downstream tasks.
 * Measures token counts, preservation metrics, and compression ratios
 * across 6 task categories.
 */

import { compileContext, type ContextMessage, type ContextMode } from '@corpunum/lunum';
import { ROUGH_TOKEN_COUNTER } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

export const BENCHMARK_VERSION = '0.1.0';

// ── Types ──────────────────────────────────────────────────────────

export type BenchmarkCategory = 'qa' | 'extraction' | 'instruction-following' | 'summarization' | 'reasoning' | 'rag';

export interface BenchmarkTask {
  id: string;
  name: string;
  category: BenchmarkCategory;
  naturalContext: string;
  lunumSem: LunumSem;
  question: string;
  expectedAnswer: string;
}

export interface BenchmarkResult {
  taskId: string;
  mode: ContextMode;
  tokenCount: number;
  preservedLiterals: boolean;
  preservedRoles: boolean;
  preservedNegation: boolean;
  preservedModality: boolean;
  contextSizeBytes: number;
}

export interface BenchmarkReport {
  version: string;
  timestamp: string;
  tasks: BenchmarkTask[];
  results: BenchmarkResult[];
  summary: {
    naturalAvgTokens: number;
    lunumAvgTokens: number;
    mixedAvgTokens: number;
    compressionRatio: number;
    preservationRate: number;
  };
}

// ── Helper Functions ──────────────────────────────────────────────

function detectPreservation(natural: string, lunum: string): {
  literals: boolean;
  roles: boolean;
  negation: boolean;
  modality: boolean;
} {
  // Check if key entities are preserved (simple heuristic)
  const naturalWords = new Set(natural.toLowerCase().match(/\b\w+\b/g) ?? []);
  const lunumWords = new Set(lunum.toLowerCase().match(/\b\w+\b/g) ?? []);

  // Literals: noun-like words preserved (>50% overlap)
  const contentWords = Array.from(naturalWords).filter(w => w.length > 3);
  const preservedContent = contentWords.filter(w => lunumWords.has(w));
  const literals = contentWords.length > 0 && preservedContent.length / contentWords.length > 0.5;

  // Roles: 'agent', 'object', 'location' style keywords
  const roleKeywords = ['agent', 'object', 'location', 'time', 'cause', 'result', 'beneficiary'];
  const hasRoles = roleKeywords.some(r => lunum.toLowerCase().includes(r));
  const roles = hasRoles;

  // Negation: "not" or "negated" keywords
  const negation = natural.includes('not ') && lunum.toLowerCase().includes('not');

  // Modality: 'may', 'can', 'must', 'should', 'could'
  const modalKeywords = ['may', 'can', 'must', 'should', 'could', 'might', 'will'];
  const hasModality = modalKeywords.some(m => natural.toLowerCase().includes(m));
  const modality = hasModality ? lunum.toLowerCase().includes('modality') || modalKeywords.some(m => lunum.toLowerCase().includes(m)) : true;

  return { literals, roles, negation, modality };
}

// ── Benchmark Tasks ────────────────────────────────────────────────

export const BENCHMARK_TASKS: BenchmarkTask[] = [
  // QA Tasks (3)
  {
    id: 'task-qa-001',
    name: 'Question Answering: Capital City',
    category: 'qa',
    naturalContext: 'France is a country in Western Europe. Its capital is Paris. Paris is located on the Seine River and has a population of about 2.2 million people.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'entity',
      kind: 'fact',
      clauses: [
        {
          predicate: 'is',
          roles: { subject: 'France', object: 'country' },
          modality: 'factual'
        },
        {
          predicate: 'located_in',
          roles: { subject: 'France', object: 'Western Europe' }
        },
        {
          predicate: 'has_capital',
          roles: { subject: 'France', object: 'Paris' }
        }
      ]
    },
    question: 'What is the capital of France?',
    expectedAnswer: 'Paris'
  },
  {
    id: 'task-qa-002',
    name: 'Question Answering: Scientific Fact',
    category: 'qa',
    naturalContext: 'Water boils at 100 degrees Celsius at sea level. This is due to atmospheric pressure. At higher altitudes, water boils at lower temperatures because there is less atmospheric pressure.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'process',
      kind: 'fact',
      clauses: [
        {
          predicate: 'boils_at',
          roles: { subject: 'water', temperature: '100 Celsius', condition: 'sea_level' }
        },
        {
          predicate: 'caused_by',
          roles: { effect: 'boiling_point', cause: 'atmospheric_pressure' }
        }
      ]
    },
    question: 'At what temperature does water boil?',
    expectedAnswer: '100 degrees Celsius at sea level'
  },
  {
    id: 'task-qa-003',
    name: 'Question Answering: Historical Event',
    category: 'qa',
    naturalContext: 'The American Civil War lasted from 1861 to 1865. It was fought between the Union and the Confederacy over issues including slavery and states rights.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'event',
      kind: 'fact',
      clauses: [
        {
          predicate: 'lasted',
          roles: { event: 'American_Civil_War', start: '1861', end: '1865' }
        },
        {
          predicate: 'fought_between',
          roles: { event: 'American_Civil_War', side1: 'Union', side2: 'Confederacy' }
        }
      ]
    },
    question: 'When did the American Civil War occur?',
    expectedAnswer: '1861 to 1865'
  },

  // Extraction Tasks (3)
  {
    id: 'task-extraction-001',
    name: 'Information Extraction: Named Entities',
    category: 'extraction',
    naturalContext: 'Apple Inc. was founded by Steve Jobs, Steve Wozniak, and Ronald Wayne in 1976 in Los Altos, California. The company is now headquartered in Cupertino.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'entity',
      kind: 'fact',
      clauses: [
        {
          predicate: 'founded',
          roles: { company: 'Apple_Inc', founders: ['Steve_Jobs', 'Steve_Wozniak', 'Ronald_Wayne'], year: '1976', location: 'Los_Altos_California' }
        },
        {
          predicate: 'headquartered_in',
          roles: { company: 'Apple_Inc', location: 'Cupertino' }
        }
      ]
    },
    question: 'Extract company, founders, and founding year from the text.',
    expectedAnswer: 'Company: Apple Inc., Founders: Steve Jobs, Steve Wozniak, Ronald Wayne, Year: 1976'
  },
  {
    id: 'task-extraction-002',
    name: 'Information Extraction: Relationships',
    category: 'extraction',
    naturalContext: 'Dr. Sarah Chen is a physician at City Hospital. She specializes in cardiology and has been working there for 8 years. Her office is in the Medical Tower, Room 305.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'entity',
      kind: 'fact',
      clauses: [
        {
          predicate: 'works_at',
          roles: { person: 'Sarah_Chen', organization: 'City_Hospital', duration: '8_years' }
        },
        {
          predicate: 'specializes_in',
          roles: { person: 'Sarah_Chen', specialty: 'cardiology' }
        },
        {
          predicate: 'located_in',
          roles: { office: 'Sarah_Chen_office', building: 'Medical_Tower', room: '305' }
        }
      ]
    },
    question: 'Extract person, organization, specialization, and location.',
    expectedAnswer: 'Person: Sarah Chen, Organization: City Hospital, Specialization: cardiology, Location: Medical Tower Room 305'
  },
  {
    id: 'task-extraction-003',
    name: 'Information Extraction: Product Details',
    category: 'extraction',
    naturalContext: 'The Tesla Model 3 is priced from $43,990 for the base model. It has an EPA-estimated range of 272 miles on a full charge. The vehicle offers autopilot as a standard feature.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'product',
      kind: 'fact',
      clauses: [
        {
          predicate: 'priced_at',
          roles: { product: 'Tesla_Model_3', price: '$43,990', variant: 'base_model' }
        },
        {
          predicate: 'has_range',
          roles: { product: 'Tesla_Model_3', distance: '272_miles', condition: 'full_charge' }
        },
        {
          predicate: 'includes_feature',
          roles: { product: 'Tesla_Model_3', feature: 'autopilot' }
        }
      ]
    },
    question: 'Extract product name, price, range, and features.',
    expectedAnswer: 'Product: Tesla Model 3, Price: $43,990, Range: 272 miles, Features: autopilot'
  },

  // Instruction-Following Tasks (3)
  {
    id: 'task-instruction-001',
    name: 'Instruction Following: Recipe Steps',
    category: 'instruction-following',
    naturalContext: 'To make pasta carbonara: First, cook pasta in boiling salted water until al dente. While pasta cooks, fry bacon until crispy. In a bowl, beat eggs with parmesan cheese. Drain pasta, reserving pasta water. Combine hot pasta with bacon, then add egg mixture, stirring constantly and adding pasta water as needed for creamy consistency.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'process',
      kind: 'procedure',
      clauses: [
        {
          predicate: 'step',
          roles: { order: 1, action: 'cook', object: 'pasta', condition: 'until_al_dente' }
        },
        {
          predicate: 'step',
          roles: { order: 2, action: 'fry', object: 'bacon', condition: 'until_crispy' }
        },
        {
          predicate: 'step',
          roles: { order: 3, action: 'beat', object: 'eggs', ingredient2: 'parmesan_cheese' }
        }
      ]
    },
    question: 'Follow the recipe steps and identify the main ingredients.',
    expectedAnswer: 'Ingredients: pasta, bacon, eggs, parmesan cheese, salt. Steps: cook pasta, fry bacon, beat eggs with cheese, combine all.'
  },
  {
    id: 'task-instruction-002',
    name: 'Instruction Following: Troubleshooting',
    category: 'instruction-following',
    naturalContext: 'If your computer will not start: Check that the power cable is firmly connected. Try a different outlet to rule out power issues. If still not starting, hold the power button for 30 seconds, then press once more. If the computer starts but shows a blank screen, wait 2 minutes for it to fully boot. If problems persist, restart in safe mode by pressing F8 during startup.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'process',
      kind: 'procedure',
      clauses: [
        {
          predicate: 'if_then',
          roles: { condition: 'will_not_start', action: 'check_power_cable' },
          conditions: [{ predicate: 'will_not_start', roles: { subject: 'computer' } }],
          consequences: [{ predicate: 'check', roles: { object: 'power_cable' } }]
        },
        {
          predicate: 'if_then',
          roles: { condition: 'blank_screen', action: 'wait' },
          conditions: [{ predicate: 'blank_screen', roles: { subject: 'computer' } }],
          consequences: [{ predicate: 'wait', roles: { duration: '2_minutes' } }]
        }
      ]
    },
    question: 'What steps should be taken to troubleshoot a non-starting computer?',
    expectedAnswer: 'Check power cable, try different outlet, hold power button 30 seconds, wait 2 minutes, try safe mode with F8'
  },
  {
    id: 'task-instruction-003',
    name: 'Instruction Following: Assembly Instructions',
    category: 'instruction-following',
    naturalContext: 'Assembly instructions for bookshelf: 1) Lay all pieces on flat surface. 2) Attach side panels to top and bottom panels using dowels and wood glue. 3) Install vertical support pieces every 16 inches. 4) Add shelf supports at marked positions. 5) Insert shelves into supports. 6) Apply finish if desired. 7) Allow glue to cure for 24 hours before loading.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'process',
      kind: 'procedure',
      clauses: [
        { predicate: 'step', roles: { order: 1, action: 'lay', object: 'all_pieces' } },
        { predicate: 'step', roles: { order: 2, action: 'attach', object1: 'side_panels', object2: 'top_bottom_panels' } },
        { predicate: 'step', roles: { order: 3, action: 'install', object: 'support_pieces', spacing: '16_inches' } }
      ]
    },
    question: 'List the assembly steps for the bookshelf.',
    expectedAnswer: 'Lay pieces, attach panels, install supports, add shelf supports, insert shelves, apply finish, cure 24 hours'
  },

  // Summarization Tasks (3)
  {
    id: 'task-summarization-001',
    name: 'Summarization: News Article',
    category: 'summarization',
    naturalContext: 'A team of researchers from MIT has developed a new battery technology that can charge a smartphone in just 5 minutes and maintains 95% capacity after 10,000 charge cycles. The breakthrough uses a novel electrolyte composition and structural design. The technology is expected to be commercially available within 3 years. The team estimates this could revolutionize portable electronics and electric vehicles.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'event',
      kind: 'news',
      clauses: [
        {
          predicate: 'developed',
          roles: { agent: 'MIT_researchers', object: 'battery_technology' }
        },
        {
          predicate: 'charges_in',
          roles: { object: 'smartphone', time: '5_minutes' }
        },
        {
          predicate: 'maintains_capacity',
          roles: { object: 'battery', percentage: '95%', cycles: '10000' }
        }
      ]
    },
    question: 'Summarize the key points of this article.',
    expectedAnswer: 'MIT researchers developed fast-charging battery technology that charges phones in 5 minutes and lasts 10,000 cycles. Commercial availability expected in 3 years.'
  },
  {
    id: 'task-summarization-002',
    name: 'Summarization: Research Paper Abstract',
    category: 'summarization',
    naturalContext: 'This study examines the correlation between social media usage and mental health outcomes in teenagers aged 13-18. We surveyed 2,500 participants across 5 countries over 18 months. Results show that daily social media use exceeding 3 hours correlates with increased anxiety and depression symptoms. However, moderated social media use (under 1 hour daily) showed no negative correlation and some positive effects on social connection. Recommendations include promoting digital literacy and healthy usage habits.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'research',
      kind: 'study',
      clauses: [
        {
          predicate: 'examined',
          roles: { object: 'correlation', between: 'social_media_usage', and: 'mental_health' }
        },
        {
          predicate: 'surveyed',
          roles: { count: '2500', scope: '5_countries', duration: '18_months' }
        },
        {
          predicate: 'found',
          roles: { condition: 'daily_use_3_hours', result: 'increased_anxiety_depression' }
        }
      ]
    },
    question: 'Write a brief summary of this research.',
    expectedAnswer: 'Survey of 2,500 teens across 5 countries found that over 3 hours daily social media use correlates with anxiety and depression, while under 1 hour has neutral or positive effects.'
  },
  {
    id: 'task-summarization-003',
    name: 'Summarization: Technical Documentation',
    category: 'summarization',
    naturalContext: 'The new API version 2.5 introduces three major improvements: First, support for batch processing allows users to handle up to 10,000 requests in a single call, reducing latency by 60%. Second, the authentication system now supports OAuth 2.0 and OpenID Connect. Third, response times have been optimized, with P99 latency reduced from 500ms to 150ms. The upgrade is backward compatible, but users should review the migration guide.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'technical',
      kind: 'documentation',
      clauses: [
        {
          predicate: 'introduces',
          roles: { version: '2.5', improvements: ['batch_processing', 'oauth_support', 'latency_reduction'] }
        },
        {
          predicate: 'supports_batch',
          roles: { count: '10000', benefit: '60%_latency_reduction' }
        },
        {
          predicate: 'improved_response_time',
          roles: { from: '500ms', to: '150ms' }
        }
      ]
    },
    question: 'Summarize the key features of API version 2.5.',
    expectedAnswer: 'API v2.5 adds batch processing (up to 10,000 requests), OAuth 2.0/OpenID Connect auth, and improved latency (500ms to 150ms), with backward compatibility.'
  },

  // Reasoning Tasks (3)
  {
    id: 'task-reasoning-001',
    name: 'Reasoning: Logical Deduction',
    category: 'reasoning',
    naturalContext: 'All mammals have backbones. Dogs are mammals. Therefore, dogs have backbones. Whales are also mammals, so whales also have backbones. Fish, however, are not mammals. Some fish have backbones and some do not.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'logic',
      kind: 'reasoning',
      clauses: [
        {
          predicate: 'all_have',
          roles: { set: 'mammals', property: 'backbones' }
        },
        {
          predicate: 'is_member',
          roles: { element: 'dogs', set: 'mammals' }
        },
        {
          predicate: 'therefore_has',
          roles: { subject: 'dogs', property: 'backbones' }
        }
      ]
    },
    question: 'Use the given statements to deduce: Do dogs have backbones?',
    expectedAnswer: 'Yes. All mammals have backbones. Dogs are mammals. Therefore, dogs have backbones.'
  },
  {
    id: 'task-reasoning-002',
    name: 'Reasoning: Problem Solving',
    category: 'reasoning',
    naturalContext: 'A train leaves City A at 8 AM traveling at 60 mph. Another train leaves City B at 9 AM traveling at 80 mph toward City A. The cities are 280 miles apart. How long before they meet? The first train travels 1 hour alone, covering 60 miles. The remaining distance is 220 miles. Combined speed is 140 mph. Time to meet is 220/140 = 1.57 hours after the second train starts.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'process',
      kind: 'reasoning',
      clauses: [
        {
          predicate: 'train_leaves',
          roles: { train: 1, location: 'City_A', time: '8_AM', speed: '60_mph' }
        },
        {
          predicate: 'train_leaves',
          roles: { train: 2, location: 'City_B', time: '9_AM', speed: '80_mph' }
        },
        {
          predicate: 'distance_between',
          roles: { city1: 'City_A', city2: 'City_B', distance: '280_miles' }
        }
      ]
    },
    question: 'When will the trains meet?',
    expectedAnswer: 'The trains meet at approximately 9:34 AM. Therefore, they meet 1.57 hours after the second train departs.'
  },
  {
    id: 'task-reasoning-003',
    name: 'Reasoning: Causal Analysis',
    category: 'reasoning',
    naturalContext: 'Increased rainfall in spring leads to higher water levels in rivers. Higher river levels increase flood risk. Floods can damage agricultural areas, reducing crop yields. Lower crop yields lead to food price increases. Therefore, unusually heavy spring rainfall can eventually cause food price increases by the end of summer.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'causality',
      kind: 'reasoning',
      clauses: [
        {
          predicate: 'causes',
          roles: { cause: 'high_rainfall', effect: 'high_river_levels' }
        },
        {
          predicate: 'causes',
          roles: { cause: 'high_river_levels', effect: 'flood_risk' }
        },
        {
          predicate: 'causes',
          roles: { cause: 'floods', effect: 'crop_damage' }
        },
        {
          predicate: 'causes',
          roles: { cause: 'crop_damage', effect: 'food_price_increase' }
        }
      ]
    },
    question: 'Trace the causal chain from rainfall to food prices.',
    expectedAnswer: 'Rainfall -> high river levels -> floods -> crop damage -> food price increases'
  },

  // RAG Tasks (3)
  {
    id: 'task-rag-001',
    name: 'RAG: Document Retrieval and QA',
    category: 'rag',
    naturalContext: 'Document 1: Python was created by Guido van Rossum in 1989 as a hobby project. Document 2: Python is known for its simple and readable syntax. Document 3: The Python Software Foundation was established in 2001 to support Python development. Document 4: Python is widely used in web development, data science, and artificial intelligence.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'document',
      kind: 'reference',
      clauses: [
        {
          predicate: 'created',
          roles: { language: 'Python', creator: 'Guido_van_Rossum', year: '1989' }
        },
        {
          predicate: 'known_for',
          roles: { language: 'Python', property: 'simple_readable_syntax' }
        },
        {
          predicate: 'established',
          roles: { organization: 'Python_Software_Foundation', year: '2001' }
        },
        {
          predicate: 'used_in',
          roles: { language: 'Python', domains: ['web_development', 'data_science', 'artificial_intelligence'] }
        }
      ]
    },
    question: 'Who created Python and when? List its primary uses.',
    expectedAnswer: 'Python was created by Guido van Rossum in 1989. Primary uses: web development, data science, artificial intelligence.'
  },
  {
    id: 'task-rag-002',
    name: 'RAG: Multi-Source Information Synthesis',
    category: 'rag',
    naturalContext: 'Source A: Climate change is primarily caused by greenhouse gas emissions from human activities. Source B: The main greenhouse gases are carbon dioxide, methane, and nitrous oxide. Source C: Renewable energy sources like solar and wind can reduce emissions. Source D: International agreements like the Paris Agreement aim to limit warming to 1.5 degrees Celsius.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'causality',
      kind: 'synthesis',
      clauses: [
        {
          predicate: 'caused_by',
          roles: { effect: 'climate_change', cause: 'greenhouse_gas_emissions' }
        },
        {
          predicate: 'includes',
          roles: { category: 'greenhouse_gases', members: ['carbon_dioxide', 'methane', 'nitrous_oxide'] }
        },
        {
          predicate: 'reduces',
          roles: { action: 'renewable_energy', target: 'emissions' }
        },
        {
          predicate: 'aims_for',
          roles: { agreement: 'Paris_Agreement', target: '1.5_degrees_warming_limit' }
        }
      ]
    },
    question: 'What are the main causes and solutions for climate change?',
    expectedAnswer: 'Causes: greenhouse gas emissions (CO2, methane, nitrous oxide). Solutions: renewable energy, international agreements like Paris Agreement.'
  },
  {
    id: 'task-rag-003',
    name: 'RAG: Historical Context Assembly',
    category: 'rag',
    naturalContext: 'The Renaissance began in Italy in the 14th century. Key figures include Leonardo da Vinci, Michelangelo, and Raphael. It was characterized by renewed interest in classical Greek and Roman knowledge. Major developments included advances in art, science, and literature. The period saw the invention of the printing press by Gutenberg, which accelerated knowledge spread.',
    lunumSem: {
      schema: 'lunum/1.0',
      world: 'history',
      kind: 'context',
      clauses: [
        {
          predicate: 'began',
          roles: { period: 'Renaissance', location: 'Italy', century: '14th' }
        },
        {
          predicate: 'key_figures',
          roles: { period: 'Renaissance', figures: ['Leonardo_da_Vinci', 'Michelangelo', 'Raphael'] }
        },
        {
          predicate: 'characterized_by',
          roles: { period: 'Renaissance', property: 'renewed_classical_interest' }
        },
        {
          predicate: 'invented',
          roles: { inventor: 'Gutenberg', invention: 'printing_press', impact: 'accelerated_knowledge_spread' }
        }
      ]
    },
    question: 'When did the Renaissance occur and who were key figures?',
    expectedAnswer: 'The Renaissance began in 14th century Italy. Key figures: Leonardo da Vinci, Michelangelo, Raphael. Characterized by classical revival and printing press invention.'
  }
];

// ── Benchmark Execution ────────────────────────────────────────────

export function runBenchmark(tasks: BenchmarkTask[]): BenchmarkReport {
  const results: BenchmarkResult[] = [];

  for (const task of tasks) {
    // Create context messages for compilation
    const messages: ContextMessage[] = [
      {
        role: 'system',
        content: task.naturalContext,
        lunumCode: JSON.stringify(task.lunumSem)
      }
    ];

    // Compile context in all three modes
    const natural = compileContext(messages, { mode: 'natural' });
    const lunum = compileContext(messages, { mode: 'lunum' });
    const mixed = compileContext(messages, { mode: 'mixed' });

    // Calculate token counts
    const naturalTokens = ROUGH_TOKEN_COUNTER(natural.selectedMessages[0]?.content ?? '');
    const lunumTokens = ROUGH_TOKEN_COUNTER(lunum.selectedMessages[0]?.content ?? '');
    const mixedTokens = ROUGH_TOKEN_COUNTER(mixed.selectedMessages[0]?.content ?? '');

    // Detect preservation metrics
    const lunumCode = JSON.stringify(task.lunumSem);
    const preservation = detectPreservation(task.naturalContext, lunumCode);

    // Create results for each mode
    const contextBytes = task.naturalContext.length;

    results.push({
      taskId: task.id,
      mode: 'natural',
      tokenCount: naturalTokens,
      preservedLiterals: preservation.literals,
      preservedRoles: preservation.roles,
      preservedNegation: preservation.negation,
      preservedModality: preservation.modality,
      contextSizeBytes: contextBytes
    });

    results.push({
      taskId: task.id,
      mode: 'lunum',
      tokenCount: lunumTokens,
      preservedLiterals: preservation.literals,
      preservedRoles: preservation.roles,
      preservedNegation: preservation.negation,
      preservedModality: preservation.modality,
      contextSizeBytes: lunumCode.length
    });

    results.push({
      taskId: task.id,
      mode: 'mixed',
      tokenCount: mixedTokens,
      preservedLiterals: preservation.literals,
      preservedRoles: preservation.roles,
      preservedNegation: preservation.negation,
      preservedModality: preservation.modality,
      contextSizeBytes: Math.min(contextBytes, lunumCode.length)
    });
  }

  // Calculate summary statistics
  const naturalResults = results.filter(r => r.mode === 'natural');
  const lunumResults = results.filter(r => r.mode === 'lunum');
  const mixedResults = results.filter(r => r.mode === 'mixed');

  const naturalAvgTokens = naturalResults.reduce((sum, r) => sum + r.tokenCount, 0) / Math.max(naturalResults.length, 1);
  const lunumAvgTokens = lunumResults.reduce((sum, r) => sum + r.tokenCount, 0) / Math.max(lunumResults.length, 1);
  const mixedAvgTokens = mixedResults.reduce((sum, r) => sum + r.tokenCount, 0) / Math.max(mixedResults.length, 1);

  const compressionRatio = naturalAvgTokens > 0 ? lunumAvgTokens / naturalAvgTokens : 1;

  // Calculate preservation rate (how many preservation metrics are true)
  const allPreserved = results.filter(r =>
    r.preservedLiterals && r.preservedRoles && r.preservedNegation && r.preservedModality
  );
  const preservationRate = results.length > 0 ? allPreserved.length / results.length : 0;

  return {
    version: BENCHMARK_VERSION,
    timestamp: new Date().toISOString(),
    tasks,
    results,
    summary: {
      naturalAvgTokens,
      lunumAvgTokens,
      mixedAvgTokens,
      compressionRatio,
      preservationRate
    }
  };
}
