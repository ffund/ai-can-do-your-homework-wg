import { describe, expect, it, vi } from 'vitest';
import completeCatalogue from './fixtures/catalogue-example.json';
import { buildDisplayModel, formatDuration, formatMetricValue } from '../src/catalogue-view.js';
import {
  buildFacets,
  extractFilterOptions,
  filterRecords,
  inferSearchIntent,
  keywordScore,
  matchesFilters,
  normalizeRecords,
  normalizedSemanticScore,
  rankFacets,
  rankRecords,
  shuffleRecords,
  tokenize
} from '../src/search.js';

const catalogue = {
  sources: [{ id: 'source-a' }, { id: 'source-b' }],
  context: {
    course: {
      name: 'AI Product Management',
      institution: 'Example University',
      level: 'post-introductory',
      level_category: 'post_introductory'
    },
    cohort_size: 24,
    discipline: 'computing',
    learner_level: 'post-introductory',
    learner_level_category: 'post_introductory'
  },
  learning_objectives: [
    { description: 'Defend design choices in a submitted project.', source_ids: ['source-a'] },
    { description: 'Apply concepts to an unfamiliar case.', source_ids: ['source-b'] }
  ],
  assessment: {
    type: ['oral_exam', 'project_defense'],
    individual_or_group: 'individual',
    duration_minutes: { mean: 20, minimum: 10, maximum: 40 },
    structure: [{ name: 'Project discussion', description: 'Explain evaluation decisions.' }]
  },
  evidence: {
    reported_results: [{ metric: 'students examined', value: 24 }],
    reported_failures: ['insufficient thinking time'],
    recommended_changes: ['provide more thinking time']
  },
  genai: {
    tools: ['Voice AI'],
    assessment_system_role: ['conduct_oral_exam']
  },
  submission_requirements: [{ artifact: 'oral conversation' }],
  grading: { process: ['Models grade independently.'] },
  implementation: {
    architecture: ['discussion agent', 'grading system'],
    reported_cost: { total_usd: 10, cost_per_student_usd: 0.42 }
  },
  reuse: { demo_available: true, assessment_artifact_license: 'unknown' }
};

describe('buildFacets', () => {
  it('creates focused catalogue facets with source provenance', () => {
    const facets = buildFacets(catalogue);

    expect(facets.map((facet) => facet.id)).toEqual([
      'overview',
      'context',
      'objectives',
      'assessment',
      'genai',
      'concerns-evidence',
      'grading',
      'implementation-reuse',
      'lenses'
    ]);
    expect(facets.find((facet) => facet.id === 'assessment').text).toContain('oral exam');
    expect(facets.find((facet) => facet.id === 'context').text).toContain('Level category: post introductory');
    expect(facets.find((facet) => facet.id === 'objectives').sourceIds).toEqual(['source-a', 'source-b']);
  });

  it('does not throw or add boilerplate for sparse records', () => {
    const sparseRecord = {
      context: { cohort_size: 0 },
      assessment: { type: ['oral_exam'], duration_minutes: { minimum: 0 } },
      genai: { student_role: { external_ai_use_permitted: false } },
      grading: { human_review_trigger: { implemented: false } },
      sources: [{ title: 'Unlinked source' }, null, {}]
    };

    expect(() => buildFacets(sparseRecord)).not.toThrow();
    expect(buildFacets(sparseRecord).map((facet) => facet.id)).toEqual([
      'overview',
      'context',
      'assessment',
      'genai',
      'grading',
      'lenses',
      'sources'
    ]);
    expect(buildFacets({ grading: { human_review_trigger: { implemented: false } } })[0].id).toBe('grading');
    expect(buildFacets({})).toEqual([]);
    expect(buildFacets(undefined)).toEqual([]);
    expect(buildFacets(sparseRecord).every((facet) => !facet.text.includes('not listed'))).toBe(true);
  });

  it('indexes descriptive task, policy, integrity, and source fields', () => {
    const enriched = {
      ...completeCatalogue,
      genai: { ...completeCatalogue.genai, policy: [{ permission: 'prohibited', disclosure_required: true }] },
      scaffolding: { supports: ['worked examples'] },
      authenticity_integrity: { controls: ['oral defense'] }
    };
    const facets = buildFacets(enriched);

    expect(facets.find((facet) => facet.id === 'overview').text).toContain(enriched.title);
    expect(facets.find((facet) => facet.id === 'assessment').text).toContain('Student actions');
    expect(facets.find((facet) => facet.id === 'genai').text).toMatch(/AI policy.*Scaffolding.*Authenticity and academic integrity/);
    expect(facets.find((facet) => facet.id === 'sources').text).toContain(enriched.sources[0].title);
  });

  it('indexes evidence excerpts and catalogue guidance', () => {
    const enriched = {
      ...completeCatalogue,
      evidence_excerpts: [
        {
          kind: 'verification',
          quote: 'Students respond to unfamiliar follow-up questions.',
          source_id: completeCatalogue.sources[0].id,
          supports: 'Individual understanding',
          locator: { section: 'Assessment design' }
        }
      ],
      catalogue_synthesis: {
        design_move: 'Use live follow-up questions after submitted work.',
        cautions: ['Requires trained assessors.']
      }
    };
    const facets = buildFacets(enriched);

    expect(facets.find((facet) => facet.id === 'excerpts').text).toContain('unfamiliar follow up questions');
    expect(facets.find((facet) => facet.id === 'overview').text).toContain('Requires trained assessors');
  });
});

