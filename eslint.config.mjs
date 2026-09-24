import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextCoreVitals,
  ...nextTypeScript,
  globalIgnores(['.next/**', 'node_modules/**', 'artifacts/**', 'public/evidence/**']),
]);
