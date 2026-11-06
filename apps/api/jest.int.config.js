// Pruebas de integración: necesitan la base levantada (`npm run db:up`).
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.int-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Todos los archivos comparten la misma base: en paralelo, los totales de una prueba
  // cuentan las filas que está escribiendo otra.
  maxWorkers: 1,
};
