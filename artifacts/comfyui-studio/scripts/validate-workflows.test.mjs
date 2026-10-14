// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanWorkflows, templatesDirectory, validateWorkflow } from "./validate-workflows.mjs";
import { nodeContracts, templateContracts } from "./workflow-contracts.mjs";

const load = (name = "sdxl-image.workflow.json") => JSON.parse(readFileSync(join(templatesDirectory, name), "utf8"));
function rejects(mutate, message, name = "sdxl-image.workflow.json") {
  const graph = load(name);
  mutate(graph);
  expect(validateWorkflow(name, graph).join("\n")).toContain(`${name}:`);
  expect(validateWorkflow(name, graph).join("\n")).toContain(message);
}

describe("offline shipped workflow validation", () => {
  it("scans every asset, including any future JSON files", () => {
    const result = scanWorkflows();
    expect(result.files).toHaveLength(Object.keys(templateContracts).length);
    expect(result.errors).toEqual([]);
  });
  for (const name of Object.keys(templateContracts)) {
    it(`${name} satisfies its advertised capability`, () => expect(validateWorkflow(name, load(name))).toEqual([]));
    it(`${name} rejects removal of every required node input`, () => {
      const original = load(name);
      for (const [id, node] of Object.entries(original)) {
        for (const [input, rule] of Object.entries(nodeContracts[node.class_type].inputs)) {
          if (rule.endsWith("?")) continue;
          const broken = structuredClone(original);
          delete broken[id].inputs[input];
          expect(validateWorkflow(name, broken).join("\n")).toContain(`node "${id}" input ${input}: missing required`);
        }
      }
    });
  }
  it.each([null, [], {}, "workflow", 42])("rejects invalid root %j", (value) => {
    expect(validateWorkflow("sdxl-image.workflow.json", value).join("\n")).toContain("non-empty API-format node object");
  });
  it("rejects missing capability declarations", () => {
    expect(validateWorkflow("new.workflow.json", load()).join("\n")).toContain("no offline capability contract");
  });
  it("rejects malformed nodes and IDs but accepts alphanumeric IDs", () => {
    rejects((g) => { g[""] = g["1"]; }, 'node "": expected');
    rejects((g) => { g["1"] = null; }, 'node "1": expected a node object');
    expect(validateWorkflow("mimicmotion-motion.workflow.json", load("mimicmotion-motion.workflow.json"))).toEqual([]);
  });
  it("rejects missing, misspelled and unknown class names", () => {
    rejects((g) => { delete g["1"].class_type; }, "class_type must be");
    rejects((g) => { g["1"].class_type = "CheckpointLoaderSimpl"; }, "unsupported class_type");
    rejects((g) => { g["1"].class_type = "toString"; }, "unsupported class_type");
  });
  it("rejects malformed inputs and missing required inputs", () => {
    rejects((g) => { g["5"].inputs = []; }, "inputs must be an object");
    rejects((g) => { delete g["5"].inputs.steps; }, "input steps: missing required");
    rejects((g) => { g["5"].inputs.stpes = 20; }, "input stpes: unknown input");
    rejects((g) => { g["5"].inputs.toString = 20; }, "input toString: unknown input");
  });
  it("rejects invalid literal types and ranges without rejecting blank prompts or zero seeds", () => {
    rejects((g) => { g["5"].inputs.steps = "30"; }, "input steps: expected positiveInteger");
    rejects((g) => { g["4"].inputs.width = 0; }, "input width: expected positiveInteger");
    rejects((g) => { g["5"].inputs.denoise = 2; }, "input denoise: expected unit");
    rejects((g) => { g["1"].inputs.ckpt_name = ""; }, "input ckpt_name: expected string");
    expect(validateWorkflow("sdxl-image.workflow.json", load())).toEqual([]);
  });
  it.each([["1"], ["1", -1], ["1", 0.5], [1, 0], ["1", 0, 1], null, "1"])("rejects malformed links %j", (value) => {
    rejects((g) => { g["5"].inputs.model = value; }, "input model: expected MODEL link");
  });
  it("rejects dangling links, invalid output slots and incompatible output types", () => {
    rejects((g) => { g["5"].inputs.model = ["missing", 0]; }, "references missing node missing");
    rejects((g) => { g["5"].inputs.model = ["1", 9]; }, "has no output 9");
    rejects((g) => { g["5"].inputs.model = ["1", 1]; }, "expected MODEL, got CLIP");
  });
  it("rejects self links and longer cycles", () => {
    rejects((g) => { g["5"].inputs.latent_image = ["5", 0]; }, "cyclic input reference");
    rejects((g) => {
      g["8"] = { class_type: "SetLatentNoiseMask", inputs: { samples: ["5", 0], mask: ["9", 1] } };
      g["9"] = { class_type: "LoadImage", inputs: { image: "image.png" } };
      g["5"].inputs.latent_image = ["8", 0];
    }, "cyclic input reference");
  });
  it("rejects disconnected capability nodes and missing output nodes", () => {
    rejects((g) => { delete g["7"]; }, "requires output node SaveImage");
    rejects((g) => { g["6"].inputs.samples = ["4", 0]; }, "requires KSampler connected to SaveImage");
  });
  it("rejects model-family drift", () => {
    rejects((g) => { g["1"].inputs.ckpt_name = "sd15.safetensors"; }, 'input ckpt_name: SDXL text-to-image requires "sd_xl_base_1.0.safetensors"');
  });
  const capabilityMutations = [
    ["animatediff-text-to-video.workflow.json", (g) => { g["6"].inputs.model = ["1", 0]; }, "input model: AnimateDiff text-to-video requires"],
    ["svd-image-to-video.workflow.json", (g) => { g["5"].inputs.model = ["1", 0]; }, "input model: SVD image-to-video requires"],
    ["latentsync-lipsync.workflow.json", (g) => { delete g["5"].inputs.audio; }, "input audio: audio-driven lip sync requires"],
    ["talking-avatar.workflow.json", (g) => { g["4"].inputs.images = ["1", 0]; }, "input images: portrait talking avatar requires"],
    ["mimicmotion-motion.workflow.json", (g) => { g["5"].inputs.pose_images = ["2", 0]; }, "input pose_images: MimicMotion pose transfer requires"],
    ["film-grain-color-grade.workflow.json", (g) => { g["6"].inputs.images = ["1", 0]; }, "input images: video color grade and film grain requires"],
    ["slow-motion-upscale.workflow.json", (g) => { g["4"].inputs.image = ["1", 0]; }, "input image: video interpolation and upscale requires"],
    ["instagram-reel-loop.workflow.json", (g) => { g["4"].inputs.closed_loop = false; }, "input closed_loop: AnimateDiff looping reel requires true"],
    ["product-background-swap.workflow.json", (g) => { g["9"].inputs.latent_image = ["7", 0]; }, "input latent_image: masked product background replacement requires"],
  ];
  it.each(capabilityMutations)("catches capability wiring regression in %s", (name, mutate, message) => rejects(mutate, message, name));
  it("rejects incompatible video format and unsaved output", () => {
    rejects((g) => { g["8"].inputs.format = "image/gif"; }, "input format: video capability requires", "animatediff-text-to-video.workflow.json");
    rejects((g) => { g["7"].inputs.save_output = false; }, "input save_output: advertised output must be saved");
  });
  it("reports malformed JSON, missing assets and unregistered nested files by filename", () => {
    const dir = mkdtempSync(join(tmpdir(), "workflow-validation-"));
    try {
      mkdirSync(join(dir, "nested"));
      writeFileSync(join(dir, "broken.json"), "{");
      writeFileSync(join(dir, "nested", "new.json"), JSON.stringify(load()));
      const { errors, files } = scanWorkflows(dir);
      expect(files).toHaveLength(2);
      expect(errors.join("\n")).toContain("broken.json: invalid JSON");
      expect(errors.join("\n")).toContain("new.json: capability: no offline capability contract");
      expect(errors.join("\n")).toContain("sdxl-image.workflow.json: missing shipped workflow asset");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
