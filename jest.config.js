module.exports = {
  moduleFileExtensions: ["ts", "js"],
  // generated specs use node16-style ".js" relative imports
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", {tsconfig: "test/tsconfig.json"}]
  },
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/proto/**"
  ],
  testMatch: ["**/*.spec.(ts)"],
  testEnvironment: "node",
}
