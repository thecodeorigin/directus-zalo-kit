import antfu from '@antfu/eslint-config'

export default antfu({
  pnpm: true,
  vue: true,
  typescript: true,
  rules: {
    'no-alert': 'warn',
    'no-console': 'warn',
    'no-debugger': 'warn',
    'node/prefer-global/process': 'off',
  },
})
