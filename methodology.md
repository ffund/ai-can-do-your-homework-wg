# Methodology


## Related work

Three prior working-group reviews used complementary lenses:

* *The Robots Are Here* used a scoping review to identify major themes, opportunities, challenges, and potential impacts of LLMs on computing education
* *Beyond the Hype* used a systematic literature review to summarize reported evidence, describe how GenAI was incorporated into teaching, and examine motivations for those choices
* *The Rest of the Robots* focused on post-introductory computing courses, asking which subjects and activities appeared in the literature, how instructors integrated GenAI, and what trends emerged in activities, assessment, skills, policies, and learning objectives. 

This review uses the student-facing assessment as the unit of analysis across the postsecondary computing curriculum, including assessments that preserve controlled or AI-free work, evaluate an existing task against GenAI capability, or incorporate GenAI into the task. The workshop report captures questions, strategies, and practices raised by educators, the educator survey captures additional current and contemplated practice, and the systematic review establishes which assessment practices appear in published research and what evidence the literature provides.

## Research Question

This literature review examines how current assessment practice in computing education is reflected in the published research record. We ask the following research question:

**Which assessment practices identified by computing educators are represented in the published literature, and what type and strength of evidence does each receive?**

Answering this question requires first identifying the concrete assessment practices that are being considered by educators, and then systematically searching the literature for corresponding examples. For each practice represented in the literature, we characterize the nature of the published evidence, distinguishing descriptive or proposed approaches from implemented practices and empirical evaluations. This allows us to identify areas where practitioner activity and published research converge, as well as practices that appear to be emerging ahead of the research literature.

## Constructing the Practice Inventory

Our working group held an online workshop with computing educators focused on how assessment is being adapted in response to generative AI. The workshop was organized around seven assessment strategy areas, including open-ended and authentic task design, ambitious AI-leveraged projects, evaluating and fixing AI-produced work, controlled and AI-free assessment, process evidence, rubric and grading redesign, and oral and interactive assessment. We reviewed the workshop report to identify concrete assessment practices discussed by participants, treating a practice as a distinct action or design approach that an instructor could implement - for example, requiring students to critique AI-generated code, collecting process evidence, or using oral verification of submitted work. Similar examples mentioned in different rooms were consolidated into a single practice where they represented the same underlying approach. 

This process produced an inventory of 59 distinct practices discussed by educators during the workshop. We use this inventory as a practitioner-derived framework for examining the published literature, allowing us to assess which practices have been previously reported or studied and what forms of evidence are available for each.

## Constructing the Assessment Catalogue

To characterize how computing assessments are being adapted in response to generative AI, we construct a catalogue of distinct student-facing assessments described in the published literature. The catalogue treats the assessment, rather than the publication, as the primary unit of analysis: a single source may describe multiple assessments. The resulting catalogue provides the evidence base for comparing published assessment designs with the practices identified through our workshop and for characterizing the type and strength of evidence associated with each practice.

We initialize the candidate corpus using references identified by the three recent computing-education working-group reports. We then perform a round of forward citation searching using Google Scholar to identify later work that cites it. Newly identified sources themselves eligible for forward citation searching, and we continue this process until an iteration produces no new eligible sources.

The three prior working-group reviews provide substantial coverage of the terminology used during the first several years of GenAI in computing education. The 2023 review searched broadly for terms such as: large language models, generative AI, Codex, and GPT model names, while the 2024 review expanded this vocabulary to include named systems such as ChatGPT, Gemini, Claude, and Copilot alongside broader computing-education and pedagogical terms. The 2025 Rest of the Robots review broadened the search further, combining computing-domain terms with an extensive GenAI block—including GPT models, ChatGPT, OpenAI, Gemini, Bard, Claude, Copilot, Llama, Mixtral, DeepSeek, and Codex—and pedagogical terms including assignment, homework, project, assessment, grading, and exam. 

Because this final review searched literature through June 2025, our supplementary search is intended primarily to capture work that may not be well represented in these earlier corpora. We therefore target publications appearing after the prior searches and newer or emerging terminology associated with increasingly agentic forms of GenAI use, including terms such as AI agent, agentic, coding agent, software engineering agent, AI pair programmer, and vibe coding, combined with computing-education and assessment terms.