describe('catalogue filters', () => {
  const secondRecord = {
    context: { discipline: 'design', course: { level: 'introductory' } },
    assessment: { type: 'portfolio', individual_or_group: 'group' },
    catalog_metadata: { verification_status: 'single_source' }
  };

  it('normalizes a single record and extracts distinct schema-backed options', () => {
    expect(normalizeRecords(catalogue)).toEqual([catalogue]);
    expect(extractFilterOptions([catalogue, secondRecord])).toEqual({
      discipline: ['computing', 'design'],
      courseLevel: ['post-introductory', 'introductory'],
      courseLevelCategory: ['post_introductory'],
       assessmentType: ['oral_exam', 'project_defense', 'portfolio'],
       mode: ['individual', 'group'],
       strategy: ['oral_interactive'],
       workshopPractice: [],
       purpose: [],
      aiPolicy: ['unknown'],
      deliverySetting: [],
      recordGranularity: [],
       verificationStatus: ['single_source']
     });
   });

  it('offers workshop practices and an explicit none-of-the-above option', () => {
    const mapped = {
      workshop_practice_mapping_review: { status: 'candidate_pass' },
      workshop_practice_mappings: [{ practice_name: 'Collect process evidence' }]
    };
    const reviewedWithoutMatch = {
      workshop_practice_mapping_review: { status: 'candidate_pass' },
      workshop_practice_mappings: []
    };

    expect(extractFilterOptions([mapped, reviewedWithoutMatch]).workshopPractice).toEqual([
      'Collect process evidence',
      'none_of_the_above'
    ]);
    expect(filterRecords([mapped, reviewedWithoutMatch], { workshopPractice: 'none_of_the_above' })).toEqual([
      reviewedWithoutMatch
    ]);
    expect(filterRecords([mapped, reviewedWithoutMatch], { workshopPractice: 'Collect process evidence' })).toEqual([
      mapped
    ]);
  });

  it('matches selected filters defensively and returns an empty no-match set', () => {
    expect(matchesFilters(catalogue, { discipline: 'COMPUTING', mode: 'individual' })).toBe(true);
    expect(matchesFilters(catalogue, { courseLevelCategory: 'post_introductory' })).toBe(true);
    expect(matchesFilters(secondRecord, { courseLevelCategory: 'post_introductory' })).toBe(false);
    expect(matchesFilters({}, { assessmentType: 'oral_exam' })).toBe(false);
    expect(filterRecords([catalogue, secondRecord], { verificationStatus: 'multiple_sources' })).toEqual([]);
    expect(filterRecords(undefined, { discipline: 'computing' })).toEqual([]);
  });

  it('shuffles records without changing the source array', () => {
    const records = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);

    expect(shuffleRecords(records).map((record) => record.id)).toEqual(['two', 'three', 'one']);
    expect(records.map((record) => record.id)).toEqual(['one', 'two', 'three']);

    random.mockRestore();
  });
});

