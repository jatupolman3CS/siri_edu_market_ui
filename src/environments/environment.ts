export const environment = {
  production: true,
  /**
   * Empty means "same origin as the app" — nginx proxies `{origin}/api/...` to the backend
   * container. Set it to an absolute URL (origin only) when the API lives on another host.
   * The API answers at the root: there is no path base to append any more
   * (`docs/contracts/remove-api-path-base.md`).
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
