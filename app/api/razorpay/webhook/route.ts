import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[razorpay/webhook] RAZORPAY_WEBHOOK_SECRET not set");
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") ?? "";

    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.warn("[razorpay/webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody) as {
      event: string;
      payload: {
        subscription?: {
          entity?: {
            id?: string;
            plan_id?: string;
            status?: string;
            current_end?: number;
            charge_at?: number;
          };
        };
        payment?: {
          entity?: {
            amount?: number;
          };
        };
      };
    };

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 }
      );
    }

    const subEntity = event.payload?.subscription?.entity;
    const rzpSubId = subEntity?.id;

    if (!rzpSubId) {
      // Some webhook events (like payment.captured without subscription) — ignore
      return NextResponse.json({ received: true });
    }

    // Find our subscription row by razorpay_subscription_id
    const { data: ourSub } = await admin
      .from("subscriptions")
      .select("id, business_id, plan")
      .eq("razorpay_subscription_id", rzpSubId)
      .single();

    if (!ourSub) {
      // Possibly a test webhook or for an untracked sub — acknowledge and ignore
      return NextResponse.json({ received: true });
    }

    const now = new Date().toISOString();

    switch (event.event) {
      case "subscription.activated":
      case "subscription.charged": {
        // Payment succeeded — activate the subscription
        const periodEnd = subEntity?.current_end
          ? new Date(subEntity.current_end * 1000).toISOString()
          : null;
        await admin
          .from("subscriptions")
          .update({
            status: "active",
            current_period_end: periodEnd,
            cancel_at_period_end: false,
            updated_at: now,
          })
          .eq("id", ourSub.id);
        break;
      }

      case "subscription.pending":
      case "subscription.halted": {
        await admin
          .from("subscriptions")
          .update({ status: "past_due", updated_at: now })
          .eq("id", ourSub.id);
        break;
      }

      case "subscription.cancelled": {
        await admin
          .from("subscriptions")
          .update({
            status: "canceled",
            cancel_at_period_end: true,
            updated_at: now,
          })
          .eq("id", ourSub.id);
        break;
      }

      case "subscription.completed":
      case "subscription.expired": {
        await admin
          .from("subscriptions")
          .update({ status: "expired", updated_at: now })
          .eq("id", ourSub.id);
        break;
      }

      default:
        // Unhandled event type — acknowledge so Razorpay doesn't retry
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[razorpay/webhook]", err);
    // Return 200 anyway so Razorpay doesn't keep retrying on our parse errors
    return NextResponse.json({ received: true });
  }
}