describe('catalogue display model', () => {
  it('exposes all instructor-facing sections for a complete record', () => {
    const model = buildDisplayModel(
      completeCatalogue,
      [
        {
          label: 'Objectives',
          text: 'Reason aloud and defend analytical and design choices.',
          matchedTerms: ['oral'],
          hybridScore: 0.84,
          semanticScore: 0.8,
          keywordScore: 0.95
        }
      ],
      'hybrid',
      'oral exam'
    );

    expect(model.quickFacts.map((fact) => fact.label)).toEqual([
      'Context',
      'Level',
      'Assessment type',
      'Mode',
      'Cohort',
      'Duration'
    ]);
    expect(model.summary).toContain('voice-AI examiner');
    expect(model.whyMatched.passage).toContain('Reason aloud');
    expect(model.sections.map((section) => section.id)).toEqual([
      'context',
      'objectives',
      'students',
      'lenses',
      'genai',
      'evidence',
      'grading',
      'implementation',
      'sources'
    ]);
    expect(JSON.stringify(model)).not.toContain('undefined');
    expect(JSON.stringify(model.sections.find((section) => section.id === 'genai'))).toContain('Not permitted');
    expect(JSON.stringify(model.sections.find((section) => section.id === 'context'))).toContain('Course level category');
    expect(JSON.stringify(model.sections.find((section) => section.id === 'context'))).toContain('Learner level category');
    expect(JSON.stringify(model.sections.find((section) => section.id === 'grading'))).toContain('No');
    expect(JSON.stringify(model.sections.find((section) => section.id === 'implementation'))).toContain('$0.42');
    expect(JSON.stringify(model.sections.find((section) => section.id === 'sources'))).toContain('arXiv:2603.18221');
  });

  it('omits empty data and preserves useful false values for a sparse record', () => {
    const sparseRecord = {
      title: 'Minimal record',
      genai: { student_role: { external_ai_use_permitted: false } },
      grading: { human_review_trigger: { implemented: false } },
      sources: [{ title: 'A source without a URL' }]
    };
    const model = buildDisplayModel(sparseRecord);

    expect(model.quickFacts).toEqual([]);
    expect(model.whyMatched).toBeNull();
    expect(model.sections.map((section) => section.id)).toEqual(['lenses', 'genai', 'grading', 'sources']);
    expect(JSON.stringify(model)).not.toContain('undefined');
    expect(JSON.stringify(model.sections.find((section) => section.id === 'genai'))).toContain('Not permitted');
    expect(JSON.stringify(model.sections.find((section) => section.id === 'grading'))).toContain('No');
    expect(model.sections.find((section) => section.id === 'sources').blocks[0].items[0].title).toBe(
      'A source without a URL'
    );
  });

  it('formats scalar values without inventing missing values', () => {
    expect(formatMetricValue({ value: 0.7 })).toBe('70%');
    expect(formatMetricValue({ value: false })).toBe('false');
    expect(formatDuration({ mean: 25, minimum: 9, maximum: 64 })).toBe('25 minutes (range: 9-64 minutes)');
    expect(formatDuration({ minimum: 9 })).toBe('minimum: 9 minutes');
    expect(formatDuration({})).toBeNull();
  });

  it('shows short evidence excerpts with their source locator', () => {
    const record = {
      ...completeCatalogue,
      evidence_excerpts: [
        {
          kind: 'assessment_description',
          quote: 'Students defend a submitted project.',
          source_id: completeCatalogue.sources[0].id,
          supports: 'Assessment description',
          locator: { page: 3 }
        }
      ]
    };
    const model = buildDisplayModel(record);
    const students = model.sections.find((section) => section.id === 'students');

    expect(students.blocks[0].kind).toBe('quotes');
    expect(students.blocks[0].items[0]).toMatchObject({
      quote: 'Students defend a submitted project.',
      locator: 'p. 3',
      supports: 'Assessment description'
    });
  });

  it('surfaces legacy source quotations as public excerpts', () => {
    const record = {
      ...completeCatalogue,
      sources: completeCatalogue.sources.map((source, index) =>
        index === 0 ? { ...source, evidence_quote: 'Students defend their submitted project.' } : source
      )
    };
    const model = buildDisplayModel(record);
    const students = model.sections.find((section) => section.id === 'students');

    expect(students.blocks[0].items[0].quote).toBe('Students defend their submitted project.');
  });

  it('shows context facts and context-specific quotations separately', () => {
    const record = {
      ...completeCatalogue,
      context: {
        ...completeCatalogue.context,
        course: {
          ...completeCatalogue.context.course,
          program: 'Data science'
        }
      },
      evidence_excerpts: [
        {
          kind: 'context',
          quote: 'The course serves students from several disciplines.',
          source_id: completeCatalogue.sources[0].id,
          supports: 'Learner context',
          locator: { section: 'Participants' }
        }
      ]
    };
    const model = buildDisplayModel(record);
    const context = model.sections.find((section) => section.id === 'context');

    expect(context.blocks.find((block) => block.kind === 'facts').items).toContainEqual({
      label: 'Program',
      value: 'Data science'
    });
    expect(context.blocks.find((block) => block.kind === 'quotes').items[0].quote).toBe(
      'The course serves students from several disciplines.'
    );
  });

  it('routes task, context, and GenAI quotations to their matching sections', () => {
    const record = {
      ...completeCatalogue,
      evidence_excerpts: [
        {
          kind: 'assessment_description',
          quote: 'Students defend a submitted project.',
          source_id: completeCatalogue.sources[0].id,
          supports: 'What students do'
        },
        {
          kind: 'context',
          quote: 'The course serves students from several disciplines.',
          source_id: completeCatalogue.sources[0].id,
          supports: 'Course and learner context'
        },
        {
          kind: 'ai_policy',
          quote: 'Students may use ChatGPT during the project.',
          source_id: completeCatalogue.sources[0].id,
          supports: 'GenAI design'
        },
        {
          kind: 'grading',
          quote: 'The project contributes 30% of the course grade.',
          source_id: completeCatalogue.sources[0].id,
          supports: 'Grading and stakes'
        }
      ]
    };
    const model = buildDisplayModel(record);
    const quoteText = (id) => JSON.stringify(model.sections.find((section) => section.id === id));

    expect(quoteText('students')).toContain('Students defend a submitted project.');
    expect(quoteText('students')).not.toContain('30% of the course grade');
    expect(quoteText('context')).toContain('The course serves students from several disciplines.');
    expect(quoteText('genai')).toContain('Students may use ChatGPT during the project.');
    expect(quoteText('excerpts')).toContain('30% of the course grade');
  });

  it('does not repeat an identical task quote in Context', () => {
    const quote = 'Students complete the project in teams.';
    const record = {
      ...completeCatalogue,
      evidence_excerpts: [
        {
          kind: 'assessment_description',
          quote,
          source_id: completeCatalogue.sources[0].id,
          supports: 'What students do'
        },
        {
          kind: 'context',
          quote,
          source_id: completeCatalogue.sources[0].id,
          supports: 'Course and learner context'
        }
      ]
    };
    const model = buildDisplayModel(record);
    const context = model.sections.find((section) => section.id === 'context');
    const students = model.sections.find((section) => section.id === 'students');

    expect(students.blocks.find((block) => block.kind === 'quotes').items[0].quote).toBe(quote);
    expect(context.blocks.some((block) => block.kind === 'quotes')).toBe(false);
  });
});