First, we conduct a temporal update search covering July 2025 through the date of our search. We search ACM Digital Library, IEEE Xplore, and Scopus using three concept blocks:

```text
COMPUTING =
"computer science" OR "computer engineering" OR "software engineering"
OR "computing education" OR "cs education"

GENAI =
"generative AI" OR "large language model" OR "large language models"
OR LLM OR LLMs OR ChatGPT OR GPT OR OpenAI OR Gemini OR Claude
OR Copilot OR Llama OR DeepSeek OR Codex

ASSESSMENT =
assessment OR assignment OR homework OR project OR capstone
OR coursework OR grading OR exam OR examination OR quiz
OR laboratory OR lab OR "oral assessment"
```

The three blocks are combined as:

```
COMPUTING AND GENAI AND ASSESSMENT
```

Second, we conduct a terminology-gap search intended to capture work that may not have been retrieved by earlier GenAI vocabulary. This search covers 2022 through the date of our search and replaces the general GenAI block with newer agent-oriented terminology:

```text
AGENTIC_AI =
"AI agent" OR "AI agents"
OR "coding agent" OR "coding agents"
OR "programming agent" OR "programming agents"
OR "software engineering agent" OR "software engineering agents"
OR "agentic AI" OR "agentic coding" OR agentic
OR "AI pair programmer" OR "AI pair programming"
OR "vibe coding"
```

The terminology-gap search is therefore:

```
COMPUTING AND AGENTIC_AI AND ASSESSMENT
```

This produces a candidate set of **X** sources. The search record for each entry in the candidate set includes (as relevant): the source WG report, source database, query, search date, deduplication decision, and reason for adding a source through citation or supplementary searching.

In addition to the systematically identified peer-reviewed literature, we include supplementary practice sources when they describe a concrete student-facing assessment relevant to the catalogue. These sources may include arXiv preprints, course websites, assignment specifications, instructor blog posts, institutional teaching resources, workshop materials, and public repositories such as GitHub. We do not treat these materials as part of the systematic evidence base and do not use them to make claims about prevalence or effectiveness. Instead, they serve to document emerging practices that may not yet have reached the peer-reviewed literature. Each catalogue record retains its source type and discovery method so that peer-reviewed evidence can be distinguished from non-peer-reviewed practice descriptions.

Next, we screen entries in the candidate set for eligibility. 

We include a source when it addresses computing education within the review's GenAI or AI-aware assessment scope and treats one or more student assessments as a meaningful subject of the study. The assessment may be an assignment, homework task, exercise, problem set, quiz, exam, laboratory, project, capstone, design task, oral assessment, or related assessment activity. We include sources that design, redesign, implement, evaluate, generate, grade, support, or study student use of these assessments, including sources that examine an existing assessment with GenAI rather than introducing a new intervention.

We exclude sources in which coursework or assignments appear only as incidental context; sources about general attitudes or tool use without a substantive assessment focus; bibliometric or broad mapping studies that do not describe particular assessments; and sources about professional or institutional evaluation without student work as the unit of analysis. We use the full text for this decision and retain borderline sources when the assessment connection remains plausible.

We record the decision and exclusion reason for each entry.

## Structured Data Extraction

For each included source, we use an LLM to extract assessment descriptions into a structured record, using the source's full text. The schema stores one record per distinct student-facing assessment. Each record captures identity and provenance, course and learner context, purpose and stakes, learning objectives, student actions, inputs, required outputs, participation, timing, delivery, grading, scaffolding, authenticity and integrity controls, implementation details, reported evidence, limitations, and reusable artifacts. Records also retain the source type and discovery method so that systematically identified peer-reviewed evidence can be distinguished from supplementary practice sources such as preprints, course materials, repositories, and instructor write-ups.

A dedicated GenAI section records the assignment's relationship to AI; whether external AI use is required, permitted, optional, restricted, or prohibited; the tools and system roles involved; allowed and prohibited uses; disclosure and citation requirements; interaction transcripts or logs; validation requirements; and privacy or retention rules. 

