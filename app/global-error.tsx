"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Vynn] Global error:", error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily: "sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#f9fafb",
          padding: "20px",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontWeight: 800, marginBottom: 8, color: "#111827" }}>
            App crashed
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>
            {error.message || "Something went wrong. Your data is safe."}
          </p>
          <button
            onClick={reset}
            style={{
              background: "#E8590C",
              color: "white",
              border: "none",
              borderRadius: 12,
              padding: "12px 24px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Reload App
          </button>
        </div>
      </body>
    </html>
  );
}
