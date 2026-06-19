import { getSupabase } from "./client";

export type UserRole = "owner" | "cashier";

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export interface SignUpData {
  username: string;
  password: string;
  businessName: string;
  ownerName: string;
  businessType: string;
}

const LOCAL_USERS_KEY = "sth1r_local_users";
const LEGACY_LOCAL_USERS_KEY = "vynn_local_users";

interface LocalUser {
  uid: string;
  businessId: string;
  username: string;
  passwordHash: string;
  salt?: string;
  role: UserRole;
  businessName: string;
  ownerName: string;
  businessType: string;
  gstPercent: number;
  upiId?: string;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function legacyHash(password: string): string {
  let h = 0;
  for (let i = 0; i < password.length; i++) {
    h = (h << 5) - h + password.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

function getLocalUsers(): LocalUser[] {
  try {
    const legacy = localStorage.getItem(LEGACY_LOCAL_USERS_KEY);
    if (legacy && !localStorage.getItem(LOCAL_USERS_KEY)) {
      localStorage.setItem(LOCAL_USERS_KEY, legacy);
      localStorage.removeItem(LEGACY_LOCAL_USERS_KEY);
    }
    const raw = JSON.parse(
      localStorage.getItem(LOCAL_USERS_KEY) ?? "[]"
    ) as Partial<LocalUser>[];
    // Backward compat: old records had no businessId — default it to their own uid
    return raw.map((u) => ({ ...u, businessId: u.businessId ?? u.uid } as LocalUser));
  } catch {
    return [];
  }
}

function saveLocalUsers(users: LocalUser[]): void {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
}

function isRateLimitError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("too many") ||
    lower.includes("security purposes") ||
    lower.includes("exceeded")
  );
}

// ── Owner sign-up. Cashiers are created by the owner via createStaffAccount. ──
async function localSignUp(
  data: SignUpData
): Promise<{ ok: boolean; error?: string; businessId?: string }> {
  const users = getLocalUsers();
  const username = data.username.toLowerCase().trim();
  if (users.some((u) => u.username === username)) {
    return { ok: false, error: "Username already taken" };
  }
  const salt = generateSalt();
  const passwordHash = await hashPassword(data.password, salt);
  const uid = crypto.randomUUID();
  const businessId = crypto.randomUUID();
  users.push({
    uid,
    businessId,
    username,
    passwordHash,
    salt,
    role: "owner",
    businessName: data.businessName.trim(),
    ownerName: data.ownerName.trim(),
    businessType: data.businessType,
    gstPercent: 5,
  });
  saveLocalUsers(users);
  return { ok: true, businessId };
}

export async function signUp(
  data: SignUpData
): Promise<AuthResult & { businessId?: string }> {
  const username = data.username.toLowerCase().trim();
  const sb = getSupabase();

  if (!sb) {
    return localSignUp(data);
  }

  const localResult = await localSignUp(data);
  if (!localResult.ok) return localResult;

  const email = `${username}@sth1r.app`;
  try {
    const { data: signUpData, error } = await sb.auth.signUp({
      email,
      password: data.password,
      options: {
        data: {
          username,
          business_name: data.businessName.trim(),
          owner_name: data.ownerName.trim(),
          business_type: data.businessType,
          role: "owner",
        },
      },
    });

    if (error && !isRateLimitError(error.message)) {
      console.warn("[Sth1r] Supabase signUp non-fatal:", error.message);
      return localResult;
    }

    const newUserId = signUpData?.user?.id;
    if (newUserId) {
      const { data: biz, error: bizErr } = await sb
        .from("businesses")
        .insert({
          name: data.businessName.trim(),
          owner_name: data.ownerName.trim(),
          business_type: data.businessType,
          gst_percent: 5,
          owner_user_id: newUserId,
        })
        .select("id")
        .single();

      if (!bizErr && biz) {
        await sb.from("profiles").upsert({
          id: newUserId,
          username,
          role: "owner",
          business_id: biz.id,
          business_name: data.businessName.trim(),
          owner_name: data.ownerName.trim(),
          business_type: data.businessType,
          gst_percent: 5,
        });
        await sb
          .from("subscriptions")
          .insert({
            business_id: biz.id,
            plan: "free",
            status: "trialing",
            trial_ends_at: new Date(
              Date.now() + 14 * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
          .catch(() => {});
        return { ok: true, businessId: biz.id };
      }
    }
  } catch {
    // Network down — local save already done above
  }

  return localResult;
}

type SignInResult = AuthResult & {
  userId?: string;
  businessId?: string;
  role?: UserRole;
  businessName?: string;
  businessType?: string;
  gstPercent?: number;
  upiId?: string;
  ownerName?: string;
  subscription?: {
    plan: "free" | "starter" | "pro";
    status: "trialing" | "active" | "past_due" | "canceled" | "expired";
    trialEndsAt?: string | null;
    isEntitled: boolean;
  };
};

async function localSignIn(
  username: string,
  password: string
): Promise<SignInResult> {
  const users = getLocalUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return { ok: false, error: "Username not found" };

  let match = false;
  if (user.salt) {
    match = (await hashPassword(password, user.salt)) === user.passwordHash;
  } else {
    if (legacyHash(password) === user.passwordHash) {
      match = true;
      const salt = generateSalt();
      user.salt = salt;
      user.passwordHash = await hashPassword(password, salt);
      saveLocalUsers(users);
    }
  }

  if (!match) return { ok: false, error: "Incorrect password" };

  const userId = user.uid ?? `local_${user.username}`;
  const businessId = user.businessId ?? userId;

  return {
    ok: true,
    userId,
    businessId,
    role: user.role,
    businessName: user.businessName,
    businessType: user.businessType,
    gstPercent: user.gstPercent ?? 5,
    upiId: user.upiId,
    ownerName: user.ownerName,
  };
}

export async function signIn(
  username: string,
  password: string
): Promise<SignInResult> {
  const sb = getSupabase();
  const normalizedUsername = username.toLowerCase().trim();
  const localResult = await localSignIn(normalizedUsername, password);

  if (!sb) return localResult;

  const email = `${normalizedUsername}@sth1r.app`;
  try {
    const { data: signInData, error } = await sb.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (localResult.ok) return localResult;
      if (isRateLimitError(error.message)) {
        return { ok: false, error: error.message };
      }
      return { ok: false, error: "Invalid username or password" };
    }

    const user = signInData.user;
    if (!user) {
      return localResult.ok
        ? localResult
        : { ok: false, error: "No session returned" };
    }

    const { data: profile } = await sb
      .from("profiles")
      .select(
        "role, business_id, business_name, business_type, gst_percent, upi_id, owner_name"
      )
      .eq("id", user.id)
      .single();

    if (!profile || !profile.business_id) {
      return localResult.ok
        ? localResult
        : {
            ok: false,
            error:
              "Profile not set up — contact your business owner",
          };
    }

    const { data: sub } = await sb
      .from("subscriptions")
      .select("plan, status, trial_ends_at")
      .eq("business_id", profile.business_id)
      .single();

    const isEntitled = sub
      ? sub.status === "active" ||
        (sub.status === "trialing" &&
          sub.trial_ends_at &&
          new Date(sub.trial_ends_at) > new Date())
      : true; // no row yet — don't lock owner out on first login

    return {
      ok: true,
      userId: user.id,
      businessId: profile.business_id,
      role: profile.role as UserRole,
      businessName: profile.business_name,
      businessType: profile.business_type,
      gstPercent: profile.gst_percent ?? 5,
      upiId: profile.upi_id,
      ownerName: profile.owner_name,
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            trialEndsAt: sub.trial_ends_at,
            isEntitled,
          }
        : undefined,
    };
  } catch {
    return localResult.ok
      ? localResult
      : { ok: false, error: "Network error — please check connection" };
  }
}

export async function signOut(): Promise<void> {
  try {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
  } catch {}
}

export async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem("sth1r_session")
        : null;
    if (!raw) return null;
    try {
      return JSON.parse(raw).userId ?? null;
    } catch {
      return null;
    }
  }
  try {
    const { data } = await sb.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// ── Owner creates a cashier account under their own business ──
// Calls the server-side route because creating Supabase Auth users
// requires the service_role key which must NEVER be in browser code.
export interface CreateStaffData {
  username: string;
  password: string;
  businessId: string;
}

export async function createStaffAccount(
  data: CreateStaffData
): Promise<AuthResult> {
  const sb = getSupabase();
  const username = data.username.toLowerCase().trim();

  if (!sb) {
    // Local-only mode: add user to localStorage under same businessId
    const users = getLocalUsers();
    if (users.some((u) => u.username === username)) {
      return { ok: false, error: "Username already taken" };
    }
    const owner = users.find(
      (u) => u.businessId === data.businessId && u.role === "owner"
    );
    const salt = generateSalt();
    const passwordHash = await hashPassword(data.password, salt);
    users.push({
      uid: crypto.randomUUID(),
      businessId: data.businessId,
      username,
      passwordHash,
      salt,
      role: "cashier",
      businessName: owner?.businessName ?? "",
      ownerName: owner?.ownerName ?? "",
      businessType: owner?.businessType ?? "restaurant",
      gstPercent: owner?.gstPercent ?? 5,
    });
    saveLocalUsers(users);
    return { ok: true };
  }

  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return { ok: false, error: "Not signed in" };

    const res = await fetch("/api/staff/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        username,
        password: data.password,
      }),
    });
    const json = await res.json();
    if (!res.ok)
      return { ok: false, error: json.error ?? "Failed to create staff account" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error — please check connection" };
  }
}

export async function sendPasswordRecovery(
  username: string
): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) {
    return {
      ok: false,
      error:
        "Password recovery requires cloud sync. Ask your administrator to set up Supabase.",
    };
  }
  const email = `${username.toLowerCase().trim()}@sth1r.app`;
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error — please check connection" };
  }
}
