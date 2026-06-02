import { getSupabase } from "./client";

export type UserRole = "owner" | "cashier";

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export interface SignUpData {
  username: string;
  password: string;
  role: UserRole;
  businessName: string;
  ownerName: string;
  businessType: string;
}

const LOCAL_USERS_KEY = "sth1r_local_users";
const LEGACY_LOCAL_USERS_KEY = "vynn_local_users";

interface LocalUser {
  // FIX #9: uid is now a true UUID, not "local_<username>".
  // This prevents two businesses with the same username from sharing
  // the same IndexedDB partition.
  uid: string;
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
    return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) ?? "[]");
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

async function localSignUp(data: SignUpData): Promise<AuthResult> {
  const users = getLocalUsers();
  const username = data.username.toLowerCase().trim();
  if (users.some((u) => u.username === username)) {
    return { ok: true };
  }
  const salt = generateSalt();
  const passwordHash = await hashPassword(data.password, salt);
  // FIX #9: Generate a real UUID as the partition key — not "local_<username>"
  const uid = crypto.randomUUID();
  users.push({
    uid,
    username,
    passwordHash,
    salt,
    role: data.role,
    businessName: data.businessName.trim(),
    ownerName: data.ownerName.trim(),
    businessType: data.businessType,
    gstPercent: 5,
  });
  saveLocalUsers(users);
  return { ok: true };
}

export async function signUp(data: SignUpData): Promise<AuthResult> {
  const username = data.username.toLowerCase().trim();

  const sb = getSupabase();

  // No Supabase — pure local
  if (!sb) {
    const users = getLocalUsers();
    if (users.some((u) => u.username === username)) {
      return { ok: false, error: "Username already taken" };
    }
    return localSignUp(data);
  }

  // Save locally first — always succeeds, always allows login
  const localResult = await localSignUp(data);
  if (!localResult.ok) return localResult;

  const email = `${username}@sth1r.app`;
  try {
    const { error } = await sb.auth.signUp({
      email,
      password: data.password,
      options: {
        data: {
          username,
          business_name: data.businessName.trim(),
          owner_name: data.ownerName.trim(),
          business_type: data.businessType,
          role: data.role,
        },
      },
    });
    if (error && !isRateLimitError(error.message)) {
      console.warn("[Sth1r] Supabase signUp non-fatal:", error.message);
    }
  } catch {
    // Network down — local save already done above
  }

  return { ok: true };
}

type SignInResult = AuthResult & {
  userId?: string;
  role?: UserRole;
  businessName?: string;
  businessType?: string;
  gstPercent?: number;
  upiId?: string;
  ownerName?: string;
};

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
      .select("role, business_name, business_type, gst_percent, upi_id, owner_name")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return localResult.ok
        ? localResult
        : { ok: false, error: "Profile not found" };
    }

    return {
      ok: true,
      userId: user.id,
      role: profile.role as UserRole,
      businessName: profile.business_name,
      businessType: profile.business_type,
      gstPercent: profile.gst_percent ?? 5,
      upiId: profile.upi_id,
      ownerName: profile.owner_name,
    };
  } catch {
    return localResult.ok
      ? localResult
      : { ok: false, error: "Network error — please check connection" };
  }
}

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

  // FIX #9: Use the stored UUID as userId, fall back to legacy "local_<username>"
  // for accounts created before this fix (so existing users aren't locked out).
  const userId = user.uid ?? `local_${user.username}`;

  return {
    ok: true,
    userId,
    role: user.role,
    businessName: user.businessName,
    businessType: user.businessType,
    gstPercent: user.gstPercent ?? 5,
    upiId: user.upiId,
    ownerName: user.ownerName,
  };
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

// ── FIX #3: Password recovery (Supabase path) ────────────────────────────────
// Call this from a "Forgot password?" link on the sign-in screen.
// Sends a recovery email via Supabase. The user lands on /reset-password
// with an access_token in the URL hash; handle it there with
// supabase.auth.updateUser({ password: newPassword }).
export async function sendPasswordRecovery(username: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) {
    return {
      ok: false,
      error:
        "Password recovery requires cloud sync to be enabled. " +
        "Ask your administrator to set up Supabase, or contact support.",
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
