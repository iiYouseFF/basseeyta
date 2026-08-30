module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.{ts,js}', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  setupFiles: ['<rootDir>/tests/setup.ts', 'dotenv/config'],
  testTimeout: 15000,
  globals: {
    'ts-jest': {
      tsconfig: {
        strict: false,
        esModuleInterop: true,
      },
    },
  },
};
