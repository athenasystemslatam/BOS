"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type Tab = { href: string; label: string };

export function ModuleTabBar({
  tabs,
  accentColor,
}: {
  tabs: Tab[];
  accentColor: string;
}) {
  const pathname = usePathname();

  return (
    <div className="bg-white border-b border-gray-200 px-6 flex gap-0 shrink-0">
      {tabs.map(({ href, label }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "px-4 py-3 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap",
              isActive
                ? `border-current ${accentColor}`
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
