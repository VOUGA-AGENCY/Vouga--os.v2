// Contracts for the next increment. No adapter is connected in the local edition.
// A voice transcript goes through the same capture preview and commit workflow.
export interface TranscriptionPort {
  transcribe(
    audio: Blob,
    language: "pt-PT",
  ): Promise<{ text: string; uncertainSpans: string[] }>;
}
export interface CalendarPublisher {
  // The target calendar owner is explicit and independent of the creator.
  publish(input: {
    meetingId: string;
    calendarOwnerId: string;
    requestedBy: string;
  }): Promise<{ state: "synced" | "pending" | "error"; externalId?: string }>;
}
export interface PullRequestReader {
  listOpen(
    repository: string,
  ): Promise<{ url: string; title: string; number: number; draft: boolean }[]>;
}
