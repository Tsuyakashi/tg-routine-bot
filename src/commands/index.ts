import { Bot } from "grammy";
import { registerVpnCommands } from "./vpn.js";

export function registerCommands(bot: Bot) {
  // Добавляй сюда новые registerXxxCommands(bot) по мере роста бота
  registerVpnCommands(bot);

  bot.command("start", (ctx) =>
    ctx.reply(
      [
        "Бот для рутинных задач.",
        "",
        "aws-vpn:",
        "/deploy_wg — поднять WireGuard",
        "/destroy_wg — снести WireGuard",
        "/deploy_xray — поднять Xray-core (VLESS+Reality)",
        "/destroy_xray — снести Xray-core",
      ].join("\n"),
    ),
  );
}
