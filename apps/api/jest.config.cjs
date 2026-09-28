module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@erp/domain$': '<rootDir>/../../packages/domain/src',
    '^@erp/config$': '<rootDir>/../../packages/config/src',
    '^@erp/api-client$': '<rootDir>/../../packages/api-client/src',
  },
};
