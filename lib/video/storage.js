import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DIRECTORY = path.join(process.cwd(), ".data", "review-videos");
const SAFE_KEY = /^[a-f0-9-]{36}\.(mp4|webm|mov)$/;

export async function saveReviewVideo(file) {
  const extension = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" }[file.type] || "mp4";
  const key = `${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await mkdir(DIRECTORY, { recursive: true });
  await writeFile(path.join(DIRECTORY, key), bytes);
  return {
    key,
    storage: "local",
    name: (file.name || key).slice(0, 200),
    size: bytes.length,
    type: file.type || "video/mp4",
  };
}

export async function readReviewVideo(asset) {
  if (!SAFE_KEY.test(asset.key)) throw new Error("Invalid video key");
  return { bytes: await readFile(path.join(DIRECTORY, asset.key)) };
}

export async function deleteReviewVideo(asset) {
  if (!SAFE_KEY.test(asset.key)) throw new Error("Invalid video key");
  try {
    await unlink(path.join(DIRECTORY, asset.key));
  } catch (_) {}
}

