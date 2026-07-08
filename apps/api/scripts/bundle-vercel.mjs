// Bundles the tsc-compiled Vercel handler (dist/vercel-handler.js) into a
// single self-contained CommonJS file at api/index.js, the entrypoint Vercel's
// zero-config Node.js runtime auto-detects as a serverless function. Input is
// already-compiled JS (see bundle.mjs for why) — esbuild only inlines
// @sampada/shared and the runtime deps.
import * as esbuild from "esbuild";

const optionalNestDeps = [
  "@nestjs/microservices",
  "@nestjs/microservices/microservices-module",
  "@nestjs/websockets",
  "@nestjs/websockets/socket-module",
  "@nestjs/platform-socket.io",
  "class-transformer",
  "class-transformer/storage",
  "class-validator",
  "cache-manager",
  "@fastify/static",
  "@grpc/grpc-js",
  "@grpc/proto-loader",
  "kafkajs",
  "mqtt",
  "nats",
  "ioredis",
  "redis",
  "amqplib",
  "amqp-connection-manager",
  // Prisma is present in the repo but not wired into AppModule (DB-free).
  "@prisma/client",
  "prisma",
];

await esbuild.build({
  entryPoints: ["dist/vercel-handler.js"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: "api/index.js",
  external: optionalNestDeps,
  logLevel: "info",
});

console.log("Bundled -> apps/api/api/index.js");
