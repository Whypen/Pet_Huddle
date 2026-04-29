import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  DraftMode,
  DraftStatus,
  FORM_DRAFT_VERSION,
  StoredFormDraft,
} from "@/lib/formDraftConfigs";

type SaveRemoteArgs<TDraft> = {
  changedDraft: Partial<TDraft>;
  changedFields: Array<keyof TDraft>;
  draft: TDraft;
  requestId: number;
};

type SaveRemoteResult<TDraft> = {
  baselineUpdatedAt?: string | null;
  baselineValue?: TDraft | null;
};

type HydrateArgs<TValue, TDraft extends Record<string, unknown>> = {
  baselineUpdatedAt: string | null;
  baselineValue: TValue;
  legacyKeys?: string[];
  legacyDraft?: StoredFormDraft<TDraft> | null;
};

type UseFormDraftAutosaveOptions<TValue, TDraft extends Record<string, unknown>> = {
  draftKey: string | null;
  enabled: boolean;
  mode: DraftMode;
  value: TValue;
  setValue: Dispatch<SetStateAction<TValue>>;
  getDraftValue: (value: TValue) => TDraft;
  mergeStoredDraft?: (args: { baselineValue: TValue; storedForm: TDraft }) => TDraft;
  debounceMs?: number;
  saveRemote?: (args: SaveRemoteArgs<TDraft>) => Promise<SaveRemoteResult<TDraft> | void>;
};

type DiscardArgs = {
  restoreBaseline?: boolean;
};

const stableStringify = (value: unknown): string => JSON.stringify(value);

