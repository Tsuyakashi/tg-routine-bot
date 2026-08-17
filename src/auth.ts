import type { Context, NextFunction } from "grammy";

function getAllowedIds(): number[] {
  return (process.env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
}

export async function authMiddleware(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id;
  const allowed = getAllowedIds();

  if (!userId || !allowed.includes(userId)) {
    await ctx.reply("⛔ Доступ запрещён");
    return;
  }
  await next();
}
