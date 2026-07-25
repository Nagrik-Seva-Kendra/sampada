import { describe, it, expect } from "vitest";
import { assertNotLastActiveOwner, LastOwnerViolationError } from "./organization-invariants.core.js";

describe("assertNotLastActiveOwner", () => {
  it("throws when the count is 0 (defensive — shouldn't happen)", () => {
    expect(() => assertNotLastActiveOwner(0)).toThrow(LastOwnerViolationError);
  });

  it("throws when the count is 1 (this change would leave zero owners)", () => {
    expect(() => assertNotLastActiveOwner(1)).toThrow(LastOwnerViolationError);
  });

  it("does not throw when the count is 2", () => {
    expect(() => assertNotLastActiveOwner(2)).not.toThrow();
  });

  it("does not throw when the count is 5", () => {
    expect(() => assertNotLastActiveOwner(5)).not.toThrow();
  });

  it("thrown error has the expected identity", () => {
    try {
      assertNotLastActiveOwner(1);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LastOwnerViolationError);
      expect((err as Error).name).toBe("LastOwnerViolationError");
    }
  });
});
