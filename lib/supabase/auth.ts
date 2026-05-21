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

// ── Local auth (offline / no Supabase) ───────────────────────────────────────
const LOCAL_USERS_KEY = "vynn_local_users";

interface LocalUser {
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

// FIX: SHA-256 + per-user salt replaces insecure djb2 hash
async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Legacy djb2 — only used to verify and upgrade old local accounts
function legacyHash(password: string): string {
  let h = 0;
  for (let i = 0; i < password.length; i++) { h = (h << 5) - h + password.charCodeAt(i); h |= 0; }
  return String(h);
}

function getLocalUsers(): LocalUser[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) ?? "[]"); } catch { return []; }
}
function saveLocalUsers(users: LocalUser[]): void {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

export async function signUp(data: SignUpData): Promise<AuthResult> {
  const sb = getSupabase();

  if (!sb) {
    const users = getLocalUsers();
    if (users.some((u) => u.username === data.username.toLowerCase().trim()))
      return { ok: false, error: "Username already taken" };
    const salt = generateSalt();
    const passwordHash = await hashPassword(data.password, salt);
    users.push({
      username: data.username.toLowerCase().trim(),
      passwordHash, salt,
      role: data.role,
      businessName: data.businessName.trim(),
      ownerName: data.ownerName.trim(),
      businessType: data.businessType,
      gstPercent: 5,
    });
    saveLocalUsers(users);
    return { ok: true };
  }

  const username = data.username.toLowerCase().trim();
  const email = `${username}@vynn.app`;

  try {
    const { data: authData, error } = await sb.auth.signUp({
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

    if (error) return { ok: false, error: error.message };
    if (!authData.user) return { ok: false, error: "Signup failed — no user returned" };
    return { ok: true };
  } catch (fetchErr) {
    // Network unreachable — fall back to local offline storage
    console.warn("[Vynn] Supabase signUp network error, falling back to local:", fetchErr);
    const users = getLocalUsers();
    if (users.some((u) => u.username === username))
      return { ok: false, error: "Username already taken" };
    const salt = generateSalt();
    const passwordHash = await hashPassword(data.password, salt);
    users.push({
      username,
      passwordHash, salt,
      role: data.role,
      businessName: data.businessName.trim(),
      ownerName: data.ownerName.trim(),
      businessType: data.businessType,
      gstPercent: 5,
    });
    saveLocalUsers(users);
    return { ok: true };
  }
}

export async function signIn(username: string, password: string): Promise<AuthResult & {
  userId?: string;
  role?: UserRole;
  businessName?: string;
  businessType?: string;
  gstPercent?: number;
  upiId?: string;
  ownerName?: string;
}> {
  const sb = getSupabase();

  if (!sb) {
    const users = getLocalUsers();
    const user = users.find((u) => u.username === username.toLowerCase().trim());
    if (!user) return { ok: false, error: "Username not found" };

    let match = false;
    if (user.salt) {
      match = (await hashPassword(password, user.salt)) === user.passwordHash;
    } else {
      // Legacy account — verify with old djb2, then upgrade to SHA-256 in-place
      if (legacyHash(password) === user.passwordHash) {
        match = true;
        const salt = generateSalt();
        user.salt = salt;
        user.passwordHash = await hashPassword(password, salt);
        saveLocalUsers(users);
      }
    }

    if (!match) return { ok: false, error: "Incorrect password" };
    return {
      ok: true,
      userId: `local_${user.username}`,
      role: user.role,
      businessName: user.businessName,
      businessType: user.businessType,
      gstPercent: user.gstPercent ?? 5,
      upiId: user.upiId,
      ownerName: user.ownerName,
    };
  }

  const normalizedUsername = username.toLowerCase().trim();
  const email = `${normalizedUsername}@vynn.app`;

  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: "No session" };

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("role, business_name, business_type, gst_percent, upi_id, owner_name")
      .eq("id", user.id)
      .single();

    if (pErr || !profile) return { ok: false, error: "Profile not found" };

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
  } catch (fetchErr) {
    // Network unreachable — fall back to local offline storage
    console.warn("[Vynn] Supabase signIn network error, falling back to local:", fetchErr);
    const users = getLocalUsers();
    const user = users.find((u) => u.username === normalizedUsername);
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
    return {
      ok: true,
      userId: `local_${user.username}`,
      role: user.role,
      businessName: user.businessName,
      businessType: user.businessType,
      gstPercent: user.gstPercent ?? 5,
      upiId: user.upiId,
      ownerName: user.ownerName,
    };
  }
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

export async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) {
    const raw = typeof window !== "undefined" ? localStorage.getItem("vynn_session") : null;
    if (!raw) return null;
    try { return JSON.parse(raw).userId ?? null; } catch { return null; }
  }
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}