describe('keywordScore', () => {
  it('returns matched terms and a bounded score', () => {
    const result = keywordScore('oral exam understanding', 'An oral examination tests understanding.');

    expect(result.matchedTerms).toEqual(['oral', 'exam', 'understanding']);
    expect(result.score).toBeGreaterThan(0.8);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('normalizes accents without discarding non-Latin words', () => {
    expect(tokenize('Résumé critique 中文')).toEqual(['resume', 'critique', '中文']);
    expect(keywordScore('resume', 'Résumé critique').score).toBeGreaterThan(0);
  });
});

describe('rankFacets', () => {
  it('does not give zero cosine similarity an artificial score', () => {
    expect(normalizedSemanticScore(0)).toBe(0);
    expect(normalizedSemanticScore(-0.2)).toBe(0);
    expect(normalizedSemanticScore(0.75)).toBe(0.75);
  });

  it('combines semantic and keyword scores and sorts best first', () => {
    const facets = [
      { id: 'one', label: 'One', text: 'Students experience stress during an oral assessment.', sourceIds: [] },
      { id: 'two', label: 'Two', text: 'A reusable lesson plan explains implementation.', sourceIds: [] }
    ];
    const ranked = rankFacets(facets, 'student stress', { one: 0.8, two: 0.1 });

    expect(ranked[0].id).toBe('one');
    expect(ranked[0].hybridScore).toBeCloseTo(0.8 * 0.25 + 0.85 * 0.75 + 0.06, 5);
    expect(ranked[0].semanticScore).toBe(0.8);
  });

  it('prioritizes an explicit grading facet for a rubric query', () => {
    expect(inferSearchIntent('rubric')).toMatchObject({ id: 'rubric' });
    const ranked = rankFacets(
      [
        { id: 'overview', label: 'Overview', text: 'A rubric is mentioned in the assignment summary.', sourceIds: [] },
        { id: 'grading', label: 'Grading and human review', text: 'The rubric defines criteria and weighting.', sourceIds: [] },
        { id: 'lenses', label: 'Catalogue lenses', text: 'rubric grading', sourceIds: [] }
      ],
      'rubric',
      { overview: 0.8, grading: 0.7, lenses: 0.9 }
    );

    expect(ranked[0].id).toBe('grading');
    expect(ranked[0].facetPriority).toBeGreaterThan(ranked[1].facetPriority);
    expect(ranked[0].hybridScore).toBeGreaterThan(ranked[0].keywordScore);
  });

  it('uses keyword score as the full ranking when semantic search fails', () => {
    const facets = [
      { id: 'assessment', label: 'Assessment', text: 'An oral exam tests understanding.', sourceIds: [] },
      { id: 'context', label: 'Context', text: 'A computing course has thirty students.', sourceIds: [] }
    ];
    const ranked = rankFacets(facets, 'oral exam', {}, { semanticAvailable: false });

    expect(ranked[0].id).toBe('assessment');
    expect(ranked[0].hybridScore).toBeCloseTo(ranked[0].keywordScore + 0.06, 5);
    expect(ranked[0].semanticScore).toBe(0);
  });
});

describe('rankRecords', () => {
  it('uses query coverage across facets instead of only the strongest passage', () => {
    const entries = [
      {
        record: { title: 'Partial match' },
        facets: [
          { id: 'partial-a', label: 'A', text: 'oral discussion', sourceIds: [] },
          { id: 'partial-b', label: 'B', text: 'unrelated implementation', sourceIds: [] }
        ]
      },
      {
        record: { title: 'Complete match' },
        facets: [
          { id: 'complete-a', label: 'A', text: 'oral defense', sourceIds: [] },
          { id: 'complete-b', label: 'B', text: 'student project', sourceIds: [] }
        ]
      }
    ];
    const semanticScores = { 'partial-a': 0.9, 'partial-b': 0.1, 'complete-a': 0.85, 'complete-b': 0.75 };

    const ranked = rankRecords(entries, 'oral student project', semanticScores);

    expect(ranked[0].record.title).toBe('Complete match');
    expect(ranked[0].recordScore).toBeGreaterThan(ranked[1].recordScore);
  });

  it('limits the low-relevance tail', () => {
    const entries = Array.from({ length: 45 }, (_, index) => ({
      record: { title: `Record ${index}` },
      facets: [{ id: `facet-${index}`, label: 'Overview', text: `Record ${index}`, sourceIds: [] }]
    }));

    expect(rankRecords(entries, 'record', {}, { semanticAvailable: false })).toHaveLength(40);
  });
});
