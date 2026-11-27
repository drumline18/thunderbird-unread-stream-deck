const endpoint = "http://127.0.0.1:49387/unread";
let inFlight = false;
let pending = false;

async function publishCount() {
  if (inFlight) {
    pending = true;
    return;
  }
  inFlight = true;
  try {
    const inboxes = await messenger.folders.query({ specialUse: ["inbox"], isVirtual: false });
    const summaries = await Promise.all(inboxes.map((inbox) => messenger.folders.getFolderInfo(inbox.id)));
    const total = summaries.reduce((sum, folder) => {
      return sum + Math.max(0, folder.unreadMessageCount ?? 0);
    }, 0);
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Thunderbird-Unread": "1" },
      body: JSON.stringify(total),
      signal: AbortSignal.timeout(3000)
    });
  } catch (error) {
    // A stopped Stream Deck or restarting plugin can temporarily leave the endpoint unavailable.
    if (!(error instanceof TypeError) && error.name !== "TimeoutError") console.warn(error);
  } finally {
    inFlight = false;
    if (pending) {
      pending = false;
      void publishCount();
    }
  }
}

messenger.folders.onFolderInfoChanged.addListener((folder, changes) => {
  if (folder.specialUse?.includes("inbox") && changes.unreadMessageCount !== undefined) {
    void publishCount();
  }
});
setInterval(publishCount, 10_000);
void publishCount();
