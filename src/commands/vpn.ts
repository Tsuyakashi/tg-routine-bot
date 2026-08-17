import { Bot, Context, InputFile } from "grammy";
import {
  dispatchWorkflow,
  findRunAfter,
  waitForCompletion,
  downloadArtifactsByName,
} from "../github.js";

interface VpnJob {
  command: string;
  workflowFile: string;
  label: string;
  /** Имена GitHub Actions artifacts, которые нужно скачать и прислать при успехе */
  artifacts: string[];
}

const JOBS: VpnJob[] = [
  {
    command: "deploy_wg",
    workflowFile: "deploy.yml",
    label: "Deploy WireGuard",
    artifacts: ["wg-config"],
  },
  {
    command: "destroy_wg",
    workflowFile: "destroy.yml",
    label: "Destroy WireGuard",
    artifacts: [],
  },
  {
    command: "deploy_xray",
    workflowFile: "deploy-xray-core.yml",
    label: "Deploy Xray-core (VLESS+Reality)",
    artifacts: ["xray-config"],
  },
  {
    command: "destroy_xray",
    workflowFile: "destroy-xray-core.yml",
    label: "Destroy Xray-core",
    artifacts: [],
  },
];

// Простой in-memory lock per workflow — достаточно для single-instance бота.
// Если когда-нибудь будет несколько инстансов бота, переносить в Redis.
const locks = new Set<string>();

export function registerVpnCommands(bot: Bot) {
  for (const job of JOBS) {
    bot.command(job.command, (ctx) => runJob(ctx, job));
  }
}

async function runJob(ctx: Context, job: VpnJob) {
  if (locks.has(job.workflowFile)) {
    await ctx.reply(`⏳ ${job.label} уже выполняется, подожди завершения`);
    return;
  }
  locks.add(job.workflowFile);
  const since = new Date();

  try {
    await ctx.reply(`Запускаю: ${job.label}`);
    await dispatchWorkflow(job.workflowFile);

    const run = await findRunAfter(job.workflowFile, since);
    await ctx.reply(`▶️ Run стартовал: ${run.html_url}`);

    const finished = await waitForCompletion(run.id);

    if (finished.conclusion !== "success") {
      await ctx.reply(
        `❌ ${job.label} завершился с ошибкой (${finished.conclusion})\n${finished.html_url}`,
      );
      return;
    }

    await ctx.reply(`✅ ${job.label} готово`);

    if (job.artifacts.length > 0) {
      const artifacts = await downloadArtifactsByName(run.id, job.artifacts);
      for (const artifact of artifacts) {
        for (const file of artifact.files) {
          if (file.path.endsWith(".png")) {
            await ctx.replyWithPhoto(new InputFile(file.data, file.path));
          } else {
            await ctx.replyWithDocument(new InputFile(file.data, file.path));
          }
        }
      }
    }
  } catch (err) {
    await ctx.reply(`Ошибка: ${(err as Error).message}`);
  } finally {
    locks.delete(job.workflowFile);
  }
}