The structured record also includes an evidence section describing what, if anything, the source reports about the assessment beyond its design. We record the type of evidence provided, such as an experience report, qualitative study, observational analysis, or comparative or experimental evaluation, together with the major findings reported by the authors. We separately capture concerns, limitations, failure modes, and unresolved questions raised in connection with the assessment, including concerns that arise from instructor or student experience even when they are not evaluated empirically. These fields allow us to distinguish assessments that are merely described from those that have been implemented or evaluated.

Finally, we map each assessment to the workshop-derived practice inventory. For every catalogue record, the LLM considers each of the identified workshop practices and assigns zero or more candidate matches based on the concrete assessment design described in the source. Each proposed mapping records the corresponding practice, the source passage supporting the match, and a brief rationale. Practice mappings are not inferred merely from broad topical similarity: the assessment must instantiate the action or design approach represented by the workshop practice. Because a single assessment may combine several approaches, multiple practice mappings are permitted.


We analyze the structured records at both the assessment and source levels. At the assessment level, we normalize assessment type, course and learner context, purpose and stakes, implementation status, student-AI relationship, AI policy, learning objectives, grading and verification mechanisms, workshop-practice mappings, and reported evidence. Course and learner-level categories preserve the reported wording and record whether any normalized mapping was reported or inferred; academic year alone is not treated as sufficient evidence of course level. At the source level, records sharing a source identifier are collapsed when counting studies or evidence claims. The workshop-practice mappings allow us to determine which practitioner-identified practices are represented in the catalogue and to associate those practices with the types of evidence reported in the literature. Supplementary practice sources may establish that an assessment or practice exists, but they are kept separate from the systematic evidence base when making claims about research coverage, prevalence, or effectiveness.

## Synthesis

We synthesize the catalogue around the workshop-derived practice inventory. For each practice, we identify the assessments in the catalogue that instantiate it and summarize the contexts in which it appears, including course level, assessment type, role of GenAI, grading or verification approach, and implementation setting. Because a single assessment may instantiate multiple practices, assessments may contribute to more than one practice-level synthesis. We also identify practices from the workshop for which we find no corresponding assessment in the literature or supplementary practice sources.

For each represented practice, we summarize the evidence reported by the associated sources. We distinguish between sources that merely propose or describe an assessment, sources that report implementation experience, and sources that provide empirical evaluation. We aggregate the major findings, reported outcomes, concerns, limitations, and failure modes associated with each practice while retaining links to the underlying assessment and source records. Where multiple studies address the same practice, we compare their findings. 

The resulting synthesis therefore characterizes each workshop-derived practice along three dimensions: **representation**, describing whether and how the practice appears in the literature; **evidence**, describing the kinds of studies and findings associated with it; and **open concerns**, describing recurring limitations, tensions, or unresolved questions. This allows us to identify practices that are both common and comparatively well studied, practices that appear frequently but have little evidence beyond experience reports, practices that are emerging primarily in practitioner sources, and practices raised in the workshop that remain largely absent from the published literature.

## Instructor-Facing Catalogue

In addition to the research synthesis, we use the structured assessment records to produce an instructor-facing catalogue designed for practical exploration of the collected examples. Each catalogue entry presents the assessment in a form that foregrounds the information most useful for adaptation, including course and learner context, learning objectives, student task, role of GenAI, required outputs, grading and verification approach, implementation details, reported findings, concerns, and links to the original source or reusable materials where available. The catalogue therefore exposes the underlying structured records without requiring instructors to navigate the literature paper by paper.

The catalogue supports multiple forms of search. Instructors can use conventional keyword search to locate assessments containing particular terms, semantic search to find conceptually similar examples even when the source uses different terminology, and structured filters derived from the catalogue schema. These filters allow users to narrow results by characteristics such as course level, assessment type, learning objective, role of GenAI, AI-use policy, grading or verification mechanism, workshop-derived practice, source type, and type of evidence reported. Search modes can be combined so that, for example, an instructor can request assessments involving code critique, restrict the results to upper-level courses in which AI use is required, and prioritize examples with reported implementation evidence.

The purpose of the catalogue is not to recommend a single preferred response to generative AI, but to make the range of documented assessment designs inspectable in relation to an instructor's own context. Each result remains linked to its provenance and supporting evidence, allowing instructors to distinguish well-evaluated approaches from experience reports, emerging practices, and non-peer-reviewed examples, and to examine reported concerns or limitations before adapting an assessment for their own course.