import { prisma } from "@/lib/db";
import { DEFAULT_MARKETING_IMAGE } from "./templates";

export function validateMarketingImage(data: Uint8Array, mimeType: string) {
  if (!data.length || data.length > 2 * 1024 * 1024)
    throw new Error("Choose an image smaller than 2 MB.");
  const header = Buffer.from(data);
  const valid =
    (mimeType === "image/png" &&
      header
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mimeType === "image/jpeg" &&
      header[0] === 255 &&
      header[1] === 216 &&
      header[2] === 255) ||
    (mimeType === "image/webp" &&
      header.toString("ascii", 0, 4) === "RIFF" &&
      header.toString("ascii", 8, 12) === "WEBP");
  if (!valid) throw new Error("Upload a PNG, JPEG or WebP image.");
}

export async function saveMarketingImage(
  form: FormData,
): Promise<string | null> {
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024)
      throw new Error("Choose an image smaller than 2 MB.");
    const data = new Uint8Array(await file.arrayBuffer());
    validateMarketingImage(data, file.type);
    const image = await prisma.marketingImage.create({
      data: { data, mimeType: file.type },
    });
    return `/api/marketing/images/${image.id}`;
  }
  const path = String(form.get("imagePath") || "");
  if (!path) return null;
  if (path === DEFAULT_MARKETING_IMAGE) return path;
  const match = /^\/api\/marketing\/images\/([a-z0-9]+)$/.exec(path);
  if (
    !match ||
    !(await prisma.marketingImage.findUnique({
      where: { id: match[1] },
      select: { id: true },
    }))
  )
    throw new Error("Choose a valid campaign image.");
  return path;
}
