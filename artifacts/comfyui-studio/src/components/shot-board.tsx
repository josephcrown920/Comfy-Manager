import { useRef, useState } from "react";
import { ImagePlus, Layers3, Loader2, Search, UploadCloud } from "lucide-react";

export type ShotBoardSlot = {
  key: string;
  label: string;
  eyebrow: string;
  value: string;
  preview?: string;
  previewAlt?: string;
};

interface ShotBoardProps {
  presetLabel: string;
  slots: ShotBoardSlot[];
  uploadPending?: boolean;
  canRender?: boolean;
  onRender?: () => void;
  onFilesSelected: (files: File[]) => void;
}

const PALETTE_NODES = ["Character", "Product", "Text", "Image"];
const INPUT_TOPS = [10, 28, 46, 64, 82];
const OUTPUT_TOPS = [10, 28, 46, 64, 82];

export function ShotBoard({
  presetLabel,
  slots,
  uploadPending = false,
  canRender = false,
  onRender,
  onFilesSelected,
}: ShotBoardProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const attachedCount = slots.filter((slot) => Boolean(slot.value)).length;
  const visiblePaletteNodes = PALETTE_NODES.filter((node) => node.toLowerCase().includes(paletteQuery.toLowerCase()));

  const acceptFiles = (files: File[]) => {
    setIsDragActive(false);
    if (files.length > 0) onFilesSelected(files);
  };

  return (
    <div
      data-testid="shot-board"
      className="mb-8 overflow-hidden rounded-3xl border border-[#A779F5]/30 bg-[#101312] shadow-[0_0_35px_rgba(183,245,74,.08)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#A779F5]/20 bg-[#171A18] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Layers3 className="h-4 w-4 shrink-0 text-[#B7F54A]" aria-hidden="true" />
          <p className="truncate font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#BEB2CC]">
            Shot Board <span className="text-[#B7F54A]">/</span> {presetLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-testid="shot-board-count"
            className="rounded-full border border-[#B7F54A]/30 bg-[#B7F54A]/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#B7F54A]"
          >
            {attachedCount} / {slots.length} attached
          </span>
          {onRender && (
            <button
              type="button"
              data-testid="button-render-shot-board"
              onClick={onRender}
              disabled={!canRender || uploadPending}
              className="rounded-lg bg-[#B7F54A] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#09080D] transition-colors hover:bg-[#A3E030] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7F54A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploadPending ? "Attaching…" : "Render once"}
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[190px_1fr]">
        <aside className="border-b border-[#A779F5]/20 bg-[#151816] p-3 lg:border-b-0 lg:border-r" aria-label="Shot Board node library">
          <p className="mb-3 px-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#BEB2CC]">Nodes</p>
          <label className="relative block">
            <span className="sr-only">Search node types</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#BEB2CC]/60" aria-hidden="true" />
            <input
              value={paletteQuery}
              onChange={(event) => setPaletteQuery(event.target.value)}
              placeholder="Search nodes…"
              className="h-9 w-full rounded-lg border border-[#A779F5]/30 bg-[#0C0F0D] pl-9 pr-3 text-xs text-white outline-none placeholder:text-[#BEB2CC]/50 focus:border-[#B7F54A]"
            />
          </label>
          <p className="mb-2 mt-5 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#BEB2CC]/60">Input</p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {visiblePaletteNodes.map((node) => (
              <button
                key={node}
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex min-h-10 items-center gap-2 rounded-lg border border-[#A779F5]/25 bg-[#1B1F1C] px-3 text-left text-xs font-semibold text-[#E5E1EB] transition-colors hover:border-[#B7F54A]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7F54A]"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded border border-[#A779F5]/40 text-[#B7F54A]">
                  <ImagePlus className="h-3 w-3" aria-hidden="true" />
                </span>
                {node}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-5 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#BEB2CC]/60">Processing</p>
          <div className="rounded-lg border border-[#B7F54A]/30 bg-[#B7F54A]/10 px-3 py-3 text-xs font-semibold text-[#B7F54A]">
            Five-angle render
          </div>
        </aside>

        <div
          className={`relative min-h-[560px] overflow-hidden transition-colors sm:min-h-[600px] ${
            isDragActive ? "bg-[#B7F54A]/10" : "bg-[#0D100E]"
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setIsDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            acceptFiles(Array.from(event.dataTransfer.files));
          }}
          role="region"
          aria-label="Connected Shot Board canvas. Drop reference images anywhere on this canvas."
        >
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            aria-label="Attach multiple shot board reference images"
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />

          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#A779F5_0.7px,transparent_0.7px)] [background-size:18px_18px]" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-[#A779F5]/15 bg-[#111411]/90 px-4 py-2 backdrop-blur sm:px-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#BEB2CC]">
              {isDragActive ? "Release to attach references" : "Drag references onto the graph"}
            </p>
            <p className="font-mono text-[10px] text-[#BEB2CC]/60">Zoom 20% · 5 nodes · 4 edges</p>
          </div>

          <svg className="pointer-events-none absolute inset-0 top-10 h-[calc(100%-40px)] w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {INPUT_TOPS.map((top) => (
              <path key={`input-${top}`} d={`M 24 ${top} C 31 ${top}, 34 50, 41 50`} fill="none" stroke="#A779F5" strokeOpacity="0.5" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
            ))}
            {OUTPUT_TOPS.map((top) => (
              <path key={`output-${top}`} d={`M 62 50 C 69 50, 70 ${top}, 76 ${top}`} fill="none" stroke="#B7F54A" strokeOpacity="0.55" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>

          <div className="absolute inset-x-0 bottom-0 top-10">
            {slots.map((slot, index) => (
              <div
                key={slot.key}
                className="absolute left-[2%] flex w-[26%] min-w-0 -translate-y-1/2 items-center gap-1.5 rounded-lg border border-[#A779F5]/35 bg-[#1B201C] p-1.5 shadow-xl sm:gap-2 sm:p-2"
                style={{ top: `${INPUT_TOPS[index] ?? 50}%` }}
              >
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-[#BEB2CC]/20 bg-[#0B0E0C] sm:h-10 sm:w-10">
                  {slot.preview ? <img src={slot.preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="m-2 h-4 w-4 text-[#BEB2CC]/50" aria-hidden="true" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-[8px] font-bold uppercase tracking-wider text-[#BEB2CC] sm:text-[9px]">{slot.eyebrow} · {slot.label}</p>
                  <p className={`truncate text-[9px] font-semibold sm:text-[10px] ${slot.value ? "text-[#B7F54A]" : "text-[#BEB2CC]/60"}`}>
                    {slot.value ? "Attached" : "Drop asset"}
                  </p>
                </div>
              </div>
            ))}

            <div className="absolute left-[40%] top-1/2 w-[24%] -translate-y-1/2 rounded-xl border border-[#B7F54A]/50 bg-[#20261F] p-2 shadow-[0_0_24px_rgba(183,245,74,.12)] sm:p-3">
              <div className="mb-2 flex items-center justify-between gap-1">
                <span className="rounded bg-[#B7F54A] px-1.5 py-1 font-mono text-[8px] font-bold text-[#09080D]">PROCESS</span>
                <span className="h-2 w-2 rounded-full bg-[#B7F54A] shadow-[0_0_8px_#B7F54A]" />
              </div>
              <div className="mb-2 grid grid-cols-3 gap-1">
                <div className="h-8 rounded border border-[#BEB2CC]/20 bg-[#101411]" />
                <div className="h-8 rounded border border-[#BEB2CC]/20 bg-[#101411]" />
                <div className="h-8 rounded border border-[#BEB2CC]/20 bg-[#101411]" />
              </div>
              <p className="truncate text-[9px] font-bold text-white sm:text-[10px]">Shot Board</p>
              <p className="mt-1 truncate text-[8px] text-[#BEB2CC]">Keep anchors consistent</p>
            </div>

            {OUTPUT_TOPS.map((top, index) => (
              <div
                key={`output-card-${top}`}
                className="absolute left-[75%] flex w-[23%] min-w-0 -translate-y-1/2 items-center gap-1.5 rounded-lg border border-[#B7F54A]/35 bg-[#1B201C] p-1.5 shadow-xl sm:gap-2 sm:p-2"
                style={{ top: `${top}%` }}
              >
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-[#B7F54A]/25 bg-[#0B0E0C] sm:h-10 sm:w-10">
                  {slots[index % slots.length]?.preview ? <img src={slots[index % slots.length]?.preview} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-[8px] font-bold uppercase tracking-wider text-[#B7F54A] sm:text-[9px]">ANGLE 0{index + 1}</p>
                  <p className="truncate text-[9px] font-semibold text-white sm:text-[10px]">{["Wide", "Low", "Close", "Over", "Dutch"][index]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[#A779F5]/20 bg-[#151816] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-sm font-bold text-white">Attach all references in one pass</p>
          <p className="mt-1 text-xs text-[#BEB2CC]">Files fill empty roles in board order. Individual cards below remain available for precise replacement.</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadPending}
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#B7F54A]/50 bg-[#B7F54A]/10 px-4 py-2 text-sm font-bold text-[#B7F54A] transition-colors hover:bg-[#B7F54A]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7F54A] disabled:cursor-wait disabled:opacity-60"
        >
          {uploadPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="h-4 w-4" aria-hidden="true" />}
          {uploadPending ? "Attaching references…" : "Attach images"}
        </button>
      </div>
    </div>
  );
}