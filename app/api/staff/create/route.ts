import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const PLAN_STAFF_LIMITS: Record<string, number> = {
  free: 1,
  starter: 5,
  pro: 100000,
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
        { error: "Server not configured — SUPABASE_SERVICE_ROLE_KEY missing" },
        { status: 500 }
      );
    }

    // Verify caller token and confirm they are an owner
    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data: callerProfile, error: profileErr } = await admin
      .from("profiles")
      .select("role, business_id")
      .eq("id", callerData.user.id)
      .single();

    if (
      profileErr ||
      !callerProfile ||
      callerProfile.role !== "owner" ||
      !callerProfile.business_id
    ) {
      return NextResponse.json(
        { error: "Only the business owner can create staff accounts" },
        { status: 403 }
      );
    }

    const businessId: string = callerProfile.business_id;

    // Enforce plan staff limit (defence-in-depth: DB trigger also enforces)
    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("business_id", businessId)
      .single();

    const plan = sub?.plan ?? "free";
    const maxStaff = PLAN_STAFF_LIMITS[plan] ?? 1;

    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "cashier");

    if ((count ?? 0) >= maxStaff) {
      return NextResponse.json(
        {
          error: `Staff limit reached for your ${plan} plan (${maxStaff} cashier${maxStaff === 1 ? "" : "s"}). Upgrade to add more.`,
        },
        { status: 403 }
      );
    }

    // Parse and validate body
    const body = await req.json();
    const username = String(body.username ?? "")
      .toLowerCase()
      .trim();
    const password = String(body.password ?? "");

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Fetch business details for profile row
    const { data: business } = await admin
      .from("businesses")
      .select("name, owner_name, business_type, gst_percent")
      .eq("id", businessId)
      .single();

    const email = `${username}@sth1r.app`;

    // Create Supabase Auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, role: "cashier" },
    });

    if (createErr || !created.user) {
      const msg = createErr?.message?.toLowerCase().includes("already")
        ? "Username already taken"
        : (createErr?.message ?? "Failed to create account");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Insert profile row (DB trigger will also enforce staff limit)
    const { error: insertErr } = await admin.from("profiles").insert({
      id: created.user.id,
      username,
      role: "cashier",
      business_id: businessId,
      business_name: business?.name ?? "",
      owner_name: business?.owner_name ?? "",
      business_type: business?.business_type ?? "restaurant",
      gst_percent: business?.gst_percent ?? 5,
      created_by: callerData.user.id,
    });

    if (insertErr) {
      // Roll back the auth user so we don't create an orphan
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      const msg = insertErr.message.includes("PLAN_LIMIT_EXCEEDED")
        ? `Staff limit reached for your ${plan} plan. Upgrade to add more.`
        : insertErr.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId: created.user.id });
  } catch (err) {
    console.error("[staff/create]", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
