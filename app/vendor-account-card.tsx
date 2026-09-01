"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Vendor } from "@/lib/pos-core";
import {
  manageVendorAccount,
  VendorAccountError,
  type VendorAccountStatus,
} from "@/lib/vendor-account";

const VENDOR_LOGIN_URL = "https://kicks-center.vercel.app/vendor";

function accountErrorMessage(error: unknown) {
  const code = error instanceof VendorAccountError ? error.code : "";
  if (code === "ACTIVE_ADMIN_REQUIRED") return "只有啟用中的管理員可以管理供應商帳號";
  if (code === "VENDOR_ACCOUNT_EXISTS") return "此寄賣廠商已綁定登入帳號";
  if (code === "VALID_EMAIL_REQUIRED") return "請輸入有效 Email";
  if (code === "PASSWORD_TOO_SHORT") return "密碼至少需要 10 個字元";
  if (code === "AUTH_USER_CREATE_FAILED") return "此 Email 可能已存在，帳號未建立";
  if (code === "VENDOR_ACCOUNT_NOT_FOUND") return "目前沒有可管理的供應商帳號";
  return "供應商帳號操作失敗，請稍後重試";
}

export function VendorAccountCard({ vendor }: { vendor: Vendor }) {
  const [status, setStatus] = useState<VendorAccountStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await manageVendorAccount({ action: "status", vendor_id: vendor.id }));
    } catch (loadError) {
      setError(accountErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [vendor.id]);

  useEffect(() => {
    let active = true;
    manageVendorAccount({ action: "status", vendor_id: vendor.id })
      .then((nextStatus) => {
        if (active) setStatus(nextStatus);
      })
      .catch((loadError) => {
        if (active) setError(accountErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [vendor.id]);

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await manageVendorAccount({
        action: "create",
        vendor_id: vendor.id,
        email: email.trim(),
        password,
      });
      setPassword("");
      setNotice("供應商登入帳號已建立並綁定");
      await refresh();
    } catch (createError) {
      setError(accountErrorMessage(createError));
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await manageVendorAccount({
        action: "reset_password",
        vendor_id: vendor.id,
        password,
      });
      setPassword("");
      setNotice("供應商密碼已安全重設");
    } catch (resetError) {
      setError(accountErrorMessage(resetError));
    } finally {
      setSubmitting(false);
    }
  };

  const disableAccount = async () => {
    if (!window.confirm(`確定停用 ${vendor.code} · ${vendor.name} 的供應商登入帳號？`)) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await manageVendorAccount({ action: "disable", vendor_id: vendor.id });
      setNotice("供應商帳號已停用");
      await refresh();
    } catch (disableError) {
      setError(accountErrorMessage(disableError));
    } finally {
      setSubmitting(false);
    }
  };

  const copyLoginUrl = async () => {
    try {
      await navigator.clipboard.writeText(VENDOR_LOGIN_URL);
      setNotice("供應商登入網址已複製");
    } catch {
      setError("無法自動複製，請手動複製登入網址");
    }
  };

  return (
    <div className="kc-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black">供應商帳號</div>
          <div className="mt-1 text-[10px] text-zinc-600">Supabase Auth 安全登入</div>
        </div>
        <button
          type="button"
          onClick={() => void copyLoginUrl()}
          className="rounded-lg border border-[#3a4552] px-3 py-2 text-[10px] font-bold text-[#c8ced5]"
        >
          複製登入網址
        </button>
      </div>

      {loading ? (
        <div className="mt-5 text-xs text-zinc-500">正在確認帳號綁定…</div>
      ) : status?.linked ? (
        <div className="mt-5">
          <div className="rounded-xl bg-[#171c22] p-4">
            <div className="text-[9px] text-zinc-600">登入 Email</div>
            <div className="mt-1 break-all text-xs font-bold">{status.email}</div>
            <div className={`mt-3 text-[10px] font-bold ${status.active ? "text-[#74bb96]" : "text-[#e89a9a]"}`}>
              ● {status.active ? "已綁定／啟用中" : "已綁定／已停用"}
            </div>
          </div>
          <form onSubmit={resetPassword} className="mt-4">
            <label className="text-[10px] font-bold text-zinc-500">
              重設密碼
              <input
                className="kc-input mt-2"
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 10 個字元"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={submitting} className="rounded-xl bg-[#e8893a] px-4 py-2.5 text-xs font-black text-[#17120e] disabled:opacity-50">
                重設密碼
              </button>
              {status.active && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void disableAccount()}
                  className="rounded-xl border border-[#d96c6c]/35 bg-[#d96c6c]/10 px-4 py-2.5 text-xs font-black text-[#e89a9a] disabled:opacity-50"
                >
                  停用帳號
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <form onSubmit={createAccount} className="mt-5 space-y-3">
          <label className="text-[10px] font-bold text-zinc-500">
            登入 Email
            <input
              className="kc-input mt-2"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vendor@example.com"
            />
          </label>
          <label className="text-[10px] font-bold text-zinc-500">
            初始密碼
            <input
              className="kc-input mt-2"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 10 個字元"
            />
          </label>
          <button disabled={submitting} className="w-full rounded-xl bg-[#e8893a] px-4 py-3 text-xs font-black text-[#17120e] disabled:opacity-50">
            {submitting ? "建立中…" : "建立登入帳號"}
          </button>
        </form>
      )}

      {notice && <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[10px] font-bold text-emerald-400">{notice}</div>}
      {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[10px] font-bold text-red-400">{error}</div>}
      <div className="mt-4 break-all text-[9px] text-zinc-700">{VENDOR_LOGIN_URL}</div>
    </div>
  );
}
