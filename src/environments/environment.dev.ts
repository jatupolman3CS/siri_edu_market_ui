/**
 * DEV build (`npm run build:dev` / `ng build --configuration dev`), served at
 * https://siriedumarket-dev.siristudiophoto.com from the k8s namespace `siriedumarket-dev`.
 * Talks ONLY to the DEV API — never to production. Runbook: docs/ENVIRONMENTS.md (monorepo root).
 */
export const environment = {
  production: true,
  /** Origin only, no path base (`docs/contracts/remove-api-path-base.md`). */
  apiUrl: 'https://api-siriedumarket-dev.siristudiophoto.com',
  /** Optional fallback; the DEV API's `GET /api/auth/oauth-clients` takes precedence when set. */
  googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
  /**
   * File formats a seller may list for sale. PDF only for now — must match the API's
   * `DocumentSaleFormats:Allowed` (the API refuses the rest). Add 'DOCX', 'PPTX', 'XLSX', 'ZIP' to open them.
   */
  saleFormats: ['PDF'] as readonly string[],
  /** DEV-BYPASS: never on outside a local development build — DEV tests the real sign-in. */
  devAuth: {
    bypass: false,
    role: 'buyer' as 'buyer' | 'seller' | 'admin',
  },
};
