const OMISE_SCRIPT_SRC = 'https://cdn.omise.co/omise.js';

export function loadOmiseScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Omise.js requires a browser environment.'));
  }
  if (window.Omise) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OMISE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Omise.js')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = OMISE_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Omise.js'));
    document.head.appendChild(s);
  });
}
