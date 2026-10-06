import type { ReactNode } from "react";

export const checklistSectionClass = "bg-[#eef4fc] text-[#20355b] dark:bg-blue-950/30 dark:text-blue-100";
export const checklistSectionButtonClass = `${checklistSectionClass} text-left hover:bg-blue-100 dark:hover:bg-blue-950/50`;

export function ChecklistSectionNumber({ number }: { number: number }) {
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#548dd4] text-xs font-bold text-white">{String(number).padStart(2, "0")}</span>;
}

export function ChecklistHeading({ number, children }: { number: number; children: ReactNode }) {
  return <h2 className={`flex items-center gap-3 rounded-md px-3 py-2 mb-3 text-sm font-semibold ${checklistSectionClass}`}><ChecklistSectionNumber number={number} />{children}</h2>;
}

export function checklistAnswerClass(answer: string, neutral = false) {
  if (neutral) return "bg-[#eef4fc] text-[#20355b] border-[#548dd4] dark:bg-blue-950/40 dark:text-blue-100";
  if (answer === "yes") return "bg-[#e8f4ed] text-[#187347] border-green-300 dark:bg-green-950/40 dark:text-green-300";
  if (answer === "no") return "bg-[#fdecec] text-[#b63737] border-red-300 dark:bg-red-950/40 dark:text-red-300";
  return "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300";
}

export function ChecklistResult({ answer }: { answer?: string }) {
  const label = answer === "yes" ? "YES" : answer === "no" ? "NO" : answer === "n/a" || answer === "na" ? "N/A" : "OPEN";
  return <span className={`inline-flex min-w-14 items-center justify-center rounded-full border px-3 py-1 text-xs font-bold ${checklistAnswerClass(answer || "")}`}>{label}</span>;
}
