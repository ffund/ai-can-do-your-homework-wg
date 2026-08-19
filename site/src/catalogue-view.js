import { excerptKindsForQuote, supportsForExcerptKind } from './quote-classification.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function isUseful(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(isUseful);
  if (isObject(value)) return Object.values(value).some(isUseful);
  return false;
}

export function valueToText(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}

function valuesFrom(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(valueToText).filter(Boolean);
}

function nestedTextValues(value) {
  if (Array.isArray(value)) return value.flatMap(nestedTextValues);
  if (isObject(value)) return Object.values(value).flatMap(nestedTextValues);
  return valuesFrom(value);
}

function objectsFrom(value) {
  return Array.isArray(value) ? value.filter(isObject) : isObject(value) ? [value] : [];
}

export function formatLabel(value) {
  const text = valueToText(value);
  return text ? text.replaceAll('_', ' ').replaceAll('-', ' ') : null;
}

const STRATEGY_TAG_LABELS = Object.freeze({
  open_ended_authentic: 'Open-ended / authentic',
  ai_leveraged: 'AI-leveraged project',
  evaluating_ai_output: 'Evaluating AI output',
  controlled_ai_free: 'Controlled / AI-free',
  process_evidence: 'Process evidence',
  rubric_grading: 'Rubric / grading redesign',
  oral_interactive: 'Oral / interactive',
  transparent_ai_literacy: 'Transparent AI literacy'
});

export function strategyTagLabel(value) {
  return STRATEGY_TAG_LABELS[value] || formatLabel(value);
}

export function strategyTagsFrom(record) {
  const explicit = valuesFrom(record?.catalog_metadata?.strategy_tags);
  if (explicit.length) return [...new Set(explicit)];

  const assessment = isObject(record?.assessment) ? record.assessment : {};
  const genai = isObject(record?.genai) ? record.genai : {};
  const role = isObject(genai.student_role) ? genai.student_role : {};
  const policy = Array.isArray(genai.policy) ? genai.policy : [];
  const types = valuesFrom(assessment.type).map((value) => value.toLowerCase());
  const text = [
    record?.title,
    record?.summary,
    assessment.summary,
    assessment.student_actions,
    assessment.outputs,
    assessment.inputs,
    genai.tools,
    genai.assessment_system_role,
    genai.taxonomy_tags,
    record?.authenticity_integrity,
    record?.scaffolding,
    record?.grading
  ]
    .flatMap(nestedTextValues)
    .join(' ')
    .toLowerCase();
  const tags = [];
  const hasAi = ['uses_ai', 'interacts_with_ai', 'evaluates_ai_output'].includes(role.during_assessment)
    || role.external_ai_use_permitted === true
    || policy.some((item) => ['required', 'permitted', 'optional'].includes(item?.permission));

  if (
    role.during_assessment === 'no_ai'
    || role.external_ai_use_permitted === false
    || policy.some((item) => item?.permission === 'prohibited')
    || text.includes('ai-free')
    || text.includes('without llm')
  ) tags.push('controlled_ai_free');
  if (types.some((type) => ['oral_exam', 'project_defense', 'presentation'].includes(type)) || /oral|interview|walkthrough|viva|live demo/.test(text)) {
    tags.push('oral_interactive');
  }
  if (role.during_assessment === 'evaluates_ai_output' || /critique|criticise|criticize|review ai|debug ai|repair ai|test ai|compare ai/.test(text)) {
    tags.push('evaluating_ai_output');
  }
  if (/process evidence|process journal|prompt log|interaction log|version control|commit histor|reflection|development histor/.test(text)) {
    tags.push('process_evidence');
  }
  if (/rubric|grading redesign|grading criteria|mastery-based|specifications-based/.test(text) || objectsFrom(record?.grading?.criteria).length) {
    tags.push('rubric_grading');
  }
  if (/open-ended|open ended|authentic|real system|real-world|choose a|student-defined|define the problem|unfamiliar codebase|client/.test(text)) {
    tags.push('open_ended_authentic');
  }
  if (hasAi && (types.some((type) => ['project', 'capstone', 'assignment'].includes(type)) || /semester-long|large codebase|software project|build a system/.test(text))) {
    tags.push('ai_leveraged');
  }
  if (/ai literacy|prompt engineering|prompting|ai use disclosure|ai policy|responsible ai/.test(text)) {
    tags.push('transparent_ai_literacy');
  }
  return [...new Set(tags)];
}

