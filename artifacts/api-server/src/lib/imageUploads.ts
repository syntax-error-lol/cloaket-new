import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { getObjectAclPolicy, setObjectAclPolicy } from "./objectAcl";
import { isImageSafe } from "./moderation";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const objectStorage = new ObjectStorageService();

/**
 * Validates a player-uploaded image (clan banners, owner-set pfps): must
 * exist in object storage, be an image under 5MB, belong to the requesting
 * player (or be unclaimed — fresh uploads have no ACL yet), and pass the
 * NSFW moderation check. On success the object is claimed for the player
 * and marked public so it can be served.
 * Returns the normalized object path, or an error message string.
 */
export async function validateUploadedImage(
  rawPath: string,
  playerId: number,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  let normalized: string;
  try {
    normalized = objectStorage.normalizeObjectEntityPath(rawPath);
  } catch {
    return { ok: false, message: "Invalid image" };
  }
  if (!normalized.startsWith("/objects/")) {
    return { ok: false, message: "Invalid image" };
  }
  try {
    const file = await objectStorage.getObjectEntityFile(normalized);
    // Only unclaimed uploads (no ACL yet) or the player's own objects may
    // be used — prevents pointing at someone else's uploads.
    const existingAcl = await getObjectAclPolicy(file);
    if (existingAcl && existingAcl.owner !== String(playerId)) {
      return { ok: false, message: "Invalid image" };
    }
    const [meta] = await file.getMetadata();
    const contentType = meta.contentType ?? "";
    const size = Number(meta.size ?? 0);
    if (!contentType.startsWith("image/")) {
      return { ok: false, message: "File must be an image" };
    }
    if (size > MAX_IMAGE_BYTES) {
      return { ok: false, message: "Image must be under 5MB" };
    }
    const [buffer] = await file.download();
    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    if (!(await isImageSafe(dataUrl))) {
      return {
        ok: false,
        message: "That image isn't allowed. Pick a different one.",
      };
    }
    // Passed moderation: claim it and mark it public so it can be served.
    await setObjectAclPolicy(file, {
      owner: String(playerId),
      visibility: "public",
    });
    return { ok: true, path: normalized };
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return { ok: false, message: "Image upload not found" };
    }
    throw err;
  }
}
