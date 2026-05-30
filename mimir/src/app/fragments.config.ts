import type { FragmentsConfig } from '@fragments-sdk/cli';

const config: FragmentsConfig = {
  // Glob patterns for finding fragment/story files
  include: [
    'src/components/**/*.contract.json'
  ],

  // Glob patterns to exclude
  exclude: ['**/node_modules/**'],

  // Glob patterns for finding component files (for auto-documentation)
  components: [
    'src/components/**/*.tsx'
  ],

  // Framework (react, vue, svelte)
  framework: 'react',

  // Pinned guardrails preset. Upgrade explicitly via fragments init --preset.
  govern: {
    presets: ['universal@2'],
  },
};

export default config;
