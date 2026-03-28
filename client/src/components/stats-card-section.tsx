import type { LucideIcon } from "lucide-react";
import { StatInfoPopover } from "@/components/stat-info-popover";

export type StatsCardItem = {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  toneClassName: string;
  /** Optional short explanation for this stat (info icon next to the label). */
  info?: string;
};

interface StatsCardSectionProps {
  title: string;
  /** Optional explanation for the whole section (info icon next to the title). */
  titleInfo?: string;
  items: StatsCardItem[];
  helperText?: string;
  className?: string;
}

export function StatsCardSection({ title, titleInfo, items, helperText, className }: StatsCardSectionProps) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] ${className ?? ""}`.trim()}
    >
      <div className="mb-4 flex items-center justify-center gap-1.5">
        <h3 className="font-semibold text-center">{title}</h3>
        {titleInfo ? (
          <StatInfoPopover label={title} content={titleInfo} side="bottom" className="text-gray-400 hover:text-gray-200" />
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(({ label, value, Icon, toneClassName, info }) => (
          <div key={label} className={`rounded-lg border-2 p-3 ${toneClassName}`}>
            <div className="flex items-center justify-center gap-1 text-sm font-semibold mb-1.5">
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {info ? (
                <StatInfoPopover
                  label={label}
                  content={info}
                  size="compact"
                  side="top"
                  align="center"
                  className="text-current opacity-70 hover:opacity-100"
                />
              ) : null}
            </div>
            <div className="text-xl font-bold text-center">{value}</div>
          </div>
        ))}
      </div>
      {helperText ? <p className="text-xs text-gray-400 mt-3 text-center">{helperText}</p> : null}
    </div>
  );
}
