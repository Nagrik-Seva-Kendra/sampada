import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { r2Configured, r2Get, r2Put } from "../guideline/r2.js";
import { localMediaPath } from "./wa-requests.mapper.js";

/** Store a WhatsApp-related file (R2, or the local media dir as fallback). */
export async function putMedia(key: string, buf: Buffer, mime: string): Promise<void> {
  if (r2Configured()) return r2Put(key, buf, mime);
  const path = localMediaPath(key);
  if (!path) throw new Error("invalid media path");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
}

export async function readMedia(key: string): Promise<Buffer> {
  if (r2Configured()) return r2Get(key);
  const path = localMediaPath(key);
  if (!path) throw new Error("invalid media path");
  return readFile(path);
}
