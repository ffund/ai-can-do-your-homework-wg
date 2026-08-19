import {
  FILTER_DEFINITIONS,
  buildFacets,
  extractFilterOptions,
  filterRecords,
  normalizeRecords,
  rankRecords,
  shuffleRecords
} from './search.js';
import { buildDisplayModel, formatLabel } from './catalogue-view.js';
import queryListMarkdown from './suggested-queries.md?raw';
import './styles.css';

const MAX_RERANK_RECORDS = 80;
const MAX_RERANK_TEXT_LENGTH = 4000;
const MAX_PROTECTED_RERANK_FACETS = 24;
const CATALOGUE_MANIFEST = 'data/assessments/index.json';
const PROTECTED_RERANK_LABELS = new Set([
  'Overview',
  'Context',
  'Assessment design',
  'Grading and human review',
  'Sources',
  'Evidence excerpts'
]);
const SEARCH_API_URL = import.meta.env.VITE_SEARCH_API_URL || `${import.meta.env.BASE_URL}api/rerank`;

const form = document.querySelector('#search-form');
const queryInput = document.querySelector('#query');
const clearButton = document.querySelector('#clear-query');
const searchButton = document.querySelector('#search-button');
const feedbackText = document.querySelector('#feedback-text');
const feedback = document.querySelector('#search-feedback');
const results = document.querySelector('#results');
const resultCount = document.querySelector('#result-count');
const filterPanel = document.querySelector('#catalogue-filters');
const filterControls = document.querySelector('#filter-controls');
const filterCount = document.querySelector('#filter-count');
const clearFiltersButton = document.querySelector('#clear-filters');
const modelStatus = document.querySelector('#model-status');
const suggestionList = document.querySelector('#suggestion-list');

let records = [];
let recordSearchEntries = [];
let filterOptions = {};
let activeFilters = {};
let activeSearch = 0;

function sampleSuggestions(markdown, count = 3) {
  const queries = [...markdown.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1].trim());
  for (let index = queries.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [queries[index], queries[randomIndex]] = [queries[randomIndex], queries[index]];
  }
  return queries.slice(0, count);
}

