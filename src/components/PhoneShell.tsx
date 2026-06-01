import type { ReactNode } from "react";

type PhoneShellProps = {
  children: ReactNode;
};

export function PhoneShell({ children }: PhoneShellProps) {
  return (
    <section
      data-testid="phone-shell"
      className="relative h-[min(740px,calc(100vh-132px))] min-h-[540px] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-[36px] border-[8px] border-slate-950/95 bg-slate-950/90 shadow-phone"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[27px] border border-white/50 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-2xl">
        {children}
      </div>
    </section>
  );
}
