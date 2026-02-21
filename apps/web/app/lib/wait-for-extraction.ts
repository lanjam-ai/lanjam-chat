/**
 * Polls conversation files until all have finished extraction (done or failed).
 * Returns true when all complete, false on timeout.
 */
export async function waitForExtraction(
  conversationId: string,
  timeoutMs = 30_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/files`);
      if (res.ok) {
        const { files } = await res.json();
        const allDone = (files as { extraction_status: string }[]).every(
          (f) => f.extraction_status === "done" || f.extraction_status === "failed",
        );
        if (allDone) return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}
