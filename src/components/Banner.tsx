import type { ReactNode } from "react";

export function Banner({ tone, children }: { tone: "amber" | "red" | "green"; children: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "red" ? "alert" : "status"}>
      {children}
    </div>
  );
}
