import { describe, expect, it } from "vitest";
import {
  FLOOR_PLAN_CAPTION,
  kindForPhoto,
  mediaFromPhoto,
  mergeDurableMedia,
  photoTypeForKind,
} from "@/features/remote-vision/services/mediaPersistence";
import type { PhotoDTO } from "@/features/project-workspace/types";
import type { RemoteVisionMedia } from "@/domains/remoteVision";

const photo = (over: Partial<PhotoDTO> = {}): PhotoDTO => ({
  id: "p1",
  organizationId: "org",
  projectId: "proj-a",
  roomId: null,
  storagePath: "org/proj-a/photos/1.jpg",
  fileName: "1.jpg",
  mimeType: "image/jpeg",
  fileSize: 1234,
  caption: null,
  altText: null,
  photoType: "existing",
  sortOrder: 0,
  createdBy: "user",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
  ...over,
});

const local = (over: Partial<RemoteVisionMedia> = {}): RemoteVisionMedia => ({
  id: "local-1",
  kind: "before_photo",
  fileName: "pending.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 10,
  previewUrl: null,
  storagePath: null,
  roomHint: null,
  createdAt: "2026-01-02T00:00:00Z",
  uploadState: "uploading",
  uploadError: null,
  ...over,
});

describe("remote vision durable media mapping", () => {
  it("round-trips every media kind through the photo record", () => {
    for (const kind of ["before_photo", "after_rendering", "floor_plan"] as const) {
      const type = photoTypeForKind(kind);
      const caption = kind === "floor_plan" ? FLOOR_PLAN_CAPTION : null;
      expect(kindForPhoto({ photoType: type, caption })).toBe(kind);
    }
  });

  it("renders a stored photo as durable session media with its storage path", () => {
    const media = mediaFromPhoto(photo());
    expect(media.storagePath).toBe("org/proj-a/photos/1.jpg");
    expect(media.uploadState).toBe("uploaded");
  });
});

describe("durable media survives stale device sessions", () => {
  it("keeps every saved photo even when the local session is empty", () => {
    const durable = [mediaFromPhoto(photo()), mediaFromPhoto(photo({ id: "p2" }))];
    expect(mergeDurableMedia(durable, [])).toHaveLength(2);
  });

  it("never lets a stale local mirror drop or duplicate a saved photo", () => {
    const durable = [mediaFromPhoto(photo())];
    const stale = local({ id: "p1", storagePath: "org/proj-a/photos/1.jpg", uploadState: "uploaded" });
    const merged = mergeDurableMedia(durable, [stale]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("p1");
  });

  it("preserves in-flight and failed local uploads alongside saved photos", () => {
    const merged = mergeDurableMedia(
      [mediaFromPhoto(photo())],
      [local(), local({ id: "local-2", uploadState: "error", uploadError: "upload_failed" })],
    );
    expect(merged.map((m) => m.id)).toEqual(["p1", "local-1", "local-2"]);
  });

  it("keeps walkthrough videos, which persist as project documents", () => {
    const video = local({ id: "v1", kind: "walkthrough_video", uploadState: "uploaded" });
    expect(mergeDurableMedia([], [video]).map((m) => m.id)).toEqual(["v1"]);
  });

  it("isolates projects: only the active project's rows become session media", () => {
    const projectA = [mediaFromPhoto(photo({ id: "a1", projectId: "proj-a" }))];
    const merged = mergeDurableMedia(projectA, []);
    expect(merged.every((m) => m.id === "a1")).toBe(true);
  });
});

describe("upload duplication guards", () => {
  it("collapses an in-flight item that is mirrored back into the session", () => {
    const pending = local({ id: "pending-1" });
    // Same item present twice (session mirror + hook pending list).
    const merged = mergeDurableMedia([], [pending, { ...pending }]);
    expect(merged).toHaveLength(1);
  });

  it("stays at one entry no matter how many times the mirror re-feeds it", () => {
    const pending = local({ id: "pending-1" });
    let session: RemoteVisionMedia[] = [];
    for (let i = 0; i < 25; i += 1) {
      session = mergeDurableMedia([], [...session, pending]);
    }
    expect(session).toHaveLength(1);
  });

  it("keeps one record when the same storage path arrives from two local copies", () => {
    const a = local({ id: "l1", storagePath: "org/proj-a/photos/9.jpg" });
    const b = local({ id: "l2", storagePath: "org/proj-a/photos/9.jpg" });
    expect(mergeDurableMedia([], [a, b])).toHaveLength(1);
  });

  it("one saved row plus its local mirror renders once after refresh", () => {
    const durable = mediaFromPhoto(photo());
    const mirror = local({ id: durable.id, storagePath: durable.storagePath });
    expect(mergeDurableMedia([durable], [mirror, mirror])).toHaveLength(1);
  });

  it("does not bleed media across projects", () => {
    const a = mediaFromPhoto(photo({ id: "a", storagePath: "org/proj-a/photos/1.jpg" }));
    const b = mediaFromPhoto(photo({ id: "b", storagePath: "org/proj-b/photos/1.jpg" }));
    expect(mergeDurableMedia([a], [b]).map((m) => m.id)).toEqual(["a"]);
  });
});
