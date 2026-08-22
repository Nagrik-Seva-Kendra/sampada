/**
 * Every staff route that names a deed in its path must carry DeedVisibleGuard.
 *
 * Without it the handler runs against the tenant-scoped Prisma client, which
 * means another organization's deed is never *leaked* -- but the endpoint
 * answers 200 with an empty list instead of 404, and a write silently lands on
 * a deed the caller cannot open. This is a metadata test rather than a probe of
 * one endpoint on purpose: it fails when someone adds the *next* per-deed route
 * and forgets the guard, which is the regression that actually happens.
 */
import { describe, expect, it } from "vitest";
import { PATH_METADATA } from "@nestjs/common/constants.js";
import { DeedDocumentsController } from "./deed-documents.controller.js";
import { DeedPropertyDetailController } from "./deed-property-detail.controller.js";
import { DeedPresenceController } from "./deed-presence.controller.js";
import { DeedVisibleGuard } from "./deed-visible.guard.js";

const GUARDS = "__guards__";

type Ctor = new (...args: never[]) => object;

/** Guards that apply to a handler: the controller's plus the method's own. */
function guardsFor(controller: Ctor, method: string): unknown[] {
  return [
    ...((Reflect.getMetadata(GUARDS, controller) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS, (controller.prototype as Record<string, unknown>)[method] as object) as unknown[]) ?? []),
  ];
}

/** Every handler on a controller whose full path names a deed. */
function perDeedHandlers(controller: Ctor): { method: string; path: string }[] {
  const prefix = String(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((m) => m !== "constructor")
    .flatMap((m) => {
      const handler = (controller.prototype as Record<string, unknown>)[m];
      if (typeof handler !== "function") return [];
      const routePath = Reflect.getMetadata(PATH_METADATA, handler as object);
      if (routePath === undefined) return [];
      const full = `${prefix}/${String(routePath)}`;
      return full.includes(":deedId") ? [{ method: m, path: full }] : [];
    });
}

const CONTROLLERS: [string, Ctor][] = [
  ["DeedDocumentsController", DeedDocumentsController as unknown as Ctor],
  ["DeedPropertyDetailController", DeedPropertyDetailController as unknown as Ctor],
  ["DeedPresenceController", DeedPresenceController as unknown as Ctor],
];

describe("per-deed staff routes", () => {
  for (const [label, controller] of CONTROLLERS) {
    const handlers = perDeedHandlers(controller);

    it(`${label} has at least one route naming a deed`, () => {
      // Guards against the test quietly passing because the reflection above
      // stopped finding anything.
      expect(handlers.length).toBeGreaterThan(0);
    });

    for (const { method, path } of handlers) {
      it(`${label}.${method} (${path}) is behind DeedVisibleGuard`, () => {
        expect(guardsFor(controller, method)).toContain(DeedVisibleGuard);
      });
    }
  }
});
