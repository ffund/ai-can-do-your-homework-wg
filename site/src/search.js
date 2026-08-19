import {
  formatDuration,
  formatLabel,
  formatMetricValue,
  strategyTagsFrom,
  valueToText
} from './catalogue-view.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'what',
  'with'
]);

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const scalarValues = (value) => {
  const values = Array.isArray(value) ? value : [value];
  return values.map(valueToText).filter(Boolean);
};

const objectValues = (value) => (Array.isArray(value) ? value.filter(isObject) : isObject(value) ? [value] : []);

const nestedValues = (value) => {
  if (Array.isArray(value)) return value.flatMap(nestedValues);
  if (isObject(value)) return Object.values(value).flatMap(nestedValues);
  return scalarValues(value);
};

const labeledValues = (label, value) => {
  const values = nestedValues(value).map(formatLabel).filter(Boolean);
  return values.length ? `${label}: ${values.join('; ')}.` : null;
};

const aiPolicyValuesFrom = (record) => {
  const policy = Array.isArray(record?.genai?.policy) ? record.genai.policy : [];
  const permissions = policy.map((item) => valueToText(item?.permission)).filter(Boolean);
  if (permissions.length) return [...new Set(permissions)];
  const permitted = record?.genai?.student_role?.external_ai_use_permitted;
  if (permitted === true) return ['permitted'];
  if (permitted === false) return ['prohibited'];
  return ['unknown'];
};

const sourceVerificationFrom = (record) =>
  valueToText(record?.provenance?.status) || valueToText(record?.catalog_metadata?.verification_status);

const workshopPracticeValuesFrom = (record) => {
  const mappings = Array.isArray(record?.workshop_practice_mappings) ? record.workshop_practice_mappings : [];
  const practices = mappings.map((mapping) => valueToText(mapping?.practice_name)).filter(Boolean);
  if (practices.length) return practices;
  return record?.workshop_practice_mapping_review?.status === 'candidate_pass' ? ['none_of_the_above'] : [];
};

export const FILTER_DEFINITIONS = Object.freeze([
  { key: 'discipline', label: 'Discipline', get: (record) => record?.context?.discipline },
  { key: 'courseLevel', label: 'Course level', get: (record) => record?.context?.course?.level },
  {
    key: 'courseLevelCategory',
    label: 'Course level category',
    get: (record) => record?.context?.course?.level_category
  },
  { key: 'assessmentType', label: 'Assessment type', get: (record) => record?.assessment?.type },
  { key: 'mode', label: 'Individual / group', get: (record) => record?.assessment?.individual_or_group },
  { key: 'strategy', label: 'Assessment lens', get: strategyTagsFrom },
  { key: 'workshopPractice', label: 'Assessment practice', get: workshopPracticeValuesFrom },
  { key: 'purpose', label: 'Purpose', get: (record) => record?.purpose_and_stakes?.purposes },
  { key: 'aiPolicy', label: 'AI policy', get: aiPolicyValuesFrom },
  { key: 'deliverySetting', label: 'Delivery setting', get: (record) => record?.assessment?.delivery?.setting },
  { key: 'recordGranularity', label: 'Record granularity', get: (record) => record?.record_granularity },
  {
    key: 'verificationStatus',
    label: 'Source verification',
    get: sourceVerificationFrom
  }
]);

const normalizeFilterValue = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const filterValuesFrom = (record, definition) => scalarValues(definition.get(record));

/** Accept either the current single-record payload or a future array of records. */
export function normalizeRecords(value) {
  if (Array.isArray(value)) return value.filter(isObject);
  return isObject(value) ? [value] : [];
}

/** Return the distinct values available for each supported catalogue filter. */
export function extractFilterOptions(value) {
  const options = Object.fromEntries(FILTER_DEFINITIONS.map(({ key }) => [key, []]));
  const seen = Object.fromEntries(FILTER_DEFINITIONS.map(({ key }) => [key, new Set()]));

  normalizeRecords(value).forEach((record) => {
    FILTER_DEFINITIONS.forEach((definition) => {
      filterValuesFrom(record, definition).forEach((option) => {
        const normalized = normalizeFilterValue(option);
        if (normalized && !seen[definition.key].has(normalized)) {
          seen[definition.key].add(normalized);
          options[definition.key].push(option);
        }
      });
    });
  });

  return options;
}

