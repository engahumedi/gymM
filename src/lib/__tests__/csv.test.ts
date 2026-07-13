import { describe, it, expect } from 'vitest';
import { parseCsv } from '../csv';

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('name,note\n"Doe, John","he said ""hi"""')).toEqual([
      ['name', 'note'],
      ['Doe, John', 'he said "hi"'],
    ]);
  });
  it('handles newlines inside quotes', () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([['a'], ['line1\nline2']]);
  });
  it('strips a leading BOM and handles CRLF', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('drops fully-empty rows', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});
