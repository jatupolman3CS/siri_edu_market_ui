import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  // F-04: this said 5290, which is not a port anything in this repo listens on — launchSettings
  // and environment.development.ts both say 5282 — so `npm run generate:api` could only ever
  // have failed to connect. Regenerating the SDK is a step in several tasks, so it has to work.
  input: 'http://localhost:5282/openapi/v1.json',
  output: {
    path: 'src/app/core/api',
    format: 'prettier',
    // `clean: true` (the default) rm -rf's the whole output dir before writing generated files.
    // `core/api/` also holds hand-written wrapper files that live next to the generated ones
    // (`sdk-auth-bridge.ts`, `admin-documents.api.ts`, `seller-document-main-files.ts`,
    // `seller-document-update.ts`) — a plain regen was silently deleting all four. `clean: false`
    // still overwrites every generated file, it just stops wiping files the generator didn't write.
    clean: false,
  },
  plugins: [
    '@hey-api/typescript',
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/app/core/api-runtime',
    },
    '@hey-api/sdk',
  ],
});
