"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      // Observability: record error without blocking
      import("@/lib/utils/observability")
        .then(({ recordMutationError }) => recordMutationError())
        .catch(() => {});
    } catch {}
    console.error("[Sth1r] Page error:", error);
  }, [error]);

  // Detect if we are on a core billing path — if so, offer direct fallback links
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isCorePath =
    pathname.includes("/pos") ||
    pathname.includes("/tables") ||
    pathname.includes("/orders");

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#FEF9F4",
        padding: "24px",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 20,
          padding: "32px 28px",
          maxWidth: 380,
          width: "100%",
          border: "1px solid rgba(26,18,8,0.07)",
          boxShadow: "0 4px 24px rgba(26,18,8,0.07)",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "#FEF0E8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
            fontSize: 26,
          }}
        >
          ⚠️
        </div>

        {/* Headline */}
        <h2
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 19,
            color: "#1A1208",
            margin: "0 0 10px",
            letterSpacing: "-0.02em",
          }}
        >
          Something went wrong
        </h2>

        {/* Body */}
        <p
          style={{
            fontSize: 14,
            color: "#7A6456",
            margin: "0 0 28px",
            lineHeight: 1.6,
          }}
        >
          {isCorePath
            ? "Billing is still available. Try going back or returning to POS."
            : "An unexpected error occurred. Your orders and data are safe."}
        </p>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={reset}
            style={{
              background: "#E8590C",
              color: "white",
              border: "none",
              borderRadius: 50,
              padding: "13px 28px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              width: "100%",
              fontFamily: "'DM Sans', sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            Try again
          </button>

          {isCorePath && (
            <a
              href="/pos"
              style={{
                display: "block",
                background: "#F0E8DF",
                color: "#E8590C",
                borderRadius: 50,
                padding: "13px 28px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                textDecoration: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Go to Billing (POS)
            </a>
          )}

          <a
            href="/dashboard"
            style={{
              display: "block",
              color: "#A89684",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              marginTop: 4,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Back to Dashboard
          </a>
        </div>

        {/* Dev-only error detail */}
        {process.env.NODE_ENV === "development" && (
          <details style={{ marginTop: 20, textAlign: "left" }}>
            <summary
              style={{
                fontSize: 12,
                color: "#A89684",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              Error details (dev only)
            </summary>
            <pre
              style={{
                fontSize: 11,
                color: "#7A6456",
                background: "#F5F0EB",
                borderRadius: 8,
                padding: "10px 12px",
                marginTop: 10,
                overflow: "auto",
                maxHeight: 200,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontFamily: "monospace",
              }}
            >
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
              {error.digest ? `\n\nDigest: ${error.digest}` : ""}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
