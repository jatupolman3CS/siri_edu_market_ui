export const environment = {
  production: false,
  /**
   * B-05: the one knob that decides where API calls go — `core/api-runtime.ts` reads it.
   * `dotnet run` serves the `http` launch profile on :5282 with the API at the root
   * (`http://localhost:5282/api/...` — no path base), and the API's CORS policy already allows
   * `http://localhost:4200`, so `ng serve` talks to it directly. Point this at another host to
   * develop against a different backend.
   */
  apiUrl: 'http://localhost:5282',
  /** Public client id; the API's `GET /api/auth/oauth-clients` takes precedence when set. */
  googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
  /**
   * DEV-BYPASS: sign-in is not finished yet, so `bypass: true` walks straight into the app as a
   * seeded account and every guarded page becomes reachable. The API has the matching switch
   * (`Auth:DevBypass:Enabled` in `appsettings.Development.json`) and both must be on together.
   * `role` is the account picked on first load; the floating dev switcher changes it afterwards.
   * Set this to `false` to get the real login flow back.
   */
  devAuth: {
    bypass: true,
    role: 'admin' as 'buyer' | 'seller' | 'admin',
  },
};
