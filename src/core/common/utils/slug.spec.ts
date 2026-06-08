import { toSlug } from './slug';

describe('toSlug', () => {
  it('should convert "Alice Chen" to "alice-chen"', () => {
    expect(toSlug('Alice Chen')).toBe('alice-chen');
  });

  it('should convert "Machine Learning & NLP" to "machine-learning-nlp"', () => {
    expect(toSlug('Machine Learning & NLP')).toBe('machine-learning-nlp');
  });

  it('should trim whitespace', () => {
    expect(toSlug('  hello  ')).toBe('hello');
  });

  it('should leave already-slugged strings unchanged', () => {
    expect(toSlug('already-slugged')).toBe('already-slugged');
  });

  it('should convert UPPER CASE to lowercase', () => {
    expect(toSlug('UPPER CASE')).toBe('upper-case');
  });

  it('should collapse multiple dashes', () => {
    expect(toSlug('multiple---dashes')).toBe('multiple-dashes');
  });
});
