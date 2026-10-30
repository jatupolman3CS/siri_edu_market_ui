import { DisplayEmailPipe, isPlaceholderEmail } from './display-email.pipe';

describe('DisplayEmailPipe', () => {
  const pipe = new DisplayEmailPipe();

  it('hides the synthetic LINE placeholder address', () => {
    expect(pipe.transform('line_u1234abcd@line.siriedumarket.invalid')).toBe('LINE');
    expect(isPlaceholderEmail('line_u1@line.siriedumarket.invalid')).toBe(true);
  });

  it('passes real addresses through unchanged', () => {
    expect(pipe.transform('someone@example.com')).toBe('someone@example.com');
    expect(isPlaceholderEmail('someone@example.com')).toBe(false);
  });

  it('renders nothing for empty values', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
