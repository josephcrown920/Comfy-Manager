import dns from "node:dns/promises";
import net from "node:net";

const PRIVATE_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
] as const;

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function isPrivateIpv4(address: string): boolean {
  if (!net.isIPv4(address)) return false;
  const value = ipv4ToNumber(address);
  return PRIVATE_IPV4_RANGES.some(([network, prefix]) => {
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (ipv4ToNumber(network) & mask);
  });
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (!net.isIPv6(normalized)) return false;
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  // IPv4-mapped IPv6 addresses can bypass a hostname/IP check if treated only
  // as IPv6.
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+)$/);
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4[1]!) : false;
}

function isPrivateAddress(address: string): boolean {
  return isPrivateIpv4(address) || isPrivateIpv6(address);
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "metadata.google.internal" ||
    normalized === "metadata";
}

export type ComfyTargetValidation = {
  ok: true;
  url: string;
} | {
  ok: false;
  error: string;
};

/**
 * Validate a ComfyUI base URL before it is persisted or used for a server-side
 * request. Local targets remain available in development for the local GPU
 * workflow, but production targets must resolve to public addresses.
 */
export async function validateComfyTarget(rawUrl: string): Promise<ComfyTargetValidation> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "ComfyUI URL must be a valid URL." };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: "ComfyUI URL must use http or https." };
  }
  if (!url.hostname || url.search || url.hash) {
    return { ok: false, error: "ComfyUI URL must contain only a base host and optional path." };
  }
  if (url.port && (!Number.isInteger(Number(url.port)) || Number(url.port) < 1 || Number(url.port) > 65535)) {
    return { ok: false, error: "ComfyUI URL contains an invalid port." };
  }

  const localTarget = isLocalHostname(url.hostname) ||
    isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ""));
  if (localTarget && process.env.NODE_ENV === "production") {
    return { ok: false, error: "Private and local ComfyUI targets are not allowed in production." };
  }

  if (!localTarget && net.isIP(url.hostname) === 0) {
    try {
      const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
      if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
        return { ok: false, error: "ComfyUI hostname must resolve only to public addresses." };
      }
    } catch {
      return { ok: false, error: "ComfyUI hostname could not be resolved." };
    }
  } else if (isPrivateAddress(url.hostname) && process.env.NODE_ENV === "production") {
    return { ok: false, error: "Private ComfyUI addresses are not allowed in production." };
  }

  return { ok: true, url: url.toString().replace(/\/$/, "") };
}

export function redactComfyUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}