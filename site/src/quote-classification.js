const normalizedQuote = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const AI_PATTERNS = [
  /\bchatgpt\b/,
  /\bcopilot\b/,
  /\bgen(?:erative)?\s*ai\b/,
  /\bgenai\b/,
  /\bartificial intelligence\b/,
  /\bllm(?:s)?\b/,
  /\bchatbot\b/,
  /\bai[- ](?:powered|generated|generation|tutor|tool|tools)\b/,
  /\bno ai\b/,
  /\b(?:encouraged|required|instructed) to use ai\b/,
  /\bno external tools\b/,
  /\bpolicy\b.{0,35}\b(?:permit|permitted|allow|allowed|prohibit|prohibited|use)\b/,
  /\b(?:codehelp|codetutor|ragman|aida|cwgpt|workedgen)\b/,
  /\b(?:plugin|api|ide)\b.*\b(?:ai|chatgpt|llm|feedback)\b/,
  /\b(?:ai|chatgpt|llm|chatbot)\b.*\b(?:plugin|api|ide|feedback)\b/
];

const TASK_PATTERNS = [
  /\b(?:add\w*|implement\w*|develop\w*|writ\w*|solv\w*|complet\w*|submit\w*|upload\w*|document\w*|attach\w*|design\w*|creat\w*|generat\w*|fix\w*|debug\w*|answer\w*|produc\w*|present\w*|analy[sz]\w*|compar\w*|construct\w*|craft\w*|teach\w*|obtain\w*|reflect\w*|review\w*|request\w*|correct\w*|resubmit\w*|demonstrat\w*|select\w*|initi\w*|attend\w*)\b/,
  /\b(?:students?|participants?|learners?|crowdworkers?|they)\b.{0,70}\b(?:asked|required|instructed|tasked|must|had to|complete|submit|upload|document|attach|write|solve|create|generate|design|develop|fix|answer|produce|present|analy[sz]\w*|compare|construct|craft|teach|obtain|reflect|request|correct|resubmit|demonstrat|evaluate)\b/,
  /\b(?:task|assignment|exercise|project|quiz|exam|assessment|activity|homework|challenge|problem|question)\b.{0,45}\b(?:required|asked|instructed|complete|submit|write|solve|create|generate|design|develop|fix|answer|produce|present|perform|select|correct|resubmit)\b/,
  /\b(?:log|report|submission) should include\b/,
  /\bgot the exercise to\b/,
  /\bquestions were used across .+ lab assignments\b/,
  /\bdiagrams were used to describe the exercises\b/,
  /\bcompletion of\b/,
  /\?\s*$/
];

const CONTEXT_PATTERNS = [
  /\b(?:course|class|semester|term|enrollment|cohort|duration|minutes?|hours?|weeks?|academic|classroom|onsite|in person|setting|study|experiment|research|sample|visit)\b/,
  /\b\d+\s+(?:students?|participants?|learners?|groups?|teams?)\b/,
  /\b(?:students?|participants?|learners?)\b.{0,20}\b(?:aged|enrolled)\b/,
  /\b(?:teams?|groups?)\s+of\s+\d+\b/,
  /\b(?:first|second|third|fourth|fifth|sixth|final)[ -](?:year|semester)\b/
];

const GRADING_PATTERNS = [
  /\b(?:grade|graded|grading|marking|marks|rubric|weighted|weight|score|scored)\b/,
  /\b\d+\s*%\b/,
  /\bcount(?:s|ed)? towards\b/,
  /\bperformance did not count\b/,
  /\b\d+\s*pts?\b/
];

const VERIFICATION_PATTERNS = [
  /\b(?:live|oral) (?:assessment|exam|examination|interview|response)\b/,
  /\bcode interviews?\b/,
  /\bquestion types?\b/,
  /\bquestion[- ]answer session\b/,
  /\bq&a\b/,
  /\b(?:present|presentation|defend|defense|demonstrat\w*)\b/,
  /\b(?:invigilated|proctored)\b/,
  /\bwithout (?:chatgpt|genai|ai)\b.{0,40}\b(?:quiz|exam|assessment|test)\b/,
  /\b(?:quiz|exam|assessment|test)\b.{0,40}\b(?:without|not allowed to use)\b.{0,20}\b(?:chatgpt|genai|ai)\b/
];

const OTHER_PATTERNS = [
  /\b(?:learning outcome|understanding|knowledge|capacity|ability)\b/,
  /\b(?:evaluated|evaluation|benchmark|a\/b test|comparison)\b/,
  /\b(?:total of|in total|collected|selected|generated)\s+\d+\b/,
  /\b(?:limitation|brief description|do not provide)\b/
];

const HUMAN_ACTOR_PATTERNS = [
  /\b(?:students?|participants?|learners?|crowdworkers?|they)\b/
];

const TASK_OBJECT_PATTERNS = [
  /\b(?:course|class|assignment|exercise|project|task|quiz|exam|assessment|activity|homework|challenge|problem|question|lab)s?\b/
];

const SYSTEM_ACTOR_PATTERNS = [
  /\b(?:model|llm|tool|system|plugin|aida|workedgen|puzzlemaker|chatgpt|copilot|chatbot|genai)\b/
];

const REPORTING_PATTERNS = [
  /\b(?:we|our work|this article|the study|the analysis|researchers?)\b.{0,25}\b(?:created|generated|evaluated|collected|selected|designed|conducted|reports?|present)\b/
];

const LEADING_ACTION_PATTERN = /^\s*(?:add|attach|complete|compare|construct|create|demonstrate|develop|design|document|fix|implement|obtain|present|reflect|resubmit|solve|submit|upload|use|write)\b/;

const DEPLOYMENT_ONLY_PATTERNS = [
  /\bsemester in which .+ took place\b/,
  /^generated automated feedback using .+ for four lab assignments$/,
  /^aida to respond to \d+ of them$/,
  /^ipssc was used to scaffold/
];

/** Return every catalogue section that an exact quotation substantively supports. */
export function excerptKindsForQuote(value) {
  const text = normalizedQuote(value);
  if (!text) return [];

  const hasAi = hasAny(text, AI_PATTERNS);
  const isDeploymentOnly = hasAny(text, DEPLOYMENT_ONLY_PATTERNS);
  const hasTaskWords = hasAny(text, TASK_PATTERNS);
  const hasHumanActor = hasAny(text, HUMAN_ACTOR_PATTERNS);
  const hasTaskObject = hasAny(text, TASK_OBJECT_PATTERNS);
  const hasSystemActor = hasAny(text, SYSTEM_ACTOR_PATTERNS);
  const hasReporting = hasAny(text, REPORTING_PATTERNS);
  const hasQuestionPrompt = /\?\s*$/.test(text);
  const hasLeadingAction = LEADING_ACTION_PATTERN.test(text);
  const hasArtifactInstruction = /\b(?:log|report|submission) should include\b/.test(text);
  const hasOpportunity = /\b(?:opportunity|goal)\b/.test(text);
  const hasTask = hasTaskWords && (
    hasHumanActor ||
    hasQuestionPrompt ||
    hasLeadingAction ||
    hasArtifactInstruction ||
    (hasTaskObject && (!hasSystemActor || hasOpportunity) && !hasReporting)
  );
  const hasContext = hasAny(text, CONTEXT_PATTERNS);
  const hasGrading = hasAny(text, GRADING_PATTERNS);
  const hasVerification = hasAny(text, VERIFICATION_PATTERNS);
  const hasOther = hasAny(text, OTHER_PATTERNS);
  const kinds = [];

  if (hasTask) kinds.push('assessment_description');
  if (hasContext && !hasTask && !hasAi && !hasGrading && !hasVerification) kinds.push('context');
  if (hasAi && !isDeploymentOnly) kinds.push('ai_policy');
  if (hasGrading) kinds.push('grading');
  if (hasVerification) kinds.push('verification');
  if (!kinds.length && isDeploymentOnly) kinds.push(hasContext ? 'context' : 'source_context');
  if (!kinds.length && hasOther) kinds.push('source_context');
  if (!kinds.length) kinds.push('source_context');
  return kinds;
}

export function supportsForExcerptKind(kind) {
  return {
    assessment_description: 'What students do',
    context: 'Course and learner context',
    ai_policy: 'GenAI design',
    grading: 'Grading and stakes',
    verification: 'Independent verification of student understanding',
    source_context: 'Source-reported detail'
  }[kind] || 'Source-reported detail';
}
