import { describe, expect, it } from "vitest";
import { stages } from "../src/domain/model";

describe("CRM stage model", () => {
  it("includes the partner stage between proposal and client", () => {
    expect(Object.keys(stages)).toEqual([
      "new",
      "contacted",
      "meeting",
      "proposal",
      "partner",
      "client",
      "dormant",
    ]);
    expect(stages.partner).toBe("Partner");
  });
});
