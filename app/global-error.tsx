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
    console.error("[Sth1r] Global error:", error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily: "'DM Sans', sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#FEF9F4",
          padding: "20px",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#E8590C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                fontSize: 20,
                color: "white",
                letterSpacing: "-0.03em",
              }}
            >
              S1
            </span>
          </div>
          <h2
            style={{
              fontWeight: 800,
              marginBottom: 8,
              color: "#1A1208",
              fontFamily: "'Syne', sans-serif",
              fontSize: 18,
            }}
          >
            App crashed
          </h2>
          <p
            style={{
              color: "#7A6456",
              fontSize: 13,
              marginBottom: 24,
              lineHeight: 1.6,
            }}
          >
            {error.message || "Something went wrong. Your data is safe."}
          </p>
          <button
            onClick={reset}
            style={{
              background: "#E8590C",
              color: "white",
              border: "none",
              borderRadius: 50,
              padding: "12px 28px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Reload App
          </button>
        </div>
      </body>
    </html>
  );
}