const readStoredDraft = <TDraft extends Record<string, unknown>>(
  draftKey: string,
  legacyKeys: string[] = [],
): StoredFormDraft<TDraft> | null => {
  try {
    const keys = [draftKey, ...legacyKeys.filter(Boolean)];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredFormDraft<TDraft>;
      if (!parsed || typeof parsed !== "object" || !parsed.form) continue;
      if (typeof parsed.draft_updated_at !== "string") continue;
      if (parsed.version !== FORM_DRAFT_VERSION) continue;
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const writeStoredDraft = <TDraft extends Record<string, unknown>>(
  draftKey: string,
  payload: StoredFormDraft<TDraft>,
) => {
  localStorage.setItem(draftKey, JSON.stringify(payload));
};

const removeStoredDraft = (draftKey: string | null, legacyKeys: string[] = []) => {
  if (!draftKey) return;
  try {
    localStorage.removeItem(draftKey);
    legacyKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // no-op
  }
};

const isNewerThanBaseline = (draftUpdatedAt: string, baselineUpdatedAt: string | null): boolean => {
  if (!baselineUpdatedAt) return true;
  const draftMs = Date.parse(draftUpdatedAt);
  const baselineMs = Date.parse(baselineUpdatedAt);
  if (Number.isNaN(draftMs) || Number.isNaN(baselineMs)) return draftUpdatedAt > baselineUpdatedAt;
  return draftMs > baselineMs;
};

const diffDraft = <TDraft extends Record<string, unknown>>(baseline: TDraft, next: TDraft) => {
  const changedDraft: Partial<TDraft> = {};
  const changedFields: Array<keyof TDraft> = [];
  (Object.keys(next) as Array<keyof TDraft>).forEach((key) => {
    if (stableStringify(next[key]) === stableStringify(baseline[key])) return;
    changedDraft[key] = next[key];
    changedFields.push(key);
  });
  return { changedDraft, changedFields };
};

export function useFormDraftAutosave<TValue, TDraft extends Record<string, unknown>>({
  draftKey,
  enabled,
  mode,
  value,
  setValue,
  getDraftValue,
  mergeStoredDraft,
  debounceMs = 1000,
  saveRemote,
}: UseFormDraftAutosaveOptions<TValue, TDraft>) {
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const baselineFullValueRef = useRef<TValue | null>(null);
  const baselineDraftRef = useRef<TDraft | null>(null);
  const baselineUpdatedAtRef = useRef<string | null>(null);
  const latestIssuedRequestIdRef = useRef(0);
  const inFlightRequestIdRef = useRef<number | null>(null);
  const queuedSaveRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);
  const suppressNextPersistRef = useRef(false);
  const legacyKeysRef = useRef<string[]>([]);

  const currentDraft = useMemo(() => getDraftValue(value), [getDraftValue, value]);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const syncBaselineValue = useCallback((nextValue: TValue | null) => {
    baselineFullValueRef.current = nextValue;
  }, []);

  const flushLocalDraftNow = useCallback(() => {
    if (!enabled || !draftKey || !hydratedRef.current) return;
    const payload: StoredFormDraft<TDraft> = {
      version: FORM_DRAFT_VERSION,
      form: currentDraft,
      draft_updated_at: new Date().toISOString(),
      baseline_updated_at: baselineUpdatedAtRef.current,
      baseline_hash: baselineDraftRef.current ? stableStringify(baselineDraftRef.current) : null,
    };
    try {
      writeStoredDraft(draftKey, payload);
      setHasLocalDraft(true);
      if (mode === "local-only" && status !== "restored") {
        setStatus("saved");
      }
    } catch {
      // no-op
    }
  }, [currentDraft, draftKey, enabled, mode, status]);

  const commitLatestDraftAsBaseline = useCallback((baselineUpdatedAt?: string | null, baselineValue?: TDraft | null) => {
    const nextBaseline = baselineValue ?? currentDraft;
    baselineDraftRef.current = nextBaseline;
    baselineUpdatedAtRef.current = baselineUpdatedAt ?? new Date().toISOString();
    if (baselineFullValueRef.current && baselineValue) {
      baselineFullValueRef.current = {
        ...(baselineFullValueRef.current as Record<string, unknown>),
        ...(baselineValue as Record<string, unknown>),
      } as TValue;
    }
    const stored = draftKey ? readStoredDraft<TDraft>(draftKey, legacyKeysRef.current) : null;
    if (
      stored &&
      stableStringify(stored.form) === stableStringify(nextBaseline)
    ) {
      removeStoredDraft(draftKey, legacyKeysRef.current);
      setHasLocalDraft(false);
    }
    setStatus("saved");
  }, [currentDraft, draftKey]);

  const runRemoteSave = useCallback(async () => {
    if (!enabled || mode !== "local-and-remote" || !draftKey || !saveRemote) return false;
    const baselineDraft = baselineDraftRef.current;
    if (!baselineDraft) return false;
    const { changedDraft, changedFields } = diffDraft(baselineDraft, currentDraft);
    if (changedFields.length === 0) {
      setStatus("saved");
      return false;
    }
    if (inFlightRequestIdRef.current !== null) {
      queuedSaveRef.current = true;
      return false;
    }

    const requestId = latestIssuedRequestIdRef.current + 1;
    latestIssuedRequestIdRef.current = requestId;
    inFlightRequestIdRef.current = requestId;
    setStatus("saving");

    try {
      const result = await saveRemote({
        changedDraft,
        changedFields,
        draft: currentDraft,
        requestId,
      });
      if (requestId !== latestIssuedRequestIdRef.current) return false;
      commitLatestDraftAsBaseline(result?.baselineUpdatedAt ?? null, result?.baselineValue ?? currentDraft);
      return true;
    } catch {
      if (requestId === latestIssuedRequestIdRef.current) {
        setStatus("offline_draft");
      }
      return false;
    } finally {
      if (inFlightRequestIdRef.current === requestId) {
        inFlightRequestIdRef.current = null;
      }
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        void runRemoteSave();
      }
    }
  }, [
    commitLatestDraftAsBaseline,
    currentDraft,
    draftKey,
    enabled,
    mode,
    saveRemote,
  ]);

  const flushRemoteNow = useCallback(async () => {
    clearDebounce();
    return runRemoteSave();
  }, [clearDebounce, runRemoteSave]);

  const hydrateFromBaseline = useCallback((args: HydrateArgs<TValue, TDraft>) => {
    if (!draftKey || !enabled) {
      baselineFullValueRef.current = args.baselineValue;
      baselineDraftRef.current = getDraftValue(args.baselineValue);
      baselineUpdatedAtRef.current = args.baselineUpdatedAt;
      hydratedRef.current = true;
      return;
    }

    legacyKeysRef.current = args.legacyKeys ?? [];
    baselineFullValueRef.current = args.baselineValue;
    baselineDraftRef.current = getDraftValue(args.baselineValue);
    baselineUpdatedAtRef.current = args.baselineUpdatedAt;

    const stored = readStoredDraft<TDraft>(draftKey, legacyKeysRef.current) ?? args.legacyDraft ?? null;
    if (!stored) {
      hydratedRef.current = true;
      setHasLocalDraft(false);
      setStatus("idle");
      return;
    }

    setHasLocalDraft(true);
    if (isNewerThanBaseline(stored.draft_updated_at, args.baselineUpdatedAt)) {
      const restoredForm = mergeStoredDraft
        ? mergeStoredDraft({ baselineValue: args.baselineValue, storedForm: stored.form })
        : stored.form;
      suppressNextPersistRef.current = true;
      setValue({
        ...(args.baselineValue as Record<string, unknown>),
        ...(restoredForm as Record<string, unknown>),
      } as TValue);
      setStatus("restored");
    } else {
      removeStoredDraft(draftKey, legacyKeysRef.current);
      setHasLocalDraft(false);
      setStatus("idle");
    }
    hydratedRef.current = true;
  }, [draftKey, enabled, getDraftValue, mergeStoredDraft, setValue]);

  const discardDraft = useCallback((args: DiscardArgs = {}) => {
    removeStoredDraft(draftKey, legacyKeysRef.current);
    setHasLocalDraft(false);
    clearDebounce();
    queuedSaveRef.current = false;
    if (args.restoreBaseline !== false && baselineFullValueRef.current) {
      suppressNextPersistRef.current = true;
      setValue(baselineFullValueRef.current);
    }
    setStatus("idle");
  }, [clearDebounce, draftKey, setValue]);

  useEffect(() => () => clearDebounce(), [clearDebounce]);

  useEffect(() => {
    if (!enabled || !draftKey || !hydratedRef.current) return;
    if (suppressNextPersistRef.current) {
      suppressNextPersistRef.current = false;
      return;
    }

    flushLocalDraftNow();

    if (mode !== "local-and-remote") return;
    clearDebounce();
    debounceTimerRef.current = window.setTimeout(() => {
      void runRemoteSave();
    }, debounceMs);
  }, [
    clearDebounce,
    debounceMs,
    draftKey,
    enabled,
    flushLocalDraftNow,
    mode,
    runRemoteSave,
    currentDraft,
  ]);

  return {
    status,
    hasLocalDraft,
    latestIssuedRequestId: latestIssuedRequestIdRef.current,
    hydrateFromBaseline,
    flushLocalDraftNow,
    flushRemoteNow,
    discardDraft,
    syncBaselineValue,
    commitLatestDraftAsBaseline,
  };
}
