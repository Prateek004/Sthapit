"use client";
import React, { useState, useRef, useEffect } from "react";
import { Order, RawMaterial } from "@/lib/types";
import { Leak } from "@/components/ai/LeakEngine";
import { Send } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

interface Props {
  orders: Order[];
  rawMaterials: RawMaterial[];
  businessName: string;
  leaks: Leak[];
}

interface ChatMessage {
  role: "assistant" | "user";
  text: string;
}

export default function SthappitChat({ orders, rawMaterials, businessName, leaks }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: `Live on ${businessName}. Ask me where money is leaking today. I answer in Finding → Why → Next action.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (input.trim() === "") return;
    const userText = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setInput("");
    setLoading(true);

    try {
      // Get session token if Supabase is configured — route requires it in production
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const sb = getSupabase();
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }
      }

      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: userText,
          system: `You are STHAPPIT, an AI profit assistant for ${businessName}.
RULES:
- Only use the data provided below. Never invent numbers.
- If data is missing say: I need [X] to answer this.
- Reply in under 100 words.
- Label every figure: Estimated or Confirmed.
- Format every reply as: **Finding:** ... **Why:** ... **Next action:** ...
DATA:
Today orders (${orders.length}): ${JSON.stringify(orders.slice(0, 40))}
Detected leaks: ${JSON.stringify(leaks)}
Raw materials: ${JSON.stringify(rawMaterials.slice(0, 25))}`,
        }),
      });
      const data = await res.json();
      const text: string = res.ok
        ? data?.text ?? "No response from AI."
        : data?.error ?? "Could not reach AI. Check your connection.";
      setMessages((prev) => [...prev, { role: "assistant", text }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Could not reach AI. Check your connection." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0F1F16",
      }}
    >
      <style>
        {`
          @keyframes sthappit-dot-pulse {
            0%, 80%, 100% { opacity: 0.2; }
            40% { opacity: 1; }
          }
        `}
      </style>

      {/* Header strip */}
      <div
        style={{
          background: "#0A1A0F",
          borderBottom: "1px solid #1C2D24",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 12,
              height: 12,
              background: "#00C896",
              borderRadius: 4,
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: "white",
                lineHeight: 1.2,
              }}
            >
              STHAPPIT
            </div>
            <div style={{ fontSize: 10, color: "#4A6A58", lineHeight: 1.2 }}>
              CLAUDE SONNET 4.6
            </div>
          </div>
        </div>
        <button
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            color: "#4A6A58",
            cursor: "default",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div
              key={i}
              style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: "90%" }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: "#1C2D24",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#00C896",
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'Syne', sans-serif",
                }}
              >
                S
              </div>
              <div
                style={{
                  background: "#1C2D24",
                  borderRadius: 12,
                  padding: "12px 14px",
                  color: "white",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
                dangerouslySetInnerHTML={{
                  __html: m.text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
                }}
              />
            </div>
          ) : (
            <div
              key={i}
              style={{
                background: "#1A2E20",
                color: "#A8C4B0",
                fontSize: 13,
                padding: "10px 14px",
                borderRadius: 12,
                maxWidth: "80%",
                alignSelf: "flex-end",
              }}
            >
              {m.text}
            </div>
          )
        )}

        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: "90%" }}>
            <div
              style={{
                width: 24,
                height: 24,
                background: "#1C2D24",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "#00C896",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "'Syne', sans-serif",
              }}
            >
              S
            </div>
            <div
              style={{
                background: "#1C2D24",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#6B8F7A",
                    display: "inline-block",
                    animation: "sthappit-dot-pulse 1.2s ease-in-out infinite",
                    animationDelay: `${d * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div
        style={{
          borderTop: "1px solid #1C2D24",
          padding: 12,
          display: "flex",
          gap: 8,
        }}
      >
        <textarea
          style={{
            flex: 1,
            background: "#1C2D24",
            border: "none",
            borderRadius: 10,
            color: "white",
            fontSize: 13,
            padding: "10px 12px",
            resize: "none",
            fontFamily: "inherit",
          }}
          rows={2}
          placeholder="Ask STHAPPIT anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={sendMessage}
          disabled={loading || input.trim() === ""}
          style={{
            background: "#00C896",
            borderRadius: 10,
            padding: "10px 14px",
            border: "none",
            cursor: loading || input.trim() === "" ? "default" : "pointer",
            opacity: loading || input.trim() === "" ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Send size={16} color="#0A1A0F" />
        </button>
      </div>
    </div>
  );
}
