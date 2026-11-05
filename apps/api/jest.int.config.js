// Pruebas de integración: necesitan la base levantada (`npm run db:up`).
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.int-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