export function formatMetricValue(metric) {
  const value = isObject(metric) ? metric.value : metric;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value < 1) return `${Math.round(value * 100)}%`;
    return String(value);
  }
  return valueToText(value);
}

export function formatDuration(duration) {
  if (typeof duration === 'number' && Number.isFinite(duration)) return `${duration} minutes`;
  const scalar = valueToText(duration);
  if (scalar && !isObject(duration)) return scalar;
  if (!isObject(duration)) return null;

  const mean = valueToText(duration.mean);
  const minimum = valueToText(duration.minimum);
  const maximum = valueToText(duration.maximum);
  const details = [];
  if (minimum && maximum) details.push(`range: ${minimum}-${maximum} minutes`);
  else if (minimum) details.push(`minimum: ${minimum} minutes`);
  else if (maximum) details.push(`maximum: ${maximum} minutes`);
  if (mean) return details.length ? `${mean} minutes (${details.join('; ')})` : `${mean} minutes`;
  return details.join('; ') || null;
}

function listBlock(label, items) {
  const usefulItems = items.filter(Boolean);
  return usefulItems.length ? { kind: 'list', label, items: usefulItems } : null;
}

function textBlock(label, text) {
  return valueToText(text) ? { kind: 'text', label, text: valueToText(text) } : null;
}

function factsBlock(label, items) {
  const usefulItems = items.filter((item) => item?.label && item?.value);
  return usefulItems.length ? { kind: 'facts', label, items: usefulItems } : null;
}

function metricBlock(label, items) {
  const usefulItems = items.filter((item) => item?.label || item?.value);
  return usefulItems.length ? { kind: 'metrics', label, items: usefulItems } : null;
}

function quoteBlock(label, items) {
  const usefulItems = items.filter((item) => item?.quote);
  return usefulItems.length ? { kind: 'quotes', label, items: usefulItems } : null;
}

function section(id, title, blocks) {
  const usefulBlocks = blocks.filter(Boolean);
  return usefulBlocks.length ? { id, title, blocks: usefulBlocks } : null;
}

function formatStructureItem(item) {
  if (!isObject(item)) return valueToText(item);
  const name = valueToText(item.name);
  const description = valueToText(item.description);
  const part = valueToText(item.part);
  const heading = name || (part ? `Part ${part}` : null);
  if (heading && description) return `${heading}: ${description}`;
  return heading || description;
}

function formatSubmissionItem(item) {
  if (!isObject(item)) return valueToText(item);
  const artifact = valueToText(item.artifact) || valueToText(item.description);
  const purpose = valueToText(item.purpose);
  const quantity = valueToText(item.quantity);
  const requirement = typeof item.required === 'boolean'
    ? (item.required ? 'Required' : 'Optional')
    : formatLabel(item.required);
  const details = [requirement, quantity ? `quantity: ${quantity}` : null, purpose].filter(Boolean).join('; ');
  if (artifact && details) return `${artifact} (${details})`;
  return artifact || details || null;
}

function formatCriterion(item) {
  if (!isObject(item)) return valueToText(item);
  const criterion = valueToText(item.criterion);
  const description = valueToText(item.description);
  const weight = valueToText(item.weight_percent);
  const details = [description, weight ? `${weight}%` : null].filter(Boolean).join('; ');
  if (criterion && details) return `${criterion}: ${details}`;
  return criterion || details || null;
}

function formatPolicyItem(item) {
  if (!isObject(item)) return valueToText(item);
  const scope = formatLabel(item.scope);
  const phase = valueToText(item.phase);
  const permission = formatLabel(item.permission);
  const allowed = valuesFrom(item.allowed_purposes).join(', ');
  const prohibited = valuesFrom(item.prohibited_actions).join(', ');
  const disclosure = typeof item.disclosure_required === 'boolean'
    ? `disclosure ${item.disclosure_required ? 'required' : 'not required'}`
    : null;
  const validation = typeof item.validation_required === 'boolean'
    ? `validation ${item.validation_required ? 'required' : 'not required'}`
    : null;
  return [
    [scope, phase].filter(Boolean).join(': '),
    permission,
    allowed ? `allows ${allowed}` : null,
    prohibited ? `prohibits ${prohibited}` : null,
    disclosure,
    validation
  ]
    .filter(Boolean)
    .join('; ') || null;
}

function formatLocator(locator) {
  if (!isObject(locator)) return null;
  return [
    locator.page ? `p. ${valueToText(locator.page)}` : null,
    valueToText(locator.pages),
    valueToText(locator.section),
    valueToText(locator.table) ? `table ${valueToText(locator.table)}` : null,
    valueToText(locator.figure) ? `figure ${valueToText(locator.figure)}` : null
  ]
    .filter(Boolean)
    .join(', ') || null;
}

function sourceUrl(source) {
  const explicit = valueToText(source?.url);
  if (explicit) return explicit;
  const id = valueToText(source?.id) || valueToText(source?.identifier);
  if (!id) return null;
  if (id.toLowerCase().startsWith('doi:')) return `https://doi.org/${id.slice(4)}`;
  if (id.toLowerCase().startsWith('arxiv:')) return `https://arxiv.org/abs/${id.slice(6)}`;
  return null;
}

function publicQuote(value) {
  const text = valueToText(value);
  if (!text) return null;
  if (text.length <= 320) return text;
  return `${text.slice(0, 317).trimEnd()}...`;
}

function formatCost(value) {
  const text = valueToText(value);
  return text ? (text.startsWith('$') ? text : `$${text}`) : null;
}

function buildQuickFacts(record) {
  const context = isObject(record.context) ? record.context : {};
  const course = isObject(context.course) ? context.course : {};
  const assessment = isObject(record.assessment) ? record.assessment : {};
  const facts = [];
  const contextValue = [valueToText(course.name), valueToText(course.institution), valueToText(context.discipline)]
    .filter(Boolean)
    .join(' / ');
  if (contextValue) facts.push({ label: 'Context', value: contextValue });
  const level = formatLabel(course.level_category || course.level);
  if (level) facts.push({ label: 'Level', value: level });

  const types = valuesFrom(assessment.type).map(formatLabel).filter(Boolean).join(', ');
  if (types) facts.push({ label: 'Assessment type', value: types });
  const mode = formatLabel(assessment.individual_or_group);
  if (mode) facts.push({ label: 'Mode', value: mode });

  const cohort = valueToText(context.cohort_size);
  if (cohort) facts.push({ label: 'Cohort', value: `${cohort} students` });
  const duration = formatDuration(assessment.duration_minutes);
  if (duration) facts.push({ label: 'Duration', value: duration });
  return facts;
}

function buildLearningObjectives(record) {
  const objectives = objectsFrom(record.learning_objectives)
    .map((objective) => valueToText(objective.description))
    .filter(Boolean);
  const scalarObjectives = valuesFrom(record.learning_objectives);
  return section('objectives', 'Learning objectives', [
    listBlock(null, [...objectives, ...scalarObjectives]),
    quoteBlock('Paper wording', buildExcerptItems(record, ['learning_objective']))
  ]);
}

function buildContext(record) {
  const context = isObject(record.context) ? record.context : {};
  const course = isObject(context.course) ? context.course : {};
  const purpose = isObject(record.purpose_and_stakes) ? record.purpose_and_stakes : {};
  return section('context', 'Context', [
    factsBlock('Course', [
      valueToText(context.discipline) ? { label: 'Discipline', value: valueToText(context.discipline) } : null,
      valueToText(course.name) ? { label: 'Course', value: valueToText(course.name) } : null,
      valueToText(course.level) ? { label: 'Course level', value: formatLabel(course.level) } : null,
      valueToText(course.level_category)
        ? { label: 'Course level category', value: formatLabel(course.level_category) }
        : null,
      valueToText(course.institution) ? { label: 'Institution', value: valueToText(course.institution) } : null,
      valueToText(course.program) ? { label: 'Program', value: valueToText(course.program) } : null,
      valueToText(course.term) ? { label: 'Term', value: valueToText(course.term) } : null,
      valueToText(course.academic_year) ? { label: 'Academic year', value: valueToText(course.academic_year) } : null,
      valueToText(course.delivery_language) ? { label: 'Language', value: valueToText(course.delivery_language) } : null
    ].filter(Boolean)),
    factsBlock('Learners and stakes', [
      valueToText(context.learner_level) ? { label: 'Learner level', value: valueToText(context.learner_level) } : null,
      valueToText(context.learner_level_category)
        ? { label: 'Learner level category', value: formatLabel(context.learner_level_category) }
        : null,
      valueToText(context.cohort_size) ? { label: 'Cohort', value: `${valueToText(context.cohort_size)} students` } : null,
      valuesFrom(purpose.purposes).length
        ? { label: 'Purpose', value: valuesFrom(purpose.purposes).map(formatLabel).join(', ') }
        : null,
      typeof purpose.mandatory === 'boolean' ? { label: 'Mandatory', value: purpose.mandatory ? 'Yes' : 'No' } : null,
      valueToText(purpose.course_grade_weight_percent)
        ? { label: 'Course grade weight', value: `${valueToText(purpose.course_grade_weight_percent)}%` }
        : null
    ].filter(Boolean)),
    listBlock('Prerequisites', valuesFrom(context.prerequisites)),
    quoteBlock('Paper context', buildExcerptItems(record, ['context'], true))
  ]);
}

function buildWhatStudentsDo(record) {
  const assessment = isObject(record.assessment) ? record.assessment : {};
  const structure = Array.isArray(assessment.structure)
    ? assessment.structure.map(formatStructureItem).filter(Boolean)
    : valuesFrom(assessment.structure);
  const actions = valuesFrom(assessment.student_actions);
  const inputs = Array.isArray(assessment.inputs)
    ? assessment.inputs.map(formatSubmissionItem).filter(Boolean)
    : valuesFrom(assessment.inputs);
  const outputs = Array.isArray(assessment.outputs)
    ? assessment.outputs.map(formatSubmissionItem).filter(Boolean)
    : valuesFrom(assessment.outputs);
  const submissions = Array.isArray(record.submission_requirements)
    ? record.submission_requirements.map(formatSubmissionItem).filter(Boolean)
    : valuesFrom(record.submission_requirements);
  const timing = isObject(assessment.timing) ? assessment.timing : {};
  const delivery = isObject(assessment.delivery) ? assessment.delivery : {};
  return section('students', 'What students do', [
    quoteBlock('Paper wording', buildExcerptItems(record, ['assessment_description'], true)),
    listBlock('Assessment structure', structure),
    listBlock('Student actions', actions),
    listBlock('Inputs', inputs),
    listBlock('Outputs', outputs),
    listBlock('Submission requirements', submissions),
    factsBlock('Timing and delivery', [
      formatLabel(timing.mode) ? { label: 'Timing', value: formatLabel(timing.mode) } : null,
      formatLabel(delivery.modality) ? { label: 'Modality', value: formatLabel(delivery.modality) } : null,
      formatLabel(delivery.setting) ? { label: 'Setting', value: formatLabel(delivery.setting) } : null,
      formatDuration(assessment.duration_minutes) ? { label: 'Duration', value: formatDuration(assessment.duration_minutes) } : null,
      valueToText(assessment.group_size) ? { label: 'Group size', value: valueToText(assessment.group_size) } : null
    ].filter(Boolean))
  ]);
}

function buildDesignLenses(record) {
  return section('lenses', 'Catalogue lenses', [
    listBlock(null, strategyTagsFrom(record).map(strategyTagLabel))
  ]);
}

function buildGenaiDesign(record) {
  const genai = isObject(record.genai) ? record.genai : {};
  const role = isObject(genai.student_role) ? genai.student_role : null;
  const roleFacts = role
    ? [
        { label: 'During assessment', value: formatLabel(role.during_assessment) },
        {
          label: 'External AI use',
          value:
            typeof role.external_ai_use_permitted === 'boolean'
              ? role.external_ai_use_permitted
                ? 'Permitted'
                : 'Not permitted'
              : valueToText(role.external_ai_use_permitted)
        }
      ].filter((item) => item.value)
    : [];
  const roleDescription = role ? valueToText(role.description) : valueToText(genai.student_role);
  return section('genai', 'GenAI design', [
    factsBlock('Student role', roleFacts),
    textBlock(null, roleDescription),
    quoteBlock('Paper GenAI design', buildExcerptItems(record, ['ai_policy'], true)),
    listBlock('Policy', (Array.isArray(genai.policy) ? genai.policy : []).map(formatPolicyItem).filter(Boolean)),
    listBlock('System roles', valuesFrom(genai.assessment_system_role).map(formatLabel).filter(Boolean)),
    listBlock('Tools', valuesFrom(genai.tools)),
    listBlock('Taxonomy', valuesFrom(genai.taxonomy_tags).map(formatLabel).filter(Boolean))
  ]);
}

function buildEvidence(record) {
  const evidence = isObject(record.evidence) ? record.evidence : {};
  const evidenceQuality = isObject(record.evidence_quality) ? record.evidence_quality : {};
  const reportedResults = Array.isArray(evidence.reported_results) ? evidence.reported_results : [evidence.reported_results];
  const objectMetrics = reportedResults.filter(isObject).map((metric) => ({
    label: valueToText(metric.metric) || valueToText(metric.name),
    value: formatMetricValue(metric)
  }));
  const scalarMetrics = reportedResults.filter((metric) => !isObject(metric)).map((metric) => ({ value: valueToText(metric) }));
  const studyType = formatLabel(evidence.study_type);
  return section('evidence', 'Evidence and cautions', [
    factsBlock('Catalogue evidence quality', [
      formatLabel(evidenceQuality.classification)
        ? { label: 'Classification', value: formatLabel(evidenceQuality.classification) }
        : null,
      Array.isArray(evidenceQuality.source_ids) && evidenceQuality.source_ids.length
        ? { label: 'Sources assessed', value: String(evidenceQuality.source_ids.length) }
        : null
    ].filter(Boolean)),
    listBlock('Quality basis', valuesFrom(evidenceQuality.basis)),
    listBlock('Quality limitations', valuesFrom(evidenceQuality.limitations)),
    factsBlock('Study context', [
      studyType ? { label: 'Study type', value: studyType } : null,
      valueToText(evidence.comparator) ? { label: 'Comparator', value: valueToText(evidence.comparator) } : null,
      isObject(evidence.sample) && valueToText(evidence.sample.analyzed)
        ? { label: 'Analyzed sample', value: valueToText(evidence.sample.analyzed) }
        : null
    ].filter(Boolean)),
    metricBlock('Reported metrics', [...objectMetrics, ...scalarMetrics]),
    listBlock('Instruments', valuesFrom(evidence.instruments)),
    listBlock('Reported failures', valuesFrom(evidence.reported_failures)),
    listBlock('Recommendations', valuesFrom(evidence.recommended_changes)),
    listBlock('Limitations', valuesFrom(record.limitations))
  ]);
}

function buildWorkshopPractices(record) {
  const review = isObject(record.workshop_practice_mapping_review)
    ? record.workshop_practice_mapping_review
    : {};
  const mappings = Array.isArray(record.workshop_practice_mappings)
    ? record.workshop_practice_mappings
    : [];
  const matches = mappings
    .filter(isObject)
    .map((mapping) => {
      const name = valueToText(mapping.practice_name);
      const rationale = valueToText(mapping.rationale);
      return [name, rationale].filter(Boolean).join(': ');
    })
    .filter(Boolean);
  return section('workshop-practices', 'Assessment practice mappings', [
    factsBlock('Mapping review', [
      formatLabel(review.status) ? { label: 'Status', value: formatLabel(review.status) } : null,
      valueToText(review.recorded_at) ? { label: 'Recorded', value: valueToText(review.recorded_at) } : null,
      valueToText(review.method) ? { label: 'Method', value: valueToText(review.method) } : null
    ].filter(Boolean)),
    listBlock('Matched practices', matches),
    textBlock('Review notes', review.notes)
  ]);
}

function buildExcerptItems(record, kinds, includeLegacy = false) {
  const sources = Array.isArray(record.sources) ? record.sources.filter(isObject) : [];
  const sourceById = new Map(sources.map((source) => [valueToText(source.id), source]));
  const explicit = Array.isArray(record.evidence_excerpts) ? record.evidence_excerpts : [];
  const selected = explicit.filter((excerpt) => kinds.includes(valueToText(excerpt?.kind)));
  const explicitQuoteKeys = new Set(
    explicit.map((excerpt) => `${valueToText(excerpt?.source_id)}\u0000${valueToText(excerpt?.quote)}`)
  );
  const fallback = includeLegacy
    ? sources.flatMap((source) => {
        const quote = valueToText(source.evidence_quote);
        if (!quote || explicitQuoteKeys.has(`${valueToText(source.id)}\u0000${quote}`)) return [];
        return excerptKindsForQuote(quote)
          .filter((kind) => kinds.includes(kind))
          .map((kind) => ({
            kind,
            quote,
            source_id: source.id,
            locator: source.locator,
            supports: supportsForExcerptKind(kind),
            context: 'authors_report'
          }));
      })
    : [];
  return [...selected, ...fallback]
    .filter(isObject)
    .map((excerpt) => {
      const source = sourceById.get(valueToText(excerpt.source_id));
      const sourceTitle = valueToText(source?.title) || valueToText(excerpt.source_id);
      const locator = formatLocator(excerpt.locator || source?.locator);
      return {
        quote: publicQuote(excerpt.quote),
        label: strategyTagLabel(excerpt.kind),
        source: sourceTitle,
        url: sourceUrl(source),
        locator,
        supports: valueToText(excerpt.supports),
        context: formatLabel(excerpt.context)
      };
    })
    .filter((excerpt) => excerpt.quote);
}

function buildEvidenceExcerpts(record) {
  const excerpts = buildExcerptItems(record, ['verification', 'grading', 'outcome', 'limitation', 'source_context'], true);
  return section('excerpts', 'Evidence excerpts', [quoteBlock(null, excerpts)]);
}

function buildVerification(record) {
  const authenticity = isObject(record.authenticity_integrity) ? record.authenticity_integrity : {};
  return section('verification', 'Verification and integrity', [
    textBlock('Professional scenario', authenticity.professional_scenario),
    textBlock('Intended audience', authenticity.intended_audience),
    textBlock('Threat model', authenticity.threat_model),
    listBlock('Controls', valuesFrom(authenticity.controls)),
    listBlock('Process evidence', valuesFrom(authenticity.process_evidence))
  ]);
}

function buildGrading(record) {
  const grading = isObject(record.grading) ? record.grading : {};
  const scale = isObject(grading.scale) ? grading.scale : {};
  const validation = isObject(grading.human_validation) ? grading.human_validation : null;
  const review = isObject(grading.human_review_trigger) ? grading.human_review_trigger : null;
  const validationFacts = validation
    ? [
        {
          label: 'Human validation',
          value:
            typeof validation.performed === 'boolean'
              ? validation.performed
                ? 'Performed'
                : 'Not performed'
              : valueToText(validation.performed)
        }
      ].filter((item) => item.value)
    : [];
  const reviewFacts = review
    ? [
        {
          label: 'Review trigger implemented',
          value:
            typeof review.implemented === 'boolean'
              ? review.implemented
                ? 'Yes'
                : 'No'
              : valueToText(review.implemented)
        },
        {
          label: 'Review trigger recommended',
          value:
            typeof review.recommended === 'boolean'
              ? review.recommended
                ? 'Yes'
                : 'No'
              : valueToText(review.recommended)
        }
      ].filter((item) => item.value)
    : [];
  return section('grading', 'Grading and human review', [
    factsBlock('Grading setup', [
      valueToText(scale.maximum) ? { label: 'Maximum', value: valueToText(scale.maximum) } : null,
      formatLabel(scale.kind) ? { label: 'Scale', value: formatLabel(scale.kind) } : null,
      formatLabel(grading.method) ? { label: 'Method', value: formatLabel(grading.method) } : null
    ].filter(Boolean)),
    listBlock('Criteria', objectsFrom(grading.criteria).map(formatCriterion).filter(Boolean)),
    listBlock('Assessors', valuesFrom(grading.assessors)),
    listBlock('Models', valuesFrom(grading.models)),
    listBlock('Process', valuesFrom(grading.process)),
    textBlock('Feedback', grading.feedback),
    textBlock('Resubmission', grading.resubmission),
    factsBlock(null, validationFacts),
    textBlock('Human validation', validation?.description),
    factsBlock(null, reviewFacts),
    textBlock('Human review trigger', review?.description)
  ]);
}

