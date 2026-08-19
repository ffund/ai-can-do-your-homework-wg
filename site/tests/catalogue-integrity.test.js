import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const recordsDirectory = path.join(root, 'site/public/data/assessments');
const practices = JSON.parse(fs.readFileSync(path.join(root, 'workshop-practices.json'), 'utf8'));
const practiceById = new Map(practices.map((practice) => [practice.id, practice]));
const files = fs.readdirSync(recordsDirectory).filter((file) => file.startsWith('assessment-') && file.endsWith('.json'));
const records = files.map((file) => JSON.parse(fs.readFileSync(path.join(recordsDirectory, file), 'utf8')));

describe('canonical catalogue integrity', () => {
  it('records the candidate mapping pass without implying confirmation', () => {
    expect(records).toHaveLength(247);
    records.forEach((record) => {
      expect(record.workshop_practice_mapping_review.status).toBe('candidate_pass');
      expect(record.workshop_practice_mapping_review.method).toBeTruthy();
      expect(record.workshop_practice_mapping_review.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.workshop_practice_mapping_review.notes).toBeTruthy();
    });
  });

  it('uses valid practice and source references with short stored quotations', () => {
    records.forEach((record) => {
      const sourceIds = new Set(record.sources.map((source) => source.id));
      const storedQuotes = new Set((record.evidence_excerpts ?? []).map((excerpt) => `${excerpt.source_id}\0${excerpt.quote}`));
      (record.evidence_excerpts ?? []).forEach((excerpt) => {
        expect(sourceIds.has(excerpt.source_id), `${record.id}: ${excerpt.source_id}`).toBe(true);
        expect(excerpt.quote.length).toBeLessThanOrEqual(320);
      });
      record.evidence_quality.source_ids.forEach((sourceId) => {
        expect(sourceIds.has(sourceId), `${record.id}: ${sourceId}`).toBe(true);
      });
      (record.workshop_practice_mappings ?? []).forEach((mapping) => {
        const practice = practiceById.get(mapping.practice_id);
        expect(practice, `${record.id}: ${mapping.practice_id}`).toBeTruthy();
        expect(mapping.practice_name).toBe(practice.name);
        expect(mapping.match_status).toBe('candidate');
        mapping.supporting_passages.forEach((passage) => {
          expect(sourceIds.has(passage.source_id), `${record.id}: ${passage.source_id}`).toBe(true);
          expect(passage.quote.length).toBeLessThanOrEqual(320);
          expect(storedQuotes.has(`${passage.source_id}\0${passage.quote}`), `${record.id}: unstored mapping quote`).toBe(true);
        });
      });
    });
  });
});
