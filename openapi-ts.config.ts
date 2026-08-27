import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  // F-04: this said 5290, which is not a port anything in this repo listens on — launchSettings
  // and environment.development.ts both say 5282 — so `npm run generate:api` could only ever
  // have failed to connect. Regenerating the SDK is a step in several tasks, so it has to work.
  input: 'http://localhost:5282/SIRIEDUMARKET.Api/openapi/v1.json',
  output: {
    path: 'src/app/core/api',
    format: 'prettier',
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
