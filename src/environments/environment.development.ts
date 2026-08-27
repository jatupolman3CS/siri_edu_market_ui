export const environment = {
  production: false,
  /**
   * B-05: the one knob that decides where API calls go — `core/api-runtime.ts` reads it.
   * `dotnet run` serves the `http` launch profile on :5282 under `UsePathBase("/SIRIEDUMARKET.Api")`,
   * and the API's CORS policy already allows `http://localhost:4200`, so `ng serve` talks to it
   * directly. Point this at another host to develop against a different backend.
   */
  apiUrl: 'http://localhost:5282/SIRIEDUMARKET.Api',
  /** Public client id; the API's `GET /api/auth/oauth-clients` takes precedence when set. */
  googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
};
