// Garante NODE_ENV=test antes de importar módulos que inicializam Redis/BullMQ.
process.env.NODE_ENV ??= 'test';
