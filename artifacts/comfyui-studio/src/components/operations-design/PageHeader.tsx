import React from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  visual?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, visual, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 space-y-6 animate-in slide-in-from-bottom-4 duration-500 fade-in">
      {visual && (
        <div className="w-full overflow-hidden rounded-3xl border border-[#2d2650] bg-[#171120] aspect-[21/9] sm:aspect-[21/7] relative">
          {visual}
          <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none" />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
            {title}
          </h1>
          <p className="text-[#BEB2CC] text-base leading-relaxed">
            {description}
          </p>
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