function renderSuggestions() {
  sampleSuggestions(queryListMarkdown).forEach((query) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.dataset.query = query;
    button.textContent = query;
    suggestionList.append(button);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setFeedback(message, state = 'ready') {
  feedback.dataset.state = state;
  feedbackText.textContent = message;
}

function setModelStatus(message) {
  modelStatus.textContent = message;
}

function setSearchBusy(isBusy) {
  form.setAttribute('aria-busy', String(isBusy));
  results.setAttribute('aria-busy', String(isBusy));
}

function recordCountText(count) {
  return `${count} ${count === 1 ? 'record' : 'records'}`;
}

function filteredRecords() {
  return filterRecords(records, activeFilters);
}

function updateRecordCounts(count = filteredRecords().length) {
  resultCount.textContent = recordCountText(count);
  filterCount.textContent = `${count} of ${records.length} ${records.length === 1 ? 'record' : 'records'}`;
}

function renderEmptyState(message, count = 0) {
  const showAllLink = count
    ? ' <a class="show-all-link" href="#results" data-show-all>Show all</a>'
    : '';
  results.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}${showAllLink}</p></div>`;
  updateRecordCounts(count);
}

function renderFilters() {
  const definitions = FILTER_DEFINITIONS.filter(({ key }) => filterOptions[key]?.length);
  filterPanel.hidden = !definitions.length;
  if (!definitions.length) return;

  filterControls.innerHTML = definitions
    .map(
      ({ key, label }) => `
        <details class="filter-control">
          <summary>
            <span>${escapeHtml(label)}</span>
            <small data-filter-summary="${escapeHtml(key)}">Any</small>
          </summary>
          <fieldset>
            <legend class="sr-only">${escapeHtml(label)}</legend>
            <div class="filter-options">
              ${filterOptions[key]
                .map(
                  (option, index) => `
                    <label class="filter-option" for="filter-${escapeHtml(key)}-${index}">
                      <input id="filter-${escapeHtml(key)}-${index}" type="checkbox" data-filter-key="${escapeHtml(key)}" value="${escapeHtml(option)}">
                      <span>${escapeHtml(formatLabel(option) || option)}</span>
                    </label>`
                )
                .join('')}
            </div>
          </fieldset>
        </details>`
    )
    .join('');
}

function renderFilterSelection() {
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  clearFiltersButton.hidden = !hasActiveFilters;
  filterControls.querySelectorAll('[data-filter-key]').forEach((control) => {
    const selected = activeFilters[control.dataset.filterKey] || [];
    control.checked = selected.includes(control.value);
  });
  filterControls.querySelectorAll('[data-filter-summary]').forEach((summary) => {
    const count = activeFilters[summary.dataset.filterSummary]?.length || 0;
    summary.textContent = count ? `${count} selected` : 'Any';
  });
}

function showFilterState() {
  const matching = filteredRecords();
  updateRecordCounts(matching.length);
  if (!matching.length) {
    renderEmptyState('No catalogue records match these filters. Clear a filter or choose another value.');
    setFeedback('No records match the selected filters.', 'error');
    return;
  }

  renderEmptyState(
    `${recordCountText(matching.length)} available. Search the catalogue to see ranked passages and structured evidence.`,
    matching.length
  );
  setFeedback('The catalogue is ready. Choose a lens or write your own query.');
}

function showAllResults() {
  const matching = shuffleRecords(filteredRecords()).map((record) => ({ record, ranked: [] }));
  if (!matching.length) {
    showFilterState();
    return;
  }

  renderResults(matching);
  setFeedback(`Showing all ${recordCountText(matching.length)} in random order.`, 'success');
  setModelStatus(`Catalogue browse - ${recordCountText(matching.length)} shown`);
}

function renderQuickFacts(facts) {
  if (!facts.length) return '';
  return `
    <div class="quick-facts" aria-label="Record quick facts">
      ${facts
        .map(
          (fact) => `
            <div class="quick-fact">
              <span>${escapeHtml(fact.label)}</span>
              <strong>${escapeHtml(fact.value)}</strong>
            </div>`
        )
        .join('')}
    </div>`;
}

function renderDataBlock(block) {
  const heading = block.label ? `<h5>${escapeHtml(block.label)}</h5>` : '';
  const blockClass = `data-block data-block-${escapeHtml(block.kind)}`;
  if (block.kind === 'text') return `<div class="${blockClass}">${heading}<p>${escapeHtml(block.text)}</p></div>`;
  if (block.kind === 'list') {
    return `<div class="${blockClass}">${heading}<ul class="data-list">${block.items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('')}</ul></div>`;
  }
  if (block.kind === 'facts') {
    return `<div class="${blockClass}">${heading}<dl class="data-facts">${block.items
      .map(
        (item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`
      )
      .join('')}</dl></div>`;
  }
  if (block.kind === 'metrics') {
    return `<div class="${blockClass}">${heading}<ul class="metric-list">${block.items
      .map(
        (item) => `<li>${item.value ? `<strong>${escapeHtml(item.value)}</strong>` : ''}${item.label ? `<span>${escapeHtml(item.label)}</span>` : ''}</li>`
      )
      .join('')}</ul></div>`;
  }
  if (block.kind === 'quotes') {
    return `<div class="${blockClass}">${heading}<div class="quote-list">${block.items
      .map(
        (item) => `
          <figure class="evidence-quote">
            <blockquote>${escapeHtml(item.quote)}</blockquote>
            <figcaption>
              ${item.label ? `<span>${escapeHtml(item.label)}</span>` : ''}
              <span>${item.url && isLinkableUrl(item.url)
                ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.source || 'Source excerpt')}</a>`
                : escapeHtml(item.source || 'Source excerpt')}</span>
              ${item.locator ? `<span>${escapeHtml(item.locator)}</span>` : ''}
              ${item.supports ? `<span>Supports: ${escapeHtml(item.supports)}</span>` : ''}
            </figcaption>
          </figure>`
      )
      .join('')}</div></div>`;
  }
  if (block.kind === 'sources') return `<div class="${blockClass}"><ul class="source-list">${renderSources(block.items)}</ul></div>`;
  return '';
}

function isLinkableUrl(url) {
  return /^https?:\/\//i.test(url);
}

function renderSources(sources) {
  return sources
    .map((source) => {
      const title = source.title || source.url;
      const titleMarkup = title
        ? source.url && isLinkableUrl(source.url)
          ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener"><span>${escapeHtml(title)}</span><span class="source-arrow" aria-hidden="true">&nearr;</span></a>`
          : `<span class="source-title">${escapeHtml(title)}</span>`
        : '';
      const metadata = source.metadata?.length
        ? `<small>${source.metadata.map((item) => escapeHtml(item)).join(' &middot; ')}</small>`
        : '';
      return `<li>${titleMarkup}${metadata}</li>`;
    })
    .join('');
}

