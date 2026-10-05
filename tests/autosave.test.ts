import { describe, it, expect, vi } from "vitest";
import { DraftSaver } from "@/foundation/draft-saver";
describe("draft autosave", () => {
  it("coalesces fields and serializes edits arriving during a save", async () => {
    let release!: (version: number) => void;
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(3);
    const saver = new DraftSaver(1, persist);
    saver.patch({ title: "First" });
    saver.patch({ title: "Latest", body: "Text" });
    const first = saver.flush();
    saver.patch({ priority: "high" });
    release(2);
    await first;
    expect(persist.mock.calls).toEqual([
      [{ title: "Latest", body: "Text" }, 1],
      [{ priority: "high" }, 2],
    ]);
    expect(saver.state).toBe("saved");
  });
  it("keeps failed drafts for retry and never upgrades a conflicting version", async () => {
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error("Version conflict"))
      .mockResolvedValueOnce(2);
    const saver = new DraftSaver(1, persist);
    saver.patch({ title: "Keep this" });
    await expect(saver.flush()).rejects.toThrow("Version conflict");
    expect(saver.state).toBe("error");
    await saver.flush();
    expect(persist.mock.calls).toEqual([
      [{ title: "Keep this" }, 1],
      [{ title: "Keep this" }, 1],
    ]);
    expect(saver.state).toBe("saved");
  });
});
