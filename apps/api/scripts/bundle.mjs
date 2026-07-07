// Bundles the tsc-compiled API (dist/main.js) into a single self-contained
// CommonJS file for shared/cPanel hosting. Input is the already-compiled JS so
// NestJS decorator metadata (emitted by tsc) is preserved; esbuild only inlines
// @sampada/shared and the runtime deps, and externalizes NestJS's optional
// transport/validation packages that this app never uses.
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
  entryPoints: ["dist/main.js"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "deploy/server.cjs",
  external: optionalNestDeps,
  logLevel: "info",
});

console.log("Bundled -> apps/api/deploy/server.cjs");
