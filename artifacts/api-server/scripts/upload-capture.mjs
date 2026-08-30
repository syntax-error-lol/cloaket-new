// Uploads the hack-repair auth capture to private object storage.
// Usage: node scripts/upload-capture.mjs /tmp/hack-capture.json
import { readFileSync } from "node:fs";
import { Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const src = process.argv[2];
if (!src) throw new Error("usage: node upload-capture.mjs <file.json>");
const raw = readFileSync(src, "utf8");
const parsed = JSON.parse(raw);
if (!Array.isArray(parsed.players) || parsed.players.length === 0) {
  throw new Error("capture has no players");
}

const dir = process.env.PRIVATE_OBJECT_DIR;
if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
const full = `${dir.replace(/\/$/, "")}/hack-repair/capture-2026-08-28.json`;
const parts = (full.startsWith("/") ? full : `/${full}`).split("/");
const bucketName = parts[1];
const objectName = parts.slice(2).join("/");

await storage
  .bucket(bucketName)
  .file(objectName)
  .save(raw, { contentType: "application/json", resumable: false });

const [meta] = await storage.bucket(bucketName).file(objectName).getMetadata();
console.log(
  JSON.stringify({
    uploaded: objectName,
    players: parsed.players.length,
    bytes: meta.size,
  }),
);
