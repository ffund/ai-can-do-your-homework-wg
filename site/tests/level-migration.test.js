import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLevel, classifyLevelBasis, updateRecord } from '../../normalize-levels.mjs';
import { excerptKindsForQuote } from '../src/quote-classification.js';

const recordsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/data/assessments');
const levelCategories = new Set([
  'pre_introductory',
  'introductory',
  'post_introductory',
  'advanced',
  'graduate',
  'mixed',
  'unknown'
]);
const levelBases = new Set(['reported', 'inferred', 'mixed', 'unknown']);

describe('level migration', () => {
  it('maps explicit introductory and post-introductory wording', () => {
    expect(classifyLevel('introductory undergraduate')).toBe('introductory');
    expect(classifyLevel('CS1')).toBe('introductory');
    expect(classifyLevel('CS2')).toBe('post_introductory');
    expect(classifyLevel('intermediate undergraduate')).toBe('post_introductory');
    expect(classifyLevel('beginner to intermediate programming students')).toBe('mixed');
    expect(classifyLevel('post-introductory')).toBe('post_introductory');
  });

  it('maps explicit upper, graduate, and mixed levels', () => {
    expect(classifyLevel('upper-level undergraduate')).toBe('advanced');
    expect(classifyLevel('graduate')).toBe('graduate');
    expect(classifyLevel("master's coursework")).toBe('graduate');
    expect(classifyLevel('undergraduate and graduate')).toBe('mixed');
    expect(classifyLevel('elementary and high-school problem level')).toBe('pre_introductory');
  });

  it('does not infer from broad or year-only labels', () => {
    expect(classifyLevel('undergraduate')).toBe('unknown');
    expect(classifyLevel('first-year undergraduate')).toBe('unknown');
    expect(classifyLevel('higher education')).toBe('unknown');
    expect(classifyLevel('unknown')).toBe('unknown');
  });

  it('records whether the category was stated or inferred', () => {
    expect(classifyLevelBasis('introductory')).toBe('reported');
    expect(classifyLevelBasis('CS1')).toBe('inferred');
    expect(classifyLevelBasis('upper-level undergraduate')).toBe('inferred');
    expect(classifyLevelBasis('undergraduate')).toBe('unknown');
  });

  it('carries legacy source quotations into explicit assessment excerpts', () => {
    const record = {
      context: { course: { level: 'introductory' }, learner_level: 'novice' },
      sources: [
        {
          id: 'source-a',
          evidence_quote: 'Students complete a short programming task.',
          locator: { section: 'Assessment' }
        }
      ]
    };

    expect(updateRecord(record).evidence_excerpts).toEqual([
      {
        kind: 'assessment_description',
        quote: 'Students complete a short programming task.',
        source_id: 'source-a',
        locator: { section: 'Assessment' },
        supports: 'What students do',
        context: 'authors_report'
      }
    ]);
  });

  it('keeps context, GenAI, grading, and task meanings separate', () => {
    expect(excerptKindsForQuote('The lab test was 30 minutes in duration.')).toEqual(['context']);
    expect(excerptKindsForQuote('Students may use ChatGPT during the project.')).toEqual(['ai_policy']);
    expect(excerptKindsForQuote('Programming assignments contribute 15% of the course grade.')).toEqual(['grading']);
    expect(excerptKindsForQuote('Students implement a program and submit their code.')).toContain('assessment_description');
  });

  it('has normalized fields on every published record without replacing raw levels', () => {
    const files = fs.readdirSync(recordsDirectory).filter((file) => file.startsWith('assessment-') && file.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    files.forEach((file) => {
      const record = JSON.parse(fs.readFileSync(path.join(recordsDirectory, file), 'utf8'));
      expect(record.context.course).toHaveProperty('level');
      expect(levelCategories.has(record.context.course.level_category)).toBe(true);
      expect(levelBases.has(record.context.course.level_category_basis)).toBe(true);
      expect(record.context).toHaveProperty('learner_level');
      expect(levelCategories.has(record.context.learner_level_category)).toBe(true);
      expect(levelBases.has(record.context.learner_level_category_basis)).toBe(true);
      const legacyQuotes = (record.sources ?? []).filter((source) => source?.evidence_quote);
      if (legacyQuotes.length) {
        expect(record.evidence_excerpts).toEqual(
          expect.arrayContaining(
            legacyQuotes.map((source) =>
              expect.objectContaining({
                quote: source.evidence_quote,
                source_id: source.id
              })
            )
          )
        );
      }
      (record.evidence_excerpts ?? []).forEach((excerpt) => {
        expect(excerptKindsForQuote(excerpt.quote)).toContain(excerpt.kind);
      });
    });
  });
});
