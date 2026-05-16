import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'http://localhost:5290/SIRIEDUMARKET.Api/openapi/v1.json',
  output: {
    path: 'src/app/core/api',
    format: 'prettier',
  },
  plugins: [
    '@hey-api/typescript',
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/app/core/api-runtime.ts',
    },
    '@hey-api/sdk',
  ],
});