function renderSection(section) {
  return `
    <section class="catalogue-section catalogue-section-${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
      <div class="section-heading"><h4 id="${escapeHtml(section.id)}-title">${escapeHtml(section.title)}</h4></div>
      <div class="section-content">${section.blocks.map(renderDataBlock).join('')}</div>
    </section>`;
}

function scorePercent(score) {
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

function renderFacetScores(facet) {
  const scores = [
    ['Combined', facet.hybridScore],
    ['Semantic', facet.semanticScore],
    ['Keyword', facet.keywordScore]
  ].filter(([, score]) => typeof score === 'number' && Number.isFinite(score));
  if (!scores.length) return '';
  return `<div class="facet-score-list">${scores
    .map(
      ([label, score]) => `
        <div class="facet-score">
          <span>${label}</span>
          <strong>${scorePercent(score)}</strong>
        </div>`
    )
    .join('')}</div>`;
}

function renderFacetRanking(facets) {
  const rows = facets
    .map((facet, index) => {
      const name = facet.label || facet.text;
      if (!name) return '';
      return `
        <li class="facet-row ${index === 0 ? 'is-best' : ''}">
          <div class="facet-row-heading"><span class="facet-rank">${String(index + 1).padStart(2, '0')}</span><span class="facet-name">${escapeHtml(name)}</span></div>
          ${renderFacetScores(facet)}
        </li>`;
    })
    .join('');
  return rows ? `<ol class="facet-list">${rows}</ol>` : '';
}

function renderMatchingDetails(matching) {
  if (!matching) return '';
  const mode = matching.mode ? `<div><dt>Mode</dt><dd>${escapeHtml(matching.mode)}</dd></div>` : '';
  const query = matching.query ? `<div><dt>Query</dt><dd>${escapeHtml(matching.query)}</dd></div>` : '';
  const metadata = mode || query ? `<dl class="matching-facts">${mode}${query}</dl>` : '';
  const ranking = matching.facets.length
    ? `<div class="matching-ranking"><div class="subsection-heading"><span>Facet ranking</span><span>diagnostic view</span></div>${renderFacetRanking(matching.facets)}</div>`
    : '';
  return metadata || ranking
    ? `<details class="matching-details"><summary>How this result was matched</summary><div class="matching-content">${metadata}${ranking}</div></details>`
    : '';
}

function renderResultCard({ record, ranked }, mode, query) {
  const model = buildDisplayModel(record, ranked, mode, query);
  const titleHeader = model.title || model.eyebrow
    ? `<div class="result-title-row"><div>${model.eyebrow ? `<p class="result-eyebrow">${escapeHtml(model.eyebrow)}</p>` : ''}${model.title ? `<h3>${escapeHtml(model.title)}</h3>` : ''}${model.summary ? `<p class="record-summary">${escapeHtml(model.summary)}</p>` : ''}</div></div>`
    : '';
  const sectionMarkup = model.sections.length
    ? `<div class="catalogue-sections">${model.sections.map(renderSection).join('')}</div>`
    : '';

  return `
    <article class="result-card">
      <div class="result-card-topline"><span class="record-type">Catalogue record</span></div>
      ${titleHeader}
      ${renderQuickFacts(model.quickFacts)}
      ${sectionMarkup}
      ${renderMatchingDetails(model.matching)}
    </article>`;
}

function renderResults(rankedRecords, mode, query) {
  if (!rankedRecords.length) {
    renderEmptyState('No catalogue records matched the selected filters. Clear a filter or choose another value.');
    return;
  }

  results.innerHTML = rankedRecords.map((entry) => renderResultCard(entry, mode, query)).join('');
  updateRecordCounts(rankedRecords.length);
}

async function rerankWithCloudflare(query, candidates) {
  const keywordRanked = rankRecords(candidates, query, {}, {
    semanticAvailable: false,
    limit: MAX_RERANK_RECORDS
  });
  const entriesByRecord = new Map(candidates.map((entry) => [entry.record, entry]));
  const shortlist = keywordRanked.map((entry) => entriesByRecord.get(entry.record)).filter(Boolean);
  const allFacets = keywordRanked
    .flatMap((entry) => entry.ranked)
    .sort((left, right) => right.hybridScore - left.hybridScore);
  const keywordFacets = allFacets.slice(0, MAX_RERANK_RECORDS - MAX_PROTECTED_RERANK_FACETS);
  const protectedFacets = allFacets
    .filter((facet) => PROTECTED_RERANK_LABELS.has(facet.label))
    .slice(0, MAX_PROTECTED_RERANK_FACETS);
  const seenFacetIds = new Set();
  const rerankFacets = [...keywordFacets, ...protectedFacets].filter((facet) => {
    if (seenFacetIds.has(facet.id)) return false;
    seenFacetIds.add(facet.id);
    return true;
  });
  const documents = rerankFacets.map((facet) =>
    `${facet.label}: ${facet.text}`.slice(0, MAX_RERANK_TEXT_LENGTH)
  );
  const response = await fetch(SEARCH_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, documents })
  });
  if (!response.ok) throw new Error(`Search API request failed with ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload.scores)) throw new Error('Search API returned an invalid response');
  const scoresByIndex = new Map(payload.scores.map(({ index, score }) => [Number(index), Number(score)]));
  const semanticScores = {};
  rerankFacets.forEach((facet, index) => {
    const score = scoresByIndex.get(index);
    if (!Number.isFinite(score)) return;
    semanticScores[facet.id] = score;
  });

  return rankRecords(shortlist, query, semanticScores);
}

async function runSearch(query) {
  const searchId = ++activeSearch;
  searchButton.disabled = true;
  searchButton.classList.add('is-loading');
  setSearchBusy(true);
  setFeedback('Ranking the strongest catalogue matches...', 'loading');

  try {
    const matchingRecords = filteredRecords();
    const matchingRecordSet = new Set(matchingRecords);
    const candidates = recordSearchEntries.filter((entry) => matchingRecordSet.has(entry.record));
    if (!candidates.length) {
      renderEmptyState('No catalogue records match these filters. Clear a filter or choose another value.');
      setFeedback('No records match the selected filters.', 'error');
      return;
    }

    const rankedRecords = await rerankWithCloudflare(query, candidates);
    if (searchId !== activeSearch) return;
    renderResults(rankedRecords, 'reranked', query);
    setFeedback('Structured catalogue data is shown below. Matching details are available in the disclosure.', 'success');
    setModelStatus(`Cloudflare reranker - ${recordCountText(rankedRecords.length)} ranked`);
  } catch (error) {
    if (searchId !== activeSearch) return;
    console.error('Cloudflare search failed; using keyword fallback.', error);
    const matchingRecords = filteredRecords();
    const matchingRecordSet = new Set(matchingRecords);
    const candidates = recordSearchEntries.filter((entry) => matchingRecordSet.has(entry.record));
    const rankedRecords = rankRecords(candidates, query, {}, { semanticAvailable: false });
    renderResults(rankedRecords, 'keyword', query);
    setFeedback('The search service is unavailable. Showing keyword-ranked results instead.', 'error');
    setModelStatus('Cloudflare search unavailable - keyword fallback active');
  } finally {
    if (searchId === activeSearch) {
      searchButton.disabled = false;
      searchButton.classList.remove('is-loading');
      setSearchBusy(false);
    }
  }
}

async function loadCatalogue() {
  try {
    const manifestResponse = await fetch(`${import.meta.env.BASE_URL}${CATALOGUE_MANIFEST}`);
    if (!manifestResponse.ok) throw new Error(`Catalogue manifest request failed with ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (!Array.isArray(manifest)) throw new Error('Catalogue manifest must be an array');
    const recordResponses = await Promise.all(
      manifest.map(async (filename) => {
        const response = await fetch(`${import.meta.env.BASE_URL}data/assessments/${encodeURIComponent(filename)}`);
        if (!response.ok) throw new Error(`Catalogue record request failed with ${response.status}: ${filename}`);
        return response.json();
      })
    );
    records = normalizeRecords(recordResponses);
    recordSearchEntries = records.map((record, recordIndex) => ({
      record,
      facets: buildFacets(record).map((facet) => ({ ...facet, id: `record-${recordIndex}-${facet.id}` }))
    }));
    filterOptions = extractFilterOptions(records);
    renderFilters();
    renderFilterSelection();
    updateRecordCounts();
    setModelStatus(`${recordCountText(records.length)} loaded - ${recordSearchEntries.reduce((count, entry) => count + entry.facets.length, 0)} searchable facets`);
  } catch (error) {
    console.error('Catalogue failed to load.', error);
    form.querySelector('button[type="submit"]').disabled = true;
    setFeedback('The catalogue file could not load. Check that the site is served through Vite or a static web server.', 'error');
    setModelStatus('Catalogue unavailable');
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) {
    setFeedback('Write a query before running the search.', 'error');
    queryInput.focus();
    return;
  }
  if (!records.length) {
    setFeedback('The catalogue has no records to search.', 'error');
    return;
  }
  runSearch(query);
});

