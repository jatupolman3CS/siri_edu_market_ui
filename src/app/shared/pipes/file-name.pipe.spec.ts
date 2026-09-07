import { describe, expect, it } from 'vitest';
import { FileNamePipe } from './file-name.pipe';

describe('FileNamePipe', () => {
  const pipe = new FileNamePipe();

  it('extracts the last segment of a storage key', () => {
    expect(pipe.transform('sellers/abc/documents/xyz/final.pdf')).toBe('final.pdf');
  });

  it('passes through a bare file name unchanged', () => {
    expect(pipe.transform('final.pdf')).toBe('final.pdf');
  });

  it('handles a trailing slash by falling back to the original value', () => {
    expect(pipe.transform('sellers/abc/')).toBe('sellers/abc/');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
