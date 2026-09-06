import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { dataDirectory } from "./db.js";

export const uploadsDirectory = path.join(dataDirectory, "uploads");
fs.mkdirSync(uploadsDirectory, { recursive: true });
fs.accessSync(uploadsDirectory, fs.constants.R_OK | fs.constants.W_OK);

const avatarTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);
const bannerTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export class InvalidMediaError extends Error {}

export async function persistMedia(
  file: Express.Multer.File,
  kind: "avatar" | "banner",
) {
  const detected = await fileTypeFromBuffer(file.buffer);
  const allowedTypes = kind === "avatar" ? avatarTypes : bannerTypes;
  const maxBytes =
    kind === "avatar" && detected?.mime.startsWith("video/")
      ? 12 * 1024 * 1024
      : 8 * 1024 * 1024;

  if (!detected || !allowedTypes.has(detected.mime)) {
    throw new InvalidMediaError(
      kind === "avatar"
        ? "Use JPG, PNG, WebP, GIF, MP4 ou WebM no perfil."
        : "Use JPG, PNG, WebP ou GIF no banner.",
    );
  }
  if (file.size > maxBytes) {
    throw new InvalidMediaError(
      kind === "avatar" && detected.mime.startsWith("video/")
        ? "O vídeo de perfil deve ter no máximo 12 MB."
        : "A imagem deve ter no máximo 8 MB.",
    );
  }

  const filename = `${kind}-${randomUUID()}.${detected.ext}`;
  await fs.promises.writeFile(path.join(uploadsDirectory, filename), file.buffer, {
    mode: 0o600,
    flag: "wx",
  });
  return {
    url: `/uploads/${filename}`,
    mediaType: detected.mime,
  };
}

export async function removeStoredMedia(url: string | null) {
  if (!url?.startsWith("/uploads/")) return;
  const filename = path.basename(url);
  await fs.promises
    .unlink(path.join(uploadsDirectory, filename))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") console.error(error);
    });
}
