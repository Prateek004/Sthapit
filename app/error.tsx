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
    console.error("[Vynn] Page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-5">
      <div className="w-14 h-14 rounded-3xl bg-red-100 flex items-center justify-center mb-4">
        <span className="text-2xl">⚠️</span>
      </div>
      <h2 className="text-lg font-black text-gray-900 mb-1">Something went wrong</h2>
      <p className="text-sm text-gray-400 text-center mb-6 max-w-xs">
        {error.message || "An unexpected error occurred. Your data is safe."}
      </p>
      <button
        onClick={reset}
        className="px-6 py-3 bg-primary-500 text-white rounded-2xl font-bold text-sm shadow-md"
      >
        Try again
      </button>
    </div>
  );
}
