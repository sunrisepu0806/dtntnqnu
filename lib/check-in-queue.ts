export type QueueState = "queued" | "saving" | "saved" | "duplicate" | "pending" | "failed" | "rejected";

/** The server refused this code for good (unknown MSSV, bad input): retrying cannot help. */
export class CheckInRejected extends Error {}
export type QueueItem<T> = { key: string; value: T; state: QueueState; error?: string };

/** Bounded, deduplicated work queue. Only a server acknowledgement marks an item saved. */
export class CheckInQueue<T> {
  private items = new Map<string, QueueItem<T>>();
  private active = 0;
  constructor(
    private submit: (value: T) => Promise<{ alreadyCheckedIn: boolean; pendingApproval?: boolean }>,
    private changed: (items: QueueItem<T>[]) => void,
    private concurrency = 3,
    private capacity = 500,
  ) {}
  snapshot() { return [...this.items.values()].map(item => ({ ...item })); }
  enqueue(key: string, value: T): "accepted" | "duplicate" | "full" {
    if (this.items.has(key)) return "duplicate";
    if (this.items.size >= this.capacity) return "full";
    this.items.set(key, { key, value, state: "queued" });
    this.emit(); this.pump();
    return "accepted";
  }
  retryFailed() {
    for (const item of this.items.values()) if (item.state === "failed") { item.state = "queued"; item.error = undefined; }
    this.emit(); this.pump();
  }
  private emit() { this.changed(this.snapshot()); }
  private pump() {
    while (this.active < this.concurrency) {
      const item = [...this.items.values()].find(entry => entry.state === "queued");
      if (!item) return;
      item.state = "saving"; this.active++; this.emit();
      void Promise.resolve().then(() => this.submit(item.value)).then(result => {
        item.state = result.pendingApproval ? "pending" : result.alreadyCheckedIn ? "duplicate" : "saved";
      }).catch((error: unknown) => {
        item.state = error instanceof CheckInRejected ? "rejected" : "failed";
        item.error = error instanceof Error ? error.message : "Chưa xác nhận lưu. Hãy thử lại.";
      }).finally(() => { this.active--; this.emit(); this.pump(); });
    }
  }
}

export async function sendCheckIn(activityId: string, memberId: string, sessionId = "legacy", password = "") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/attendance/check-in", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ activityId, scanCode:memberId, sessionId, password }),
    });
    const result = await response.json();
    if (!response.ok) {
      const message = result.error || "Server chưa xác nhận điểm danh.";
      // 400/404/422 mean the code itself is wrong; network, auth and 5xx errors stay retryable.
      throw [400, 404, 422].includes(response.status) ? new CheckInRejected(message) : new Error(message);
    }
    return { alreadyCheckedIn: result.alreadyCheckedIn === true, member:result.member as {id:string;name:string;mssv:string} };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Quá 12 giây chưa nhận xác nhận. Thử lại sẽ không cộng trùng.");
    throw error;
  } finally { clearTimeout(timeout); }
}
