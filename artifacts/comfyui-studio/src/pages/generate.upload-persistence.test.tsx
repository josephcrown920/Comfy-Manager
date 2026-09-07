import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkflowTemplate } from "@workspace/api-client-react";

const mockCreateJobMutate = vi.fn();

/**
 * uploadFile() in file-upload.tsx talks to the API server via raw
 * XMLHttpRequest. Stub that out so the upload "completes" instantly with a
 * configurable ComfyUI-assigned filename, without hitting the network.
 */
let nextUploadResponse: { status: number; body: unknown } = {
  status: 200,
  body: { name: "comfy-resolved-name.png" },
};

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];
  upload = { addEventListener: vi.fn() };
  status = 0;
  responseText = "";
  private listeners: Record<string, Array<() => void>> = {};

  addEventListener(event: string, handler: () => void) {
    (this.listeners[event] ??= []).push(handler);
  }

  open(_method: string, _url: string) {}

  send() {
    const { status, body } = nextUploadResponse;
    this.status = status;
    this.responseText = JSON.stringify(body);
    queueMicrotask(() => {
      (this.listeners["load"] ?? []).forEach((handler) => handler());
    });
  }
}

vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest as unknown as typeof XMLHttpRequest);

vi.mock("@workspace/api-client-react", () => ({
  useGetWorkflow: vi.fn(),
  useCreateJob: () => ({ mutate: mockCreateJobMutate, isPending: false }),
  getGetWorkflowQueryKey: (id: string) => ["workflow", id],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Imported after the mocks above so the mocked modules are in place.
const { useGetWorkflow } = await import("@workspace/api-client-react");
const { WorkflowForm, getUploadStorageKey } = await import("./generate");

const WORKFLOW_ID = "svd-image-to-video";
const PARAM_KEY = "input_image";

const FILE_WORKFLOW: WorkflowTemplate = {
  id: WORKFLOW_ID,
  name: "Image to Video",
  description: "Turn an image into a short video.",
  category: "video-generation",
  params: [
    {
      key: PARAM_KEY,
      label: "Source Image",
      type: "file",
      required: true,
      accept: "image/*",
    },
  ],
};

function mockWorkflow(workflow: WorkflowTemplate | undefined, isLoading = false) {
  (useGetWorkflow as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    data: workflow,
    isLoading,
  });
}

describe("uploaded-file persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockCreateJobMutate.mockReset();
    nextUploadResponse = { status: 200, body: { name: "comfy-resolved-name.png" } };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stores the resolved ComfyUI filename under the workflow-and-parameter storage key after a successful upload", async () => {
    mockWorkflow(FILE_WORKFLOW);

    render(<WorkflowForm workflowId={WORKFLOW_ID} onBack={() => {}} />);

    const user = userEvent.setup();
    const file = new File(["hello"], "my-photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(
        sessionStorage.getItem(getUploadStorageKey(WORKFLOW_ID, PARAM_KEY)),
      ).toBe("comfy-resolved-name.png");
    });

    await screen.findByText(/Uploaded: comfy-resolved-name\.png/);
  });

  it("restores formData and displays 'Previously uploaded: <name>' when mounted with a stored filename", async () => {
    sessionStorage.setItem(
      getUploadStorageKey(WORKFLOW_ID, PARAM_KEY),
      "previously-uploaded.png",
    );
    mockWorkflow(FILE_WORKFLOW);

    render(<WorkflowForm workflowId={WORKFLOW_ID} onBack={() => {}} />);

    await screen.findByText("Previously uploaded: previously-uploaded.png");

    // The restored filename must actually live in formData, not just be
    // displayed -- submitting the form should send it to the job creation
    // request under the file parameter's key.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(mockCreateJobMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId: WORKFLOW_ID,
            params: expect.objectContaining({
              [PARAM_KEY]: "previously-uploaded.png",
            }),
          }),
        }),
        expect.anything(),
      );
    });
  });

  it("derives the storage key from both the workflow id and the parameter key, not just one", () => {
    const keyA = getUploadStorageKey("workflow-a", "input_image");
    const keyB = getUploadStorageKey("workflow-b", "input_image");
    const keyC = getUploadStorageKey("workflow-a", "input_video");

    // Different workflows (or different params within the same workflow)
    // must never collide on the same sessionStorage key.
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyB).not.toBe(keyC);

    // The key must be stable and reproducible for the same inputs, since
    // the write (handleFileSelect) and read (rehydration effect) sites
    // compute it independently.
    expect(getUploadStorageKey("workflow-a", "input_image")).toBe(keyA);

    // Values that could be confused by naive string concatenation across
    // the workflow/param boundary must still resolve to distinct keys.
    expect(getUploadStorageKey("wf:1", "param")).not.toBe(
      getUploadStorageKey("wf", "1:param"),
    );
  });

  it("shows a fresh upload label after replacing a restored file", async () => {
    sessionStorage.setItem(
      getUploadStorageKey(WORKFLOW_ID, PARAM_KEY),
      "previously-uploaded.png",
    );
    mockWorkflow(FILE_WORKFLOW);
    nextUploadResponse = { status: 200, body: { name: "brand-new-name.png" } };

    render(<WorkflowForm workflowId={WORKFLOW_ID} onBack={() => {}} />);

    await screen.findByText("Previously uploaded: previously-uploaded.png");

    const user = userEvent.setup();
    const file = new File(["hello"], "new-photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await screen.findByText(/Uploaded: brand-new-name\.png/);
    expect(screen.queryByText(/Previously uploaded:/)).not.toBeInTheDocument();

    expect(
      sessionStorage.getItem(getUploadStorageKey(WORKFLOW_ID, PARAM_KEY)),
    ).toBe("brand-new-name.png");
  });
});
