/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  // npm workspaces hoist ts-jest to the monorepo root, which jest's own
  // resolver does not walk up to. require.resolve does, so hand jest an
  // absolute path; this works hoisted or installed locally (as in CI).
  transform: {
    '^.+\\.tsx?$': [require.resolve('ts-jest'), { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  verbose: true,
};
