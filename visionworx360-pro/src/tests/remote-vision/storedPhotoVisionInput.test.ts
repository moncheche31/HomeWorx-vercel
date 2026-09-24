/**
 * REGRESSION — a photo that reached storage must actually be analyzed.
 *
 * The bug these lock down: `mediaFromPhoto` gives every durable photo
 * `previewUrl: null` and only a `storagePath`, while the vision pipeline
 * accepted `data:image/...` URLs only. Every persisted photo was silently
 * dropped, so no photo uploaded from either surface was ever analyzed — the
 * older tests missed it because they fed synthetic data URLs that no
 * production code path ever produces.
 *
 * Everything here starts from a REAL `project_photos`-shaped row.
 */

import { describe, expect, it, vi } from "vitest";
import { buildImages } from "@/features/remote-vision/hooks/useProjectUnderstanding";
import { mediaFromPhoto } from "@/features/remote-vision/services/mediaPersistence";
import {
  bytesToBase64,
  imageMimeType,
  resolveVisionImages,
  MAX_STORED_IMAGE_BYTES,
} from "@/features/remote-vision/services/visionImageSource.server";
import type { PhotoDTO } from "@/features/project-workspace/types";
import type { RemoteVisionMedia } from "@/domains/remoteVision";

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const PATH = `${ORG}/${PROJECT}/photos/abc/kitchen.jpg`;

/** A row exactly as `listPhotos` returns it after an upload from the Photos tab. */
function photoRow(overrides: Partial<PhotoDTO> = {}): PhotoDTO {
  return {
    id: "photo-1",
    projectId: PROJECT,
    roomId: null,
    storagePath: PATH,
    fileName: "kitchen.jpg",
    mimeType: "image/jpeg",
    fileSize: 120_000,
    photoType: "existing",
    caption: null,
    altText: null,
    archivedAt: null,
    createdAt: "2026-08-26T12:00:00.000Z",
    ...overrides,
  } as PhotoDTO;
}

function imageResponse(bytes: Uint8Array, contentType: string | null = "image/jpeg"): Response {
  return {
    ok: true,
    headers: { get: () => contentType },
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
  } as unknown as Response;
}

describe("stored photos reach the vision model", () => {
  it("emits a storage-backed image for a durable photo with no preview", () => {
    const media = mediaFromPhoto(photoRow());
    /* The production shape: no data URL anywhere. */
    expect(media.previewUrl).toBeNull();
    expect(media.storagePath).toBe(PATH);

    const images = buildImages([media]);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: "photo-1",
      kind: "before_photo",
      storagePath: PATH,
      mimeType: "image/jpeg",
    });
    expect(images[0]?.dataUrl).toBeUndefined();
  });

  it("still emits keyframes and in-flight previews as direct data URLs", () => {
    const video = {
      id: "vid-1",
      kind: "walkthrough_video",
      keyframePreviews: ["data:image/jpeg;base64,AAAA"],
    } as unknown as RemoteVisionMedia;
    const inFlight = {
      id: "local-1",
      kind: "before_photo",
      previewUrl: "data:image/png;base64,BBBB",
      storagePath: null,
      uploadState: "uploading",
    } as unknown as RemoteVisionMedia;

    const images = buildImages([video, inFlight]);
    expect(images.map((i) => i.dataUrl)).toEqual([
      "data:image/jpeg;base64,AAAA",
      "data:image/png;base64,BBBB",
    ]);
  });

  it("does not send an upload that has not landed in storage yet", () => {
    const failed = {
      id: "local-2",
      kind: "before_photo",
      previewUrl: "blob:http://localhost/xyz",
      storagePath: null,
      uploadState: "error",
    } as unknown as RemoteVisionMedia;
    expect(buildImages([failed])).toHaveLength(0);
  });

  it("signs, downloads and inlines the stored bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImage = vi.fn(async () => imageResponse(bytes));
    const signUrl = vi.fn(async () => "https://signed.example/kitchen.jpg?token=x");

    const resolved = await resolveVisionImages(
      buildImages([mediaFromPhoto(photoRow())]),
      { signUrl, fetchImage },
    );

    expect(signUrl).toHaveBeenCalledWith(PATH);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.dataUrl).toBe(`data:image/jpeg;base64,${bytesToBase64(bytes)}`);
    expect(resolved[0]?.id).toBe("photo-1");
  });

  it("skips an unreadable object instead of failing the whole run", async () => {
    const good = buildImages([mediaFromPhoto(photoRow())]);
    const bad = buildImages([
      mediaFromPhoto(photoRow({ id: "photo-2", storagePath: `${ORG}/${PROJECT}/photos/x/gone.jpg` })),
    ]);
    const resolved = await resolveVisionImages([...bad, ...good], {
      signUrl: async (p) => (p.endsWith("gone.jpg") ? null : "https://signed.example/x"),
      fetchImage: async () => imageResponse(new Uint8Array([9])),
    });
    expect(resolved.map((i) => i.id)).toEqual(["photo-1"]);
  });

  it("skips oversized, empty and non-image objects", async () => {
    const refs = buildImages([mediaFromPhoto(photoRow())]);
    const signUrl = async () => "https://signed.example/x";

    const oversized = await resolveVisionImages(refs, {
      signUrl,
      fetchImage: async () => imageResponse(new Uint8Array(MAX_STORED_IMAGE_BYTES + 1)),
    });
    expect(oversized).toHaveLength(0);

    const empty = await resolveVisionImages(refs, {
      signUrl,
      fetchImage: async () => imageResponse(new Uint8Array(0)),
    });
    expect(empty).toHaveLength(0);

    const notAnImage = await resolveVisionImages(
      buildImages([mediaFromPhoto(photoRow({ mimeType: "application/pdf", storagePath: `${ORG}/${PROJECT}/photos/a/plan.pdf` }))]),
      { signUrl, fetchImage: async () => imageResponse(new Uint8Array([1]), "application/pdf") },
    );
    expect(notAnImage).toHaveLength(0);
  });

  it("derives a mime type from the stored value or the extension", () => {
    expect(imageMimeType("image/webp; charset=binary", null, PATH)).toBe("image/webp");
    expect(imageMimeType("application/octet-stream", "image/png", PATH)).toBe("image/png");
    expect(imageMimeType(null, null, PATH)).toBe("image/jpeg");
    expect(imageMimeType(null, null, `${ORG}/${PROJECT}/photos/a/file.bin`)).toBeNull();
  });

  it("honours the image cap", async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      mediaFromPhoto(photoRow({ id: `photo-${i}`, storagePath: `${ORG}/${PROJECT}/photos/${i}/p.jpg` })),
    );
    const resolved = await resolveVisionImages(buildImages(many), {
      signUrl: async () => "https://signed.example/x",
      fetchImage: async () => imageResponse(new Uint8Array([1])),
    });
    expect(resolved).toHaveLength(12);
  });
});
