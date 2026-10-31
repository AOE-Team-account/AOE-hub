"use client";

// Last resort: shown only if the page frame itself (the part around every
// page) crashes, so it cannot use the hub's own styles or languages. It says
// the same thing in English and Chinese, with no technical detail.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem", color: "#222" }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong · 出了点问题</h1>
        <p>We&apos;re sorry — please try again. · 很抱歉，请再试一次。</p>
        <button type="button" onClick={reset} style={{ padding: "8px 18px", fontSize: 15, cursor: "pointer" }}>
          Try again · 再试一次
        </button>
      </body>
    </html>
  );
}
