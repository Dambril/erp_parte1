module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['tsx', {}] },
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@erp/domain$': '<rootDir>/../../packages/domain/src',
    '^@erp/config$': '<rootDir>/../../packages/config/src',
    '^@erp/api-client$': '<rootDir>/../../packages/api-client/src',
  },
};
