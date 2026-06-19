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

// Razorpay plan IDs — set these in Razorpay dashboard, then add to env
const RAZORPAY_PLAN_IDS: Record<string, string> = {
  starter: process.env.RAZORPAY_PLAN_ID_STARTER ?? "",
  pro: process.env.RAZORPAY_PLAN_ID_PRO ?? "",
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 }
      );
    }

    // Verify caller
    const { data: callerData, error: callerErr } =
      await admin.auth.getUser(token);
    if (callerErr || !callerData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("role, business_id")
      .eq("id", callerData.user.id)
      .single();

    if (!profile || profile.role !== "owner" || !profile.business_id) {
      return NextResponse.json(
        { error: "Only the business owner can manage billing" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const plan: string = body.plan ?? "starter";

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json(
        { error: "Razorpay not configured" },
        { status: 500 }
      );
    }

    const planId = RAZORPAY_PLAN_IDS[plan];
    if (!planId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get or create Razorpay customer
    const { data: sub } = await admin
      .from("subscriptions")
      .select("razorpay_customer_id")
      .eq("business_id", profile.business_id)
      .single();

    let customerId: string | null = sub?.razorpay_customer_id ?? null;

    const { data: biz } = await admin
      .from("businesses")
      .select("name, phone")
      .eq("id", profile.business_id)
      .single();

    if (!customerId) {
      // Create customer in Razorpay
      const customerRes = await fetch(
        "https://api.razorpay.com/v1/customers",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(
              `${razorpayKeyId}:${razorpayKeySecret}`
            ).toString("base64")}`,
          },
          body: JSON.stringify({
            name: biz?.name ?? "Business",
            contact: biz?.phone ?? "",
            fail_existing: 0,
          }),
        }
      );
      const customer = await customerRes.json();
      if (!customerRes.ok) {
        return NextResponse.json(
          { error: customer.error?.description ?? "Failed to create Razorpay customer" },
          { status: 400 }
        );
      }
      customerId = customer.id;
      // Store customer id
      await admin
        .from("subscriptions")
        .update({ razorpay_customer_id: customerId })
        .eq("business_id", profile.business_id);
    }

    // Create Razorpay subscription
    const subRes = await fetch(
      "https://api.razorpay.com/v1/subscriptions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${razorpayKeyId}:${razorpayKeySecret}`
          ).toString("base64")}`,
        },
        body: JSON.stringify({
          plan_id: planId,
          customer_id: customerId,
          total_count: 12, // 12 billing cycles (1 year)
          quantity: 1,
          notify_info: {
            notify_phone: biz?.phone ?? "",
          },
        }),
      }
    );

    const rzpSub = await subRes.json();
    if (!subRes.ok) {
      return NextResponse.json(
        {
          error:
            rzpSub.error?.description ?? "Failed to create Razorpay subscription",
        },
        { status: 400 }
      );
    }

    // Store pending subscription id
    await admin
      .from("subscriptions")
      .update({
        razorpay_subscription_id: rzpSub.id,
        razorpay_plan_id: planId,
        status: "trialing", // stays trialing until payment confirmed via webhook
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", profile.business_id);

    return NextResponse.json({
      subscriptionId: rzpSub.id,
      customerId,
      keyId: razorpayKeyId,
    });
  } catch (err) {
    console.error("[razorpay/create-order]", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
