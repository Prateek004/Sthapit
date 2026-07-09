import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// G1 Purchase OCR — mirrors app/api/ai-chat/route.ts exactly for auth and
// rate limiting; only the Anthropic payload differs (vision + strict JSON out).

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Lower ceiling than chat — vision calls are heavier: 10 scans/business/minute.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
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

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp"];
// ~4MB of base64 ≈ 3MB image — Anthropic's limit is 5MB per image.
const MAX_BASE64_LENGTH = 4 * 1024 * 1024;

const SYSTEM_PROMPT = `You read photos of Indian vendor bills / purchase invoices for a restaurant.
Extract line items. Respond with ONLY a JSON object — no markdown fences, no commentary:
{
  "vendorName": string or null,
  "billDate": "yyyy-mm-dd" or null,
  "items": [
    { "name": string, "qty": number, "unit": string or null, "unitPriceRupees": number, "totalRupees": number }
  ],
  "totalRupees": number or null
}
Rules:
- Amounts in RUPEES as plain numbers (e.g. 1250.50). Never invent values: if a field is unreadable, use null (or omit the line item entirely if its amount is unreadable).
- qty defaults to 1 when the bill shows only a total for a line.
- If the image is not a purchase bill at all, respond with {"items": []}.`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI is not configured on this server." },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    let businessId = "local";

    const admin = getAdminClient();
    if (admin) {
      if (!token) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      const { data: userData, error: authErr } = await admin.auth.getUser(token);
      if (authErr || !userData.user) {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }
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
          { error: "Only business owners can scan purchase bills" },
          { status: 403 }
        );
      }
      businessId = profile.business_id;
    }

    if (!checkRateLimit(businessId)) {
      return NextResponse.json(
        { error: "Too many scans — wait a moment before trying again." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const imageBase64: string =
      typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const mediaType: string =
      typeof body.mediaType === "string" ? body.mediaType : "";

    if (!imageBase64 || !ALLOWED_MEDIA.includes(mediaType)) {
      return NextResponse.json(
        { error: "Send imageBase64 and a mediaType of jpeg/png/webp" },
        { status: 400 }
      );
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "Image too large — keep it under ~3MB" },
        { status: 413 }
      );
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              { type: "text", text: "Extract this purchase bill as JSON." },
            ],
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[scan-invoice] Anthropic error", data);
      return NextResponse.json(
        { error: data?.error?.message ?? "AI request failed" },
        { status: res.status }
      );
    }

    const text: string =
      data?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";

    // Parse strictly on the server so the client always gets clean data.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      return NextResponse.json(
        { error: "Could not read that bill — try a sharper, straighter photo." },
        { status: 422 }
      );
    }

    return NextResponse.json({ result: parsed });
  } catch (err) {
    console.error("[scan-invoice]", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
