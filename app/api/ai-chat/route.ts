
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Supabase admin client (same pattern as staff/create) ──────────────────────
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── In-memory rate limiter: max 20 requests per businessId per minute ─────────
// Resets on server restart (acceptable for edge/serverless — stateless deploys
// restart frequently enough that this is a cost-control measure, not a hard cap).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(businessId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(businessId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(businessId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Check Anthropic key first — fast fail, no DB call wasted
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI is not configured on this server." },
        { status: 500 }
      );
    }

    // 2. Auth — require valid Supabase session token
    //    When Supabase is not configured (local-only mode), we skip auth
    //    and fall through. This keeps local dev working without Supabase.
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    let businessId = "local"; // fallback for local-only mode

    const admin = getAdminClient();
    if (admin) {
      // Supabase is configured — enforce auth
      if (!token) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      const { data: userData, error: authErr } = await admin.auth.getUser(token);
      if (authErr || !userData.user) {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }
      // Get business ID for rate limiting and to confirm owner role
      const { data: profile, error: profileErr } = await admin
        .from("profiles")
        .select("role, business_id")
        .eq("id", userData.user.id)
        .single();

      if (profileErr || !profile || !profile.business_id) {
        return NextResponse.json({ error: "Profile not found" }, { status: 403 });
      }
      if (profile.role !== "owner") {
        return NextResponse.json(
          { error: "Only business owners can use the AI assistant" },
          { status: 403 }
        );
      }
      businessId = profile.business_id;
    }

    // 3. Rate limit — per business per minute
    if (!checkRateLimit(businessId)) {
      return NextResponse.json(
        { error: "Too many requests — wait a moment before asking again." },
        { status: 429 }
      );
    }

    // 4. Parse and validate body
    const body = await req.json();
    const system: string = typeof body.system === "string" ? body.system : "";
    const userMessage: string =
      typeof body.message === "string" ? body.message : "";

    if (!userMessage.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // 5. Call Anthropic
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[ai-chat] Anthropic error", data);
      return NextResponse.json(
        { error: data?.error?.message ?? "AI request failed" },
        { status: res.status }
      );
    }

    const text: string =
      data?.content?.find((b: { type: string }) => b.type === "text")?.text ??
      "No response from AI.";

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[ai-chat]", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