/** Match all selected filters without assuming optional record fields exist. */
export function matchesFilters(record, filters = {}) {
  if (!isObject(record)) return false;

  return FILTER_DEFINITIONS.every((definition) => {
    const selected = filters?.[definition.key];
    const selectedValues = (Array.isArray(selected) ? selected : [selected])
      .map(normalizeFilterValue)
      .filter(Boolean);
    if (!selectedValues.length) return true;

    const recordValues = new Set(
      filterValuesFrom(record, definition).map(normalizeFilterValue).filter(Boolean)
    );
    return selectedValues.some((value) => recordValues.has(value));
  });
}

export function filterRecords(value, filters = {}) {
  return normalizeRecords(value).filter((record) => matchesFilters(record, filters));
}

/** Return a shuffled copy without changing the catalogue's loaded order. */
export function shuffleRecords(value) {
  const shuffled = [...normalizeRecords(value)];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

const sourceIdsFrom = (record) => {
  const sources = Array.isArray(record?.sources) ? record.sources : [];
  return sources.map((source) => (isObject(source) ? valueToText(source.id) : null)).filter(Boolean);
};

const makeFacet = (id, label, text, sourceIds) => ({
  id,
  label,
  text: valueToText(text),
  sourceIds: [...new Set((sourceIds ?? []).map(valueToText).filter(Boolean))]
});

const formatStructureItem = (item) => {
  if (!isObject(item)) return valueToText(item);
  const name = valueToText(item.name);
  const description = valueToText(item.description);
  const part = valueToText(item.part);
  const heading = name || (part ? `Part ${part}` : null);
  if (heading && description) return `${heading}: ${description}`;
  return heading || description;
};

const formatSubmissionItem = (item) => {
  if (!isObject(item)) return valueToText(item);
  const artifact = valueToText(item.artifact) || valueToText(item.description);
  const purpose = valueToText(item.purpose);
  return [artifact, purpose].filter(Boolean).join(': ') || null;
};

const formatMetricItem = (item) => {
  if (!isObject(item)) return valueToText(item);
  const label = valueToText(item.metric) || valueToText(item.name);
  const value = formatMetricValue(item);
  return [label, value].filter(Boolean).join(': ') || null;
};

const joinParts = (parts) => parts.filter(Boolean).join(' ');

/** Turn the nested catalogue record into passages that can be embedded and inspected. */
export function buildFacets(record) {
  const safeRecord = isObject(record) ? record : {};
  const allSourceIds = sourceIdsFrom(record);
  const context = isObject(safeRecord.context) ? safeRecord.context : {};
  const course = isObject(context.course) ? context.course : {};
  const assessment = isObject(safeRecord.assessment) ? safeRecord.assessment : {};
  const evidence = isObject(safeRecord.evidence) ? safeRecord.evidence : {};
  const genai = isObject(safeRecord.genai) ? safeRecord.genai : {};
  const grading = isObject(safeRecord.grading) ? safeRecord.grading : {};
  const implementation = isObject(safeRecord.implementation) ? safeRecord.implementation : {};
  const reuse = isObject(safeRecord.reuse) ? safeRecord.reuse : {};
  const strategyTags = strategyTagsFrom(safeRecord);
  const workshopMappings = Array.isArray(safeRecord.workshop_practice_mappings)
    ? safeRecord.workshop_practice_mappings
        .filter(isObject)
        .map((mapping) => valueToText(mapping.practice_name))
        .filter(Boolean)
    : [];
  const sourceTitles = (Array.isArray(safeRecord.sources) ? safeRecord.sources : [])
    .filter(isObject)
    .map((source) => valueToText(source.title))
    .filter(Boolean);

  const overviewParts = [
    valueToText(safeRecord.title) ? `Title: ${valueToText(safeRecord.title)}.` : null,
    valueToText(safeRecord.summary) ? `Summary: ${valueToText(safeRecord.summary)}` : null,
    sourceTitles.length ? `Source paper: ${sourceTitles.join('; ')}.` : null,
    formatLabel(safeRecord.implementation_status)
      ? `Implementation status: ${formatLabel(safeRecord.implementation_status)}.`
      : null,
    labeledValues('Purpose and stakes', safeRecord.purpose_and_stakes),
    strategyTags.length ? `Assessment lenses: ${strategyTags.map(formatLabel).join(', ')}.` : null,
    workshopMappings.length ? `Assessment practices: ${workshopMappings.join(', ')}.` : null,
    labeledValues('Catalogue guidance', safeRecord.catalogue_synthesis)
  ];

  const contextParts = [
    valueToText(course.name) ? `Course: ${valueToText(course.name)}.` : null,
    valueToText(course.institution) ? `Institution: ${valueToText(course.institution)}.` : null,
    formatLabel(context.discipline) ? `Discipline: ${formatLabel(context.discipline)}.` : null,
    formatLabel(course.level) ? `Level: ${formatLabel(course.level)}.` : null,
    formatLabel(course.level_category) ? `Level category: ${formatLabel(course.level_category)}.` : null,
    valueToText(context.learner_level) ? `Learner level: ${valueToText(context.learner_level)}.` : null,
    formatLabel(context.learner_level_category)
      ? `Learner level category: ${formatLabel(context.learner_level_category)}.`
      : null,
    valueToText(context.cohort_size) ? `Cohort: ${valueToText(context.cohort_size)} students.` : null,
    labeledValues('Prerequisites', context.prerequisites)
  ];

  const objectives = objectValues(safeRecord.learning_objectives);
  const objectiveDescriptions = objectives.map((objective) => valueToText(objective.description)).filter(Boolean);
  const scalarObjectives = scalarValues(safeRecord.learning_objectives);
  const objectiveSourceIds = objectives.flatMap((objective) => scalarValues(objective.source_ids));

  const assessmentTypes = scalarValues(assessment.type).map(formatLabel).filter(Boolean);
  const structure = Array.isArray(assessment.structure)
    ? assessment.structure.map(formatStructureItem).filter(Boolean)
    : scalarValues(assessment.structure);
  const assessmentParts = [
    valueToText(assessment.summary) ? `Task: ${valueToText(assessment.summary)}` : null,
    assessmentTypes.length ? `Type: ${assessmentTypes.join(', ')}.` : null,
    formatLabel(assessment.individual_or_group) ? `Mode: ${formatLabel(assessment.individual_or_group)}.` : null,
    formatDuration(assessment.duration_minutes) ? `Duration: ${formatDuration(assessment.duration_minutes)}.` : null,
    structure.length ? `Structure: ${structure.join(' ')}` : null,
    labeledValues('Student actions', assessment.student_actions),
    labeledValues('Outputs', assessment.outputs),
    labeledValues('Instructions', assessment.instructions),
    labeledValues('Inputs', assessment.inputs),
    labeledValues('Components', assessment.components),
    labeledValues('Delivery', assessment.delivery),
    labeledValues('Timing', assessment.timing),
    valueToText(assessment.question_or_item_count)
      ? `Items: ${valueToText(assessment.question_or_item_count)}.`
      : null
  ];

  const metricResults = objectValues(evidence.reported_results).map(formatMetricItem).filter(Boolean);
  const scalarMetricResults = objectValues(evidence.reported_results).length
    ? []
    : scalarValues(evidence.reported_results);
  const evidenceParts = [
    formatLabel(evidence.study_type) ? `Study type: ${formatLabel(evidence.study_type)}.` : null,
    metricResults.length || scalarMetricResults.length
      ? `Reported results: ${[...metricResults, ...scalarMetricResults].join('; ')}.`
      : null,
    scalarValues(evidence.reported_failures).length
      ? `Reported failures: ${scalarValues(evidence.reported_failures).join('; ')}.`
      : null,
    scalarValues(evidence.recommended_changes).length
      ? `Recommendations: ${scalarValues(evidence.recommended_changes).join('; ')}.`
      : null,
    labeledValues('Comparator', evidence.comparator),
    labeledValues('Sample', evidence.sample),
    labeledValues('Limitations', safeRecord.limitations),
    labeledValues('Instruments', evidence.instruments),
    labeledValues('Evidence excerpts', safeRecord.evidence_excerpts),
    labeledValues('Evidence quality', safeRecord.evidence_quality)
  ];

  const studentRole = isObject(genai.student_role) ? genai.student_role : {};
  const roleParts = [
    formatLabel(studentRole.during_assessment) ? `Student role: ${formatLabel(studentRole.during_assessment)}.` : null,
    typeof studentRole.external_ai_use_permitted === 'boolean'
      ? studentRole.external_ai_use_permitted
        ? 'External AI use permitted.'
        : 'External AI use prohibited; external AI is not permitted.'
    : null,
    valueToText(studentRole.description) || valueToText(genai.student_role)
  ];
  const tools = scalarValues(genai.tools);
  const systemRoles = scalarValues(genai.assessment_system_role).map(formatLabel).filter(Boolean);
  const taxonomy = scalarValues(genai.taxonomy_tags).map(formatLabel).filter(Boolean);
  const submissions = Array.isArray(safeRecord.submission_requirements)
    ? safeRecord.submission_requirements.map(formatSubmissionItem).filter(Boolean)
    : scalarValues(safeRecord.submission_requirements);
  const genaiParts = [
    ...roleParts,
    tools.length ? `Tools: ${tools.join(', ')}.` : null,
    systemRoles.length ? `System roles: ${systemRoles.join(', ')}.` : null,
    taxonomy.length ? `Taxonomy: ${taxonomy.join(', ')}.` : null,
    labeledValues('AI policy', genai.policy),
    labeledValues('Scaffolding', safeRecord.scaffolding),
    labeledValues('Authenticity and academic integrity', safeRecord.authenticity_integrity),
    labeledValues('Catalogue guidance', safeRecord.catalogue_synthesis)
  ];
  const gradingProcess = scalarValues(grading.process);
  const gradingParts = [
    formatLabel(grading.method) ? `Grading method: ${formatLabel(grading.method)}.` : null,
    labeledValues('Criteria', grading.criteria),
    labeledValues('Assessors', grading.assessors),
    scalarValues(grading.models).length ? `Grading models: ${scalarValues(grading.models).join(', ')}.` : null,
    gradingProcess.length ? `Grading process: ${gradingProcess.join(' ')}` : null,
    valueToText(grading.feedback),
    valueToText(grading.resubmission),
    typeof grading.human_validation?.performed === 'boolean'
      ? `Human validation performed: ${grading.human_validation.performed}.`
      : null,
    valueToText(grading.human_validation?.description),
    typeof grading.human_review_trigger?.implemented === 'boolean'
      ? `Human review trigger implemented: ${grading.human_review_trigger.implemented}.`
      : null,
    typeof grading.human_review_trigger?.recommended === 'boolean'
      ? `Human review trigger recommended: ${grading.human_review_trigger.recommended}.`
      : null,
    valueToText(grading.human_review_trigger?.description)
  ];
  const architecture = scalarValues(implementation.architecture);
  const platforms = scalarValues(implementation.platforms);
  const personalizationInputs = scalarValues(implementation.personalization_inputs);
  const cost = isObject(implementation.reported_cost) ? implementation.reported_cost : {};
  const costParts = [
    valueToText(cost.total_usd) ? `Total cost: ${valueToText(cost.total_usd)} USD.` : null,
    valueToText(cost.cost_per_student_usd)
      ? `Cost per student: ${valueToText(cost.cost_per_student_usd)} USD.`
      : null,
    typeof cost.subscription_cost_excluded === 'boolean'
      ? `Subscription cost excluded: ${cost.subscription_cost_excluded}.`
      : null
  ];
  const reuseParts = [
    ...[
      ['demo_available', 'Demo available'],
      ['examiner_prompt_available', 'Examiner prompt available'],
      ['grading_prompt_available', 'Grading prompt available'],
      ['hosted_system_available', 'Hosted system available']
    ]
      .map(([field, label]) => {
        if (typeof reuse[field] === 'boolean') return `${label}: ${reuse[field]}.`;
        const value = valueToText(reuse[field]);
        return value ? `${label}: ${value}.` : null;
      })
      .filter(Boolean),
    valueToText(reuse.assessment_artifact_license)
      ? `Assessment artifact license: ${valueToText(reuse.assessment_artifact_license)}.`
      : null,
    labeledValues('Reuse artifacts', safeRecord.reuse_artifacts)
  ];

  const sourceParts = (Array.isArray(safeRecord.sources) ? safeRecord.sources : [])
    .flatMap((source) => {
      if (!isObject(source)) return scalarValues(source);
      return [
        valueToText(source.title),
        ...scalarValues(source.authors),
        valueToText(source.evidence_quote),
        labeledValues('Source location', source.locator)
      ].filter(Boolean);
    });

  return [
    makeFacet('overview', 'Overview', joinParts(overviewParts), allSourceIds),
    makeFacet('context', 'Context', joinParts(contextParts), allSourceIds),
    makeFacet('objectives', 'Objectives', [...objectiveDescriptions, ...scalarObjectives].join(' '), objectiveSourceIds),
    makeFacet(
      'assessment',
      'Assessment design',
      joinParts([
        ...assessmentParts,
        submissions.length ? `Submission artifacts: ${submissions.join(', ')}.` : null
      ]),
      allSourceIds
    ),
    makeFacet('genai', 'GenAI design', joinParts(genaiParts), allSourceIds),
    makeFacet('concerns-evidence', 'Concerns + evidence', joinParts(evidenceParts), allSourceIds),
    makeFacet('grading', 'Grading and human review', joinParts(gradingParts), allSourceIds),
    makeFacet(
      'implementation-reuse',
      'Implementation + reuse',
      joinParts([
        architecture.length ? `Architecture: ${architecture.join(', ')}.` : null,
        platforms.length ? `Platforms: ${platforms.join(', ')}.` : null,
        personalizationInputs.length ? `Personalization inputs: ${personalizationInputs.join(', ')}.` : null,
        valueToText(implementation.staffing) ? `Staffing: ${valueToText(implementation.staffing)}.` : null,
        typeof implementation.student_workload_hours === 'number'
          ? `Student workload: ${implementation.student_workload_hours} hours.`
          : null,
        typeof implementation.instructor_workload_hours === 'number'
          ? `Instructor workload: ${implementation.instructor_workload_hours} hours.`
          : null,
        labeledValues('Failure modes', implementation.failure_modes),
        labeledValues('Design changes', implementation.design_changes),
        joinParts(costParts),
        joinParts(reuseParts)
      ]),
      allSourceIds
    ),
    makeFacet(
      'lenses',
      'Catalogue lenses',
      strategyTags.length ? strategyTags.map(formatLabel).join(', ') : null,
      allSourceIds
    ),
    makeFacet(
      'excerpts',
      'Evidence excerpts',
      labeledValues('Evidence excerpts', safeRecord.evidence_excerpts)
        || (Array.isArray(safeRecord.sources)
          ? safeRecord.sources
              .map((source) => (isObject(source) ? valueToText(source.evidence_quote) : null))
              .filter(Boolean)
              .join(' ')
          : null),
      allSourceIds
    ),
    makeFacet('sources', 'Sources', sourceParts.join(' '), allSourceIds)
  ].filter((facet) => facet.text);
}

export function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token));
}

