import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/sources/csv.ts';

describe('parseCsv', () => {
  it('reads a simple grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('keeps commas inside quoted fields', () => {
    // A power-rankings blurb with a comma would otherwise shift every column
    // after it by one.
    expect(parseCsv('name,blurb\nJim,"Won big, then collapsed"')).toEqual([
      ['name', 'blurb'],
      ['Jim', 'Won big, then collapsed'],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"line one\nline two",x')).toEqual([
      ['a', 'b'],
      ['line one\nline two', 'x'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"he said ""hi"""')).toEqual([['a'], ['he said "hi"']]);
  });

  it('strips the BOM Google prepends to its CSV export', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('preserves empty cells rather than collapsing them', () => {
    // Blank division cells for 2017-2022 are meaningful: the league had no
    // divisions those years. Losing the empty column would misalign the row.
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('does not invent a trailing row from a final newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(2);
  });
});