function buildImplementation(record) {
  const implementation = isObject(record.implementation) ? record.implementation : {};
  const reuse = isObject(record.reuse) ? record.reuse : {};
  const cost = isObject(implementation.reported_cost) ? implementation.reported_cost : {};
  const reuseLabels = [
    ['demo_available', 'Demo available'],
    ['examiner_prompt_available', 'Examiner prompt available'],
    ['grading_prompt_available', 'Grading prompt available'],
    ['hosted_system_available', 'Hosted system available']
  ];
  const reuseFacts = reuseLabels
    .map(([field, label]) => {
      if (typeof reuse[field] === 'boolean') return { label, value: reuse[field] ? 'Yes' : 'No' };
      const value = valueToText(reuse[field]);
      return value ? { label, value } : null;
    })
    .filter(Boolean);
  const license = valueToText(reuse.assessment_artifact_license);
  if (license) reuseFacts.push({ label: 'Assessment artifact license', value: license });
  const costFacts = [
    formatCost(cost.total_usd) ? { label: 'Total reported cost', value: formatCost(cost.total_usd) } : null,
    formatCost(cost.cost_per_student_usd)
      ? { label: 'Reported cost per student', value: formatCost(cost.cost_per_student_usd) }
      : null,
    typeof cost.subscription_cost_excluded === 'boolean'
      ? { label: 'Subscription cost', value: cost.subscription_cost_excluded ? 'Excluded' : 'Included' }
      : null
  ].filter(Boolean);
  return section('implementation', 'Implementation and reuse', [
    listBlock('Architecture', valuesFrom(implementation.architecture)),
    listBlock('Platforms', valuesFrom(implementation.platforms)),
    listBlock('Personalization inputs', valuesFrom(implementation.personalization_inputs)),
    factsBlock('Workload and staffing', [
      typeof implementation.student_workload_hours === 'number'
        ? { label: 'Student workload', value: `${implementation.student_workload_hours} hours` }
        : null,
      typeof implementation.instructor_workload_hours === 'number'
        ? { label: 'Instructor workload', value: `${implementation.instructor_workload_hours} hours` }
        : null,
      implementation.staffing ? { label: 'Staffing', value: valueToText(implementation.staffing) } : null
    ].filter(Boolean)),
    factsBlock('Reported cost', costFacts),
    listBlock('Failure modes', valuesFrom(implementation.failure_modes)),
    listBlock('Design changes', valuesFrom(implementation.design_changes)),
    factsBlock('Reuse', reuseFacts)
  ]);
}

function buildCatalogueSynthesis(record) {
  const synthesis = isObject(record.catalogue_synthesis) ? record.catalogue_synthesis : {};
  return section('guidance', 'Catalogue guidance', [
    textBlock('Design move', synthesis.design_move),
    textBlock('Why it may help', synthesis.why_it_may_help),
    listBlock('Adaptation notes', valuesFrom(synthesis.adaptation_notes)),
    listBlock('Cautions', valuesFrom(synthesis.cautions))
  ]);
}

function formatSource(source) {
  if (!isObject(source)) {
    const text = valueToText(source);
    return text ? { title: text, metadata: [] } : null;
  }
  const url = sourceUrl(source);
  const title = valueToText(source.title) || valueToText(source.identifier) || url || valueToText(source.id);
  const metadata = [
    formatLabel(source.type),
    valuesFrom(source.authors).join(', ') || null,
    valueToText(source.publication_date) || valueToText(source.year),
    valueToText(source.identifier),
    valueToText(source.relationship_to_assessment),
    formatLocator(source.locator),
    typeof source.peer_reviewed === 'boolean' ? `Peer reviewed: ${source.peer_reviewed ? 'Yes' : 'No'}` : null,
    valueToText(source.license)
  ].filter(Boolean);
  return title || metadata.length || url ? { title, url, metadata } : null;
}

function buildProvenance(record) {
  const metadata = isObject(record.catalog_metadata) ? record.catalog_metadata : {};
  const sourceQuality = isObject(metadata.source_quality)
    ? Object.entries(metadata.source_quality)
        .map(([source, quality]) => {
          const value = formatLabel(quality);
          return value ? `${source}: ${value}` : null;
        })
        .filter(Boolean)
    : [];
  return [
    factsBlock('Catalogue record', [
      valueToText(record.id) ? { label: 'Record ID', value: valueToText(record.id) } : null,
      valueToText(record.schema_version) ? { label: 'Schema version', value: valueToText(record.schema_version) } : null,
      formatLabel(metadata.verification_status)
        ? { label: 'Verification status', value: formatLabel(metadata.verification_status) }
        : valueToText(record.provenance?.status)
          ? { label: 'Source verification', value: formatLabel(record.provenance.status) }
          : null
    ].filter(Boolean)),
    listBlock('Source quality', sourceQuality),
    textBlock('Catalogue notes', metadata.notes)
  ].filter(Boolean);
}

