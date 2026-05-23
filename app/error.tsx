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
    console.error("[Sth1r] Page error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#FEF9F4",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "#FEF0E8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          fontSize: 28,
        }}
      >
        ⚠️
      </div>
      <h2
        style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 18,
          color: "#1A1208",
          marginBottom: 8,
        }}
      >
        Something went wrong
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "#7A6456",
          textAlign: "center",
          marginBottom: 24,
          maxWidth: 300,
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.6,
        }}
      >
        {error.message || "An unexpected error occurred. Your data is safe."}
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
        Try again
      </button>
    </div>
  );
}
