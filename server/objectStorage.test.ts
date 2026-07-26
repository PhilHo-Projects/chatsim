// @vitest-environment node
import { describe, expect, it } from "vitest";
import { R2ObjectStorage } from "./objectStorage";

describe("R2ObjectStorage", () => {
  it("signs the claimed content length into presigned PUT URLs", async () => {
    const storage = new R2ObjectStorage({
      accountId: "example",
      originals: {
        accessKeyId: "TESTORIGINALS",
        bucket: "originals",
        secretAccessKey: "test-originals-secret"
      },
      variants: {
        accessKeyId: "TESTVARIANTS",
        bucket: "variants",
        secretAccessKey: "test-variants-secret"
      }
    });

    const upload = await storage.presignOriginalPut(
      "staging/user/image",
      "image/png",
      1024,
      300
    );
    const signedHeaders = new URL(upload.url).searchParams.get(
      "X-Amz-SignedHeaders"
    );

    expect(signedHeaders?.split(";")).toContain("content-length");
  });
});