function buildSources(record) {
  const sources = Array.isArray(record.sources) ? record.sources.map(formatSource).filter(Boolean) : [];
  return section('sources', 'Sources and catalogue provenance', [
    sources.length ? { kind: 'sources', items: sources } : null,
    ...buildProvenance(record)
  ]);
}

function suppressContextTaskQuoteDuplicates(sections) {
  const students = sections.find((section) => section.id === 'students');
  const taskQuotes = new Set(
    (students?.blocks || [])
      .filter((block) => block.kind === 'quotes')
      .flatMap((block) => block.items.map((item) => item.quote))
  );
  if (!taskQuotes.size) return sections;

  return sections.map((section) => {
    if (section.id !== 'context') return section;
    const blocks = section.blocks
      .map((block) => {
        if (block.kind !== 'quotes') return block;
        const items = block.items.filter((item) => !taskQuotes.has(item.quote));
        return items.length ? { ...block, items } : null;
      })
      .filter(Boolean);
    return { ...section, blocks };
  });
}

function buildMatching(ranked, mode, query) {
  const facets = Array.isArray(ranked)
    ? ranked
        .map((facet) => {
          if (!isObject(facet)) return null;
          const label = valueToText(facet.label);
          const text = valueToText(facet.text);
          const hasScore = ['hybridScore', 'semanticScore', 'keywordScore'].some(
            (field) => typeof facet[field] === 'number' && Number.isFinite(facet[field])
          );
          return label || text || hasScore
            ? {
                label,
                text,
                hybridScore: typeof facet.hybridScore === 'number' && Number.isFinite(facet.hybridScore) ? facet.hybridScore : null,
                semanticScore:
                  typeof facet.semanticScore === 'number' && Number.isFinite(facet.semanticScore) ? facet.semanticScore : null,
                keywordScore:
                  typeof facet.keywordScore === 'number' && Number.isFinite(facet.keywordScore) ? facet.keywordScore : null
              }
            : null;
        })
        .filter(Boolean)
    : [];
  const modeText =
    mode === 'reranked'
      ? 'Cloudflare reranker + keyword'
      : mode === 'hybrid'
        ? 'Semantic + keyword'
        : mode === 'keyword'
          ? 'Keyword fallback'
          : valueToText(mode);
  const match = { mode: modeText, query: valueToText(query), facets };
  return match.mode || match.query || facets.length ? match : null;
}

export function buildDisplayModel(record, ranked = [], mode, query) {
  const safeRecord = isObject(record) ? record : {};
  const context = isObject(safeRecord.context) ? safeRecord.context : {};
  const course = isObject(context.course) ? context.course : {};
  const eyebrow = [valueToText(course.institution), valueToText(context.discipline)].filter(Boolean).join(' / ');
  const best = Array.isArray(ranked) && isObject(ranked[0]) ? ranked[0] : null;
  const passage = best ? valueToText(best.text) : null;
  const bestLabel = best ? valueToText(best.label) : null;
  const matchedTerms = best ? valuesFrom(best.matchedTerms) : [];
  const whyMatched = passage || bestLabel || matchedTerms.length ? { label: bestLabel, passage, matchedTerms } : null;
  const sections = suppressContextTaskQuoteDuplicates([
    buildContext(safeRecord),
    buildLearningObjectives(safeRecord),
    buildWhatStudentsDo(safeRecord),
    buildDesignLenses(safeRecord),
    buildWorkshopPractices(safeRecord),
    buildGenaiDesign(safeRecord),
    buildEvidence(safeRecord),
    buildVerification(safeRecord),
    buildEvidenceExcerpts(safeRecord),
    buildCatalogueSynthesis(safeRecord),
    buildGrading(safeRecord),
    buildImplementation(safeRecord),
    buildSources(safeRecord)
  ].filter(Boolean));

  return {
    title: valueToText(safeRecord.title),
    summary: valueToText(safeRecord.summary),
    eyebrow: eyebrow || null,
    quickFacts: buildQuickFacts(safeRecord),
    whyMatched,
    sections,
    matching: buildMatching(ranked, mode, query)
  };
}
