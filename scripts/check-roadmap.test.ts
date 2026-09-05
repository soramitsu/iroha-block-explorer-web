import { describe, expect, it } from 'vitest';

import { parseRoadmapRows, validateRoadmap } from './check-roadmap.mjs';

const validRoadmap = `# Roadmap

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| EX-001 | First task. | COMPLETED | Done. |
| EX-002 | Second task. | IN PROGRESS | Active. |

## Archived Task Notes
`;

describe('parseRoadmapRows', () => {
  it('reads task identifiers, descriptions, and statuses', () => {
    expect(parseRoadmapRows(validRoadmap)).toEqual([
      { id: 'EX-001', task: 'First task.', status: 'COMPLETED' },
      { id: 'EX-002', task: 'Second task.', status: 'IN PROGRESS' },
    ]);
  });
});

describe('validateRoadmap', () => {
  it('accepts a roadmap with unique identifiers and supported statuses', () => {
    expect(validateRoadmap(validRoadmap)).toEqual([]);
  });

  it('rejects duplicate identifiers and unsupported statuses', () => {
    const source = `${validRoadmap}\n| EX-002 | Duplicate. | PAUSED | |`;

    expect(validateRoadmap(source)).toEqual([
      'duplicate roadmap id: EX-002',
      'invalid roadmap status for EX-002: PAUSED',
    ]);
  });

  it('rejects an unarchived active-notes section', () => {
    expect(validateRoadmap(`${validRoadmap}\n## Active Task Notes\n`)).toContain(
      'stale Active Task Notes section must be archived'
    );
  });

  it('rejects a malformed delimiter with extra columns', () => {
    const malformed = validRoadmap.replace('| --- | --- | --- | --- |', '| --- | --- | --- | --- | --- | --- |');

    expect(validateRoadmap(malformed)).toContain('roadmap table delimiter must define exactly four Markdown columns');
  });

  it('rejects a table whose header does not match the required schema', () => {
    const malformed = validRoadmap.replace('| ID | Task | Status | Notes |', '| ID | Task | State | Notes |');

    expect(validateRoadmap(malformed)).toContain(
      'roadmap table must have exactly the ID, Task, Status, and Notes columns'
    );
  });
});