filterControls.addEventListener('change', (event) => {
  const control = event.target.closest('[data-filter-key]');
  if (!control) return;
  const key = control.dataset.filterKey;
  activeFilters[key] = [...filterControls.querySelectorAll(`[data-filter-key="${key}"]:checked`)].map(
    (checkbox) => checkbox.value
  );
  if (!activeFilters[key].length) delete activeFilters[key];
  renderFilterSelection();
  updateRecordCounts();
  if (queryInput.value.trim()) runSearch(queryInput.value.trim());
  else showFilterState();
});

clearFiltersButton.addEventListener('click', () => {
  activeFilters = {};
  renderFilterSelection();
  updateRecordCounts();
  if (queryInput.value.trim()) runSearch(queryInput.value.trim());
  else showFilterState();
});

queryInput.addEventListener('input', () => {
  clearButton.hidden = !queryInput.value;
});

clearButton.addEventListener('click', () => {
  queryInput.value = '';
  clearButton.hidden = true;
  queryInput.focus();
});

suggestionList.addEventListener('click', (event) => {
  const button = event.target.closest('.suggestion');
  if (!button) return;
  queryInput.value = button.dataset.query;
  clearButton.hidden = false;
  form.requestSubmit();
});

results.addEventListener('click', (event) => {
  const link = event.target.closest('[data-show-all]');
  if (!link) return;
  event.preventDefault();
  showAllResults();
});

renderSuggestions();
loadCatalogue();
