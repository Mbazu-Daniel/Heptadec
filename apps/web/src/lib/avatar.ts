const AVATAR_PIXELS = 128;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function readAvatar(file: File): Promise<Blob | null> {
  if (file.size > MAX_IMAGE_BYTES || !file.type.startsWith("image/")) {
    return null;
  }

  const picture = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  const context = canvas.getContext("2d");
  if (context === null) {
    picture.close();
    return null;
  }

  const side = Math.min(picture.width, picture.height);
  context.drawImage(
    picture,
    (picture.width - side) / 2,
    (picture.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PIXELS,
    AVATAR_PIXELS,
  );
  picture.close();
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
}