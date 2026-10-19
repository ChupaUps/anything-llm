const { PrismaClient } = require("@prisma/client");

// npx prisma introspect
// npx prisma generate
// npx prisma migrate dev --name init -> ensures that db is in sync with schema
// npx prisma migrate reset -> resets the db

const logLevels = ["error", "info", "warn"]; // add "query" to debug query logs
const prisma = new PrismaClient({
  log: logLevels,
});

// Включаем WAL-режим для SQLite при старте приложения.
// Это персистентная настройка: она сохраняется в самом файле БД,
// поэтому достаточно выполнить её один раз.
prisma
  .$executeRawUnsafe("PRAGMA journal_mode=WAL;")
  .then((result) => {
    console.log("PRAGMA journal_mode result:", result);
  })
  .catch((err) => {
    console.error("Failed to set WAL mode:", err);
  });

module.exports = prisma;