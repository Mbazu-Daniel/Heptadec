export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .trim();
  if (!words) {
    return "New user";
  }
  return words.replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}