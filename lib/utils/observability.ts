/**
 * Lightweight observability — Phase 10C.
 * Tracks sync failures, IDB errors, queue size, last sync time.
 * Hidden from staff UI. Accessible via window.__sth1rDiag() in DevTools.
 */

interface DiagSnapshot {
  syncFailures: number;
  syncRecoveries: number;
  idbErrors: number;
  mutationErrors: number;
  offlineQueueSize: number;
  lastSuccessfulSync: string | null;
  lastFailedSync: string | null;
  recoveryAttempts: number;
  sessionStart: string;
  appVersion: string;
}

const _diag: DiagSnapshot = {
  syncFailures: 0,
  syncRecoveries: 0,
  idbErrors: 0,
  mutationErrors: 0,
  offlineQueueSize: 0,
  lastSuccessfulSync: null,
  lastFailedSync: null,
  recoveryAttempts: 0,
  sessionStart: new Date().toISOString(),
  appVersion: "2.0.0",
};

export function recordSyncFailure(): void {
  _diag.syncFailures++;
  _diag.lastFailedSync = new Date().toISOString();
}

export function recordSyncSuccess(): void {
  _diag.syncRecoveries++;
  _diag.lastSuccessfulSync = new Date().toISOString();
}

export function recordIdbError(): void {
  _diag.idbErrors++;
}

export function recordMutationError(): void {
  _diag.mutationErrors++;
}

export function setOfflineQueueSize(n: number): void {
  _diag.offlineQueueSize = n;
}

export function recordRecoveryAttempt(): void {
  _diag.recoveryAttempts++;
}

export function getDiagSnapshot(): DiagSnapshot {
  return { ..._diag };
}

// Expose to DevTools for admin debugging — hidden from normal UI
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__sth1rDiag"] = () => {
    console.table(getDiagSnapshot());
    return getDiagSnapshot();
  };
}
