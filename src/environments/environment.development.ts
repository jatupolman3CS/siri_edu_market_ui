export const environment = {
  production: false,
  /** Relative so `ng serve` routes through src/proxy.conf.json. */
  apiUrl: '/api',
  /** Public client id; the API's `GET /api/auth/oauth-clients` takes precedence when set. */
  googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
};
