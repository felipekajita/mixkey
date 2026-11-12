"use client";
import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";

export const cn = clsx;

export function Button({ variant = "default", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variant === "default" && "bg-panel2 hover:bg-line/70 border border-line",
        variant === "primary" && "grad-bg text-white shadow-lg hover:brightness-110",
        variant === "ghost" && "hover:bg-panel2 text-muted hover:text-fg",
        variant === "danger" && "text-red-400 hover:bg-red-500/10",
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-line bg-panel", className)}>{children}</div>;
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-xl bg-panel2 p-1 border border-line", className)}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)}
          className={cn("px-3 sm:px-4 h-8 rounded-lg text-sm font-medium transition flex items-center gap-1.5", value === it.id ? "bg-panel text-fg shadow" : "text-muted hover:text-fg")}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className={cn("w-full max-h-[90vh] overflow-auto scroll-thin rounded-t-2xl sm:rounded-2xl border border-line bg-panel p-5", wide ? "sm:max-w-3xl" : "sm:max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Fechar"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-sm text-left">
      <span className={cn("relative w-10 h-6 rounded-full transition shrink-0", checked ? "grad-bg" : "bg-line")}>
        <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", checked ? "left-5" : "left-1")} />
      </span>
      {label}
    </button>
  );
}

export const fieldCls = "h-10 rounded-xl bg-panel2 border border-line px-3 text-sm outline-none focus:border-accent";
export const inputCls = "w-full h-10 rounded-xl bg-panel2 border border-line px-3 text-sm outline-none focus:border-accent";

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] rounded-xl bg-fg text-bg px-4 py-2 text-sm shadow-xl">{msg}</div>;
}
