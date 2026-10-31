/**
 * QA build (`npm run build:qa` / `ng build --configuration qa`), served at
 * https://siriedumarket-qa.siristudiophoto.com from the k8s namespace `siriedumarket-dev`.
 * Talks ONLY to the QA API — never to production. Runbook: docs/ENVIRONMENTS.md (monorepo root).
 */
export const environment = {
  production: true,
  /** Origin only, no path base (`docs/contracts/remove-api-path-base.md`). */
  apiUrl: 'https://api-siriedumarket-dev.siristudiophoto.com',
  /** Optional fallback; the QA API's `GET /api/auth/oauth-clients` takes precedence when set. */
  googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
  /**
   * File formats a seller may list for sale. PDF only for now — must match the API's
   * `DocumentSaleFormats:Allowed` (the API refuses the rest). Add 'DOCX', 'PPTX', 'XLSX', 'ZIP' to open them.
   */
  saleFormats: ['PDF'] as readonly string[],
  /** DEV-BYPASS: never on outside a local development build — QA tests the real sign-in. */
  devAuth: {
    bypass: false,
    role: 'buyer' as 'buyer' | 'seller' | 'admin',
  },
};
