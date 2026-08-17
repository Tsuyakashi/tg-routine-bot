import "dotenv/config";
import { Bot } from "grammy";
import { authMiddleware } from "./auth.js";
import { registerCommands } from "./commands/index.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN is not set in .env");
}

const bot = new Bot(token);

bot.use(authMiddleware);
registerCommands(bot);

bot.catch((err) => {
  console.error("Bot error:", err);
});

bot.start();
console.log("Bot started");