export function inferSearchIntent(query) {
  const normalized = String(query ?? '').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
  if (/\brubrics?\b|grading criteria|marking scheme|assessment criteria|grading framework/.test(normalized)) {
    return {
      id: 'rubric',
      aliases: ['rubric', 'grading', 'criteria', 'marking', 'framework']
    };
  }
  return null;
}

function facetPriority(facet, intent) {
  const label = String(facet?.label ?? '').toLowerCase();
  if (intent?.id === 'rubric') {
    if (label.includes('grading')) return 1.35;
    if (label === 'overview') return 1.15;
    if (label === 'sources') return 1.12;
    if (label.includes('assessment')) return 1.08;
    if (label.includes('lens')) return 0.8;
  }
  return 1;
}

function findMatchingToken(queryToken, facetTokens) {
  if (facetTokens.has(queryToken)) return queryToken;
  if (queryToken.length < 4) return null;

  for (const facetToken of facetTokens) {
    if (facetToken.startsWith(queryToken) || queryToken.startsWith(facetToken)) return facetToken;
  }
  return null;
}

/** Score lexical overlap on a 0-1 scale and retain terms for a transparent explanation. */
export function keywordScore(query, text) {
  const queryTokens = [...new Set(tokenize(query))];
  const facetTokens = new Set(tokenize(text));
  const matches = queryTokens
    .map((token) => ({ queryToken: token, matchedToken: findMatchingToken(token, facetTokens) }))
    .filter((match) => match.matchedToken);
  const coverage = queryTokens.length ? matches.length / queryTokens.length : 0;
  const phraseBonus = query.trim() && text.toLowerCase().includes(query.trim().toLowerCase()) ? 0.15 : 0;

  return {
    score: clamp(coverage * 0.85 + phraseBonus),
    matchedTerms: matches.map((match) => match.queryToken),
    queryTerms: queryTokens
  };
}

