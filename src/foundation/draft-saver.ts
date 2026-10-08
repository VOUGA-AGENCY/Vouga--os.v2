export type SaveState = "saved" | "saving" | "unsaved" | "error";
// Coalesce edits and serialize writes. Failed fields stay in the draft and can
// be retried explicitly; never silently adopt another user's newer version.
export class DraftSaver {
  private pending: Record<string, unknown> = {};
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  state: SaveState = "saved";
  error = "";
  constructor(
    private version: number,
    private persist: (
      fields: Record<string, unknown>,
      version: number,
    ) => Promise<number>,
    private changed: () => void = () => {},
  ) {}
  patch(fields: Record<string, unknown>, schedule = true) {
    Object.assign(this.pending, fields);
    this.state = "unsaved";
    this.changed();
    clearTimeout(this.timer);
    if (schedule)
      this.timer = setTimeout(() => {
        void this.flush().catch(() => undefined);
      }, 300);
  }
  committed(version: number) {
    this.version = version;
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (Object.keys(this.pending).length) return this.flush();
      return;
    }
    if (!Object.keys(this.pending).length) return;
    const run = async () => {
      while (Object.keys(this.pending).length) {
        const fields = this.pending;
        this.pending = {};
        this.state = "saving";
        this.error = "";
        this.changed();
        try {
          this.version = await this.persist(fields, this.version);
        } catch (error) {
          this.pending = { ...fields, ...this.pending };
          this.state = "error";
          this.error =
            error instanceof Error ? error.message : "Could not save.";
          this.changed();
          throw error;
        }
      }
      this.state = "saved";
      this.changed();
    };
    this.running = run();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
}
