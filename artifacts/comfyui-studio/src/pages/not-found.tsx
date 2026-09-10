import { Link } from "wouter";
import { Cpu, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in fade-in duration-500">
      <div className="w-full max-w-md p-8 border border-[#2d2650] bg-[#171120] rounded-3xl relative overflow-hidden group shadow-2xl shadow-[#A779F5]/5">
        <div className="absolute -top-12 -right-12 p-8 opacity-10 rotate-12 transition-transform duration-700 group-hover:rotate-45 group-hover:scale-110">
          <Cpu className="w-64 h-64 text-[#A779F5]" />
        </div>
        <div className="relative z-10">
          <h1 className="text-8xl font-black text-[#A779F5] mb-2 tracking-tighter">404</h1>
          <h2 className="text-2xl font-bold text-white mb-4">Pipeline Broken</h2>
          <p className="text-base text-[#BEB2CC] mb-8 leading-relaxed max-w-xs">
            The node you're looking for doesn't exist in the current workflow graph. It may have been bypassed or deleted.
          </p>
          <Link href="/">
            <button className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#B7F54A] text-[#09080D] font-bold hover:bg-[#a4de3a] transition-all hover:-translate-y-0.5 shadow-lg shadow-[#B7F54A]/20">
              <Home className="w-4 h-4" />
              Return to Workspace
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
