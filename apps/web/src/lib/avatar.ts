const AVATAR_PIXELS = 128;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function readAvatar(file: File): Promise<string | null> {
  if (file.size > MAX_IMAGE_BYTES || !file.type.startsWith("image/")) {
    return null;
  }

  const read = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("unreadable"));
    reader.readAsDataURL(file);
  });

  const picture = await new Promise<HTMLImageElement>((resolve, reject) => {
    const loaded = new Image();
    loaded.onload = () => resolve(loaded);
    loaded.onerror = () => reject(new Error("unreadable"));
    loaded.src = read;
  });

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  const context = canvas.getContext("2d");
  if (context === null) {
    return read;
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
  return canvas.toDataURL("image/png");
}