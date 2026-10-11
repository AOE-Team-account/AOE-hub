// Turns database write errors into something a member can act on. Row-level
// security refusals are how the hub says "your account can't do that right
// now" (restricted, suspended, or the Creator account, which never posts).
export function friendlyWriteError(error: { code?: string; message: string }): string {
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) {
    return "Your account can't post, upload or comment right now. Check the notice at the top of the page.";
  }
  return error.message;
}
