import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileUpload } from "./file-upload";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

class FakeXMLHttpRequest {
  upload = { addEventListener: vi.fn() };
  status = 200;
  responseText = JSON.stringify({ name: "stored-file" });
  listeners = new Map<string, () => void>();
  open = vi.fn();
  send = vi.fn((_body: FormData) => {
    this.status = nextUploadResponse.status;
    this.responseText = JSON.stringify(nextUploadResponse.body);
    this.listeners.get("load")?.();
  });
  addEventListener = vi.fn((event: string, listener: () => void) => {
    this.listeners.set(event, listener);
  });
}

const xhrConstructor = vi.fn(function () { return new FakeXMLHttpRequest(); });
const MB = 1024 * 1024;
let nextUploadResponse: { status: number; body: unknown } = {
  status: 200,
  body: { name: "stored-file" },
};
const media = [
  { type: "image/png", name: "reference.png", limit: 20 * MB, label: "Images", accept: "image/*" },
  { type: "audio/mpeg", name: "voice.mp3", limit: 100 * MB, label: "Audio files", accept: "audio/*" },
  { type: "video/mp4", name: "motion.mp4", limit: 100 * MB, label: "Videos", accept: "video/*" },
] as const;

function selectFile(container: HTMLElement, type: string, name: string, size: number) {
  // Synthetic size avoids allocating hundreds of MB in jsdom. The API suite
  // separately exercises actual multipart bytes.
  const file = new File(["media"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  // jsdom's synthetic change does not set the file input's value. Seed it
  // explicitly so the rejection test proves that the selection is cleared.
  Object.defineProperty(input, "value", {
    configurable: true, writable: true, value: `C:\\fakepath\\${name}`,
  });
  fireEvent.change(input, { target: { files: [file] } });
  return { input, file };
}

beforeEach(() => {
  vi.clearAllMocks();
  nextUploadResponse = { status: 200, body: { name: "stored-file" } };
  vi.stubGlobal("XMLHttpRequest", xhrConstructor);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("upload limit guidance", () => {
  it.each([
    [undefined, "Maximum size: images 20 MB, audio 100 MB, video 100 MB."],
    ["image/*", "Maximum size: images 20 MB."],
    ["audio/*", "Maximum size: audio 100 MB."],
    ["video/*", "Maximum size: video 100 MB."],
    [".PNG,.JPEG", "Maximum size: images 20 MB."],
    [".mp3,.wav", "Maximum size: audio 100 MB."],
    [".mp4,.mov", "Maximum size: video 100 MB."],
    ["image/*,audio/*,video/*", "Maximum size: images 20 MB, audio 100 MB, video 100 MB."],
    [".json", "Maximum file size: 20 MB."],
  ])("shows accurate guidance for %s", (accept, guidance) => {
    render(<FileUpload accept={accept} description="Choose a reference." onFileSelect={vi.fn()} />);
    expect(screen.getByText(`Choose a reference. ${guidance}`)).toBeVisible();
  });
});

describe.each(media)("$type selection boundary", (file) => {
  it("uploads exactly at the limit", async () => {
    const onFileSelect = vi.fn();
    const { container } = render(<FileUpload accept={file.accept} onFileSelect={onFileSelect} />);
    const selected = selectFile(container, file.type, file.name, file.limit);
    await waitFor(() => expect(onFileSelect).toHaveBeenCalledExactlyOnceWith("stored-file"));
    expect(xhrConstructor).toHaveBeenCalledOnce();
    const xhr = xhrConstructor.mock.results[0].value as FakeXMLHttpRequest;
    expect(xhr.open).toHaveBeenCalledWith("POST", `/api/files/upload?accept=${encodeURIComponent(file.accept)}`);
    expect(xhr.send.mock.calls[0][0].get("file")).toEqual(selected.file);
    expect(screen.getByText("Uploaded: stored-file")).toBeVisible();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "File uploaded", description: "Stored as: stored-file" });
  });

  it("immediately rejects one byte over without starting a request or preview", () => {
    const onFileSelect = vi.fn();
    const createObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    const { container } = render(<FileUpload
      accept={file.accept} onFileSelect={onFileSelect} preview previouslyUploadedName="existing-file"
    />);
    const { input } = selectFile(container, file.type, file.name, file.limit + 1);
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: "File too large",
      description: `${file.label} must be ${file.limit / MB} MB or smaller.`,
      variant: "destructive",
    });
    expect(xhrConstructor).not.toHaveBeenCalled();
    expect(onFileSelect).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(input.value).toBe("");
    expect(screen.getByText("Previously uploaded: existing-file")).toBeVisible();
    expect(screen.queryByText(/Uploading/)).not.toBeInTheDocument();
  });
});

describe("image format and retry behavior", () => {
  it("advertises phone image formats and confirms the selected image after upload", async () => {
    const onFileSelect = vi.fn();
    const { container } = render(<FileUpload accept="image/*" onFileSelect={onFileSelect} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["heic bytes"], "outfit-photo.HEIC", { type: "image/heic" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onFileSelect).toHaveBeenCalledExactlyOnceWith("stored-file"));
    expect(input.accept).toContain("image/heic");
    expect(input.accept).toContain(".heif");
    expect(screen.getByRole("status")).toHaveTextContent("Selected: outfit-photo.HEIC");
  });

  it("shows an actionable error, clears the input, and retries the same file without calling the callback", async () => {
    nextUploadResponse = {
      status: 415,
      body: { error: "This HEIC/HEIF photo could not be decoded. Export it as JPEG or PNG and retry." },
    };
    const onFileSelect = vi.fn();
    const { container } = render(<FileUpload accept="image/*" onFileSelect={onFileSelect} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["corrupt"], "outfit-photo.heic", { type: "image/heic" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not be decoded/i));
    expect(onFileSelect).not.toHaveBeenCalled();
    expect(input.value).toBe("");
    expect(screen.queryByText(/Uploaded:/)).not.toBeInTheDocument();

    nextUploadResponse = { status: 200, body: { name: "retried-outfit.jpg" } };
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onFileSelect).toHaveBeenCalledExactlyOnceWith("retried-outfit.jpg"));
    expect(screen.getByText("Uploaded: retried-outfit.jpg")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
