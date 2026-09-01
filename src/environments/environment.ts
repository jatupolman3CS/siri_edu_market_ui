export const environment = {
  production: true,
  /**
   * Empty means "same origin as the app, under `/SIRIEDUMARKET.Api`" — the IIS layout this
   * deploys to. Set it to an absolute URL when the API lives on another host — must include the
   * `/SIRIEDUMARKET.Api` path base (`UsePathBase` in the API's `Program.cs`), or every request
   * 404s since the host serves nothing at the bare origin.
   */
  apiUrl: 'https://api-siriedumarket.siristudiophoto.com',
  /** Optional fallback; prefer `GET /api/auth/oauth-clients` from the API. */
 googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
  /** DEV-BYPASS: never on in a production build — real sign-in only. */
  devAuth: {
    bypass: false,
    role: 'buyer' as 'buyer' | 'seller' | 'admin',
  },
};