export function cosineSimilarity(left, right) {
  if (!left?.length || left.length !== right?.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function normalizedSemanticScore(cosine) {
  // Sentence-embedding cosine is used as a similarity indicator, not a probability.
  return clamp(Number(cosine));
}

/** Rank passages with a semantic/keyword blend, or keyword-only when semantic search is unavailable. */
export function rankFacets(
  facets,
  query,
  semanticScores = {},
  { semanticAvailable = true, semanticWeight = 0.6, keywordWeight = 0.4 } = {}
) {
  const intent = inferSearchIntent(query);
  return facets
    .map((facet) => {
      const keyword = keywordScore(query, `${facet.label}: ${facet.text}`);
      const semantic = semanticAvailable ? clamp(Number(semanticScores[facet.id] ?? 0)) : 0;
      const exactShortQuery = keyword.queryTerms.length <= 2 && keyword.matchedTerms.length === keyword.queryTerms.length;
      const exactIntentQuery = exactShortQuery && Boolean(intent);
      const base = semanticAvailable
        ? semantic * (exactIntentQuery ? 0 : exactShortQuery ? 0.25 : semanticWeight)
          + keyword.score * (exactIntentQuery ? 1 : exactShortQuery ? 0.75 : keywordWeight)
        : keyword.score;
      const intentScore = intent
        ? keywordScore(intent.aliases.join(' '), `${facet.label}: ${facet.text}`).score
        : 0;
      const shortExactBoost = exactShortQuery
        ? 0.06
        : 0;
      const hybrid = base * facetPriority(facet, intent) + intentScore * 0.05 + shortExactBoost;

      return {
        ...facet,
        semanticScore: semantic,
        keywordScore: keyword.score,
        intentScore,
        facetPriority: facetPriority(facet, intent),
        hybridScore: hybrid,
        matchedTerms: keyword.matchedTerms
      };
    })
    .sort((left, right) => right.hybridScore - left.hybridScore);
}

/** Rank complete records, rewarding both a strong passage and query coverage across passages. */
export function rankRecords(
  entries,
  query,
  semanticScores = {},
  { semanticAvailable = true, limit = 40 } = {}
) {
  return entries
    .map((entry) => {
      const ranked = rankFacets(entry.facets, query, semanticScores, { semanticAvailable });
      const recordKeyword = keywordScore(query, entry.facets.map((facet) => facet.text).join(' ')).score;
      const bestScore = ranked[0]?.hybridScore ?? 0;
      const supportingScore = ranked[1]?.hybridScore ?? 0;
      const recordScore = bestScore * 0.7 + supportingScore * 0.1 + recordKeyword * 0.2;
      return { record: entry.record, ranked, recordScore };
    })
    .sort((left, right) => right.recordScore - left.recordScore)
    .slice(0, limit);
}
