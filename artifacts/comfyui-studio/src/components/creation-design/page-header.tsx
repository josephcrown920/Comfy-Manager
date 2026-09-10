import { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description: ReactNode;
  eyebrow?: string;
  visual?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, visual, className = "" }: PageHeaderProps) {
  return (
    <div className={`mb-12 space-y-6 ${className}`}>
      {visual && (
        <div className="mb-8 w-full overflow-hidden rounded-3xl border border-[#A779F5]/20 bg-[#171120] shadow-2xl">
          {visual}
        </div>
      )}
      <div className="max-w-3xl">
        {eyebrow && <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#B7F54A]">{eyebrow}</p>}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1] mb-4">
          {title}
        </h1>
        <p className="text-lg text-[#BEB2CC] leading-relaxed max-w-2xl">
          {description}
        </p>
      </div>
    </div>
  );
}
