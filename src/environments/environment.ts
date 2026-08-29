export const environment = {
  production: true,
  /**
   * Empty means "same origin as the app, under `/SIRIEDUMARKET.Api`" — the IIS layout this
   * deploys to. Set it to an absolute URL when the API lives on another host.
   */
  apiUrl: '',
  /** Optional fallback; prefer `GET /api/auth/oauth-clients` from the API. */
  googleOAuthClientId: '',
  /** DEV-BYPASS: never on in a production build — real sign-in only. */
  devAuth: {
    bypass: false,
    role: 'buyer' as 'buyer' | 'seller' | 'admin',
  },
};
