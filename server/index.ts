import { createServer } from "node:http";

import { config } from "./config.js";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

const app = createApp();
const server = createServer(app);

server.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
