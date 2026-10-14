import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeContracts, templateContracts } from "./workflow-contracts.mjs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const link = (value) => Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && Number.isSafeInteger(value[1]) && value[1] >= 0;
const literals = {
  text: (v) => typeof v === "string",
  string: (v) => typeof v === "string" && v.trim().length > 0,
  boolean: (v) => typeof v === "boolean",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  positive: (v) => literals.number(v) && v > 0,
  nonnegative: (v) => literals.number(v) && v >= 0,
  unit: (v) => literals.nonnegative(v) && v <= 1,
  positiveInteger: (v) => Number.isSafeInteger(v) && v > 0,
  nonnegativeInteger: (v) => Number.isSafeInteger(v) && v >= 0,
};

export function validateWorkflow(filename, workflow) {
  const errors = [];
  const fail = (location, message) => errors.push(`${filename}: ${location}: ${message}`);
  const contract = own(templateContracts, basename(filename)) ? templateContracts[basename(filename)] : undefined;
  if (!contract) fail("capability", "no offline capability contract; add this template to workflow-contracts.mjs");
  if (!object(workflow) || Object.keys(workflow).length === 0) {
    fail("workflow", "expected a non-empty API-format node object");
    return errors;
  }
  const entries = Object.entries(workflow);
  const dependencies = new Map();
  for (const [id, node] of entries) {
    const where = `node ${JSON.stringify(id)}`;
    if (!/^[A-Za-z0-9_-]+$/.test(id)) fail(where, "expected a non-empty alphanumeric node ID (letters, numbers, _ or -)");
    if (!object(node)) { fail(where, "expected a node object"); continue; }
    if (typeof node.class_type !== "string" || !node.class_type.trim()) {
      fail(where, "class_type must be a non-empty string");
    }
    const schema = own(nodeContracts, node.class_type) ? nodeContracts[node.class_type] : undefined;
    if (!schema) fail(where, `unsupported class_type ${JSON.stringify(node.class_type)}; add a reviewed node contract`);
    if (!object(node.inputs)) { fail(where, "inputs must be an object"); continue; }
    const refs = [];
    dependencies.set(id, refs);
    for (const [name, rule] of Object.entries(schema?.inputs ?? {})) {
      if (!rule.endsWith("?") && !own(node.inputs, name)) fail(`${where} input ${name}`, `missing required ${rule} input`);
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      const location = `${where} (${node.class_type}) input ${name}`;
      const rule = schema && own(schema.inputs, name) ? schema.inputs[name].replace(/\?$/, "") : undefined;
      if (schema && !own(schema.inputs, name)) fail(location, "unknown input; check spelling or update the reviewed node contract");
      if (rule && own(literals, rule)) {
        if (!literals[rule](value)) fail(location, `expected ${rule} literal`);
        continue;
      }
      if (!link(value)) {
        fail(location, `expected ${rule ?? "typed"} link [source node ID string, nonnegative output index]`);
        continue;
      }
      const [sourceId, slot] = value;
      refs.push(sourceId);
      if (!own(workflow, sourceId)) { fail(location, `references missing node ${sourceId}`); continue; }
      const source = workflow[sourceId];
      const outputs = object(source) && own(nodeContracts, source.class_type) ? nodeContracts[source.class_type].outputs : undefined;
      if (outputs && slot >= outputs.length) fail(location, `node ${sourceId} (${source.class_type}) has no output ${slot}`);
      else if (outputs && rule && outputs[slot] !== rule) fail(location, `expected ${rule}, got ${outputs[slot]} from node ${sourceId} output ${slot}`);
    }
  }
  const visited = new Set();
  const active = new Set();
  function walk(id) {
    if (active.has(id)) { fail(`node ${id}`, "cyclic input reference; workflow must be acyclic"); return; }
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of dependencies.get(id) ?? []) walk(dependency);
    active.delete(id);
    visited.add(id);
  }
  for (const [id] of entries) walk(id);
  if (!contract) return errors;
  const byClass = (type) => entries.filter(([, n]) => object(n) && n.class_type === type);
  const outputs = byClass(contract.output);
  if (!outputs.length) fail("capability", `${contract.capability} requires output node ${contract.output}`);
  const reachable = new Set();
  function collect(id) {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const dependency of dependencies.get(id) ?? []) collect(dependency);
  }
  for (const [id] of outputs) collect(id);
  for (const type of contract.required) {
    if (!byClass(type).some(([id]) => reachable.has(id))) fail("capability", `${contract.capability} requires ${type} connected to ${contract.output}`);
  }
  for (const [type, input, sourceType, slot] of contract.links ?? []) {
    for (const [id, node] of byClass(type)) {
      const value = node.inputs?.[input];
      if (!link(value) || workflow[value[0]]?.class_type !== sourceType || value[1] !== slot) {
        fail(`node ${id} (${type}) input ${input}`, `${contract.capability} requires ${sourceType} output ${slot}`);
      }
    }
  }
  for (const [type, input, expected] of contract.values ?? []) {
    const nodes = byClass(type);
    if (!nodes.length) fail("capability", `${contract.capability} requires ${type} input ${input} = ${JSON.stringify(expected)}`);
    for (const [id, node] of nodes) {
      if (node.inputs?.[input] !== expected) fail(`node ${id} (${type}) input ${input}`, `${contract.capability} requires ${JSON.stringify(expected)}`);
    }
  }
  for (const [id, node] of outputs) {
    if (contract.output === "VHS_VideoCombine" && node.inputs?.format !== "video/h264-mp4") fail(`node ${id} input format`, "video capability requires video/h264-mp4 output");
    if (node.inputs?.save_output === false) fail(`node ${id} input save_output`, "advertised output must be saved");
  }
  return errors;
}

export const templatesDirectory = fileURLToPath(new URL("../src/assets/templates/", import.meta.url));
export function scanWorkflows(directory = templatesDirectory) {
  const errors = [];
  const files = [];
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.name.endsWith(".json")) files.push(path);
    }
  }
  try { scan(directory); } catch (error) { return { files, errors: [`${directory}: cannot scan workflows: ${error.message}`] }; }
  for (const filename of files) {
    try { errors.push(...validateWorkflow(filename, JSON.parse(readFileSync(filename, "utf8")))); }
    catch (error) { errors.push(`${filename}: invalid JSON or unreadable file: ${error.message}`); }
  }
  for (const name of Object.keys(templateContracts)) {
    if (!files.some((file) => basename(file) === name)) errors.push(`${name}: missing shipped workflow asset`);
  }
  return { files, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = scanWorkflows();
  if (result.errors.length) {
    console.error(`Workflow validation failed:\n${result.errors.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Validated ${result.files.length} workflow JSON assets offline (no GPU, network or model downloads).`);
  }
}
