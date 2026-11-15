"use client";

import { useState, useTransition } from "react";
import { inviteMemberAction } from "./actions";

export function InviteMemberForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await inviteMemberAction(formData);
          if (result.ok) {
            setMsg({ kind: "ok", text: result.message });
            setEmail("");
          } else {
            setMsg({ kind: "error", text: result.error });
          }
        });
      }}
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor="invite-email" className="mb-1.5 block text-xs text-fg-secondary">
          이메일
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="colleague@company.com"
          className="h-11 w-full border border-line-strong bg-canvas px-3 text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none"
        />
      </div>
      <div className="w-full sm:w-40">
        <label htmlFor="invite-role" className="mb-1.5 block text-xs text-fg-secondary">
          역할
        </label>
        <select
          id="invite-role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-11 w-full border border-line-strong bg-canvas px-3 text-sm text-fg focus:border-primary focus:outline-none select-field"
        >
          <option value="ADMIN">관리자</option>
          <option value="MEMBER">구성원</option>
          <option value="VIEWER">뷰어</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending || !email}
        className="h-11 box-border inline-flex items-center justify-center border border-primary bg-primary px-6 text-sm font-semibold text-primary-fg hover:bg-primary-hover hover:border-primary-hover transition-colors duration-swift ease-swift disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "초대 중…" : "초대"}
      </button>
      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={`w-full text-xs ${msg.kind === "ok" ? "text-primary-text" : "text-danger"} sm:w-auto`}
        >
          {msg.text}
        </p>
      )}
    </form>
  );
}
