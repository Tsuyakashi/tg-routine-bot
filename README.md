# tg-routine-bot

Telegram-бот для мелких рутинных задач. Первая функция — триггер GitHub Actions
workflow'ов в [aws-vpn](https://github.com/Tsuyakashi/aws-vpn) прямо из чата,
без захода на GitHub.

## Команды

- `/deploy_wg` — поднять WireGuard, прислать `wg0-client.conf`
- `/destroy_wg` — снести WireGuard-инстанс
- `/deploy_xray` — поднять Xray-core (VLESS+Reality), прислать ссылку + QR
- `/destroy_xray` — снести Xray-инстанс

Каждая команда: dispatch workflow → поиск свежего run → поллинг до
`completed` → скачивание и отправка артефактов. Параллельный повторный запуск
одного и того же workflow блокируется, пока предыдущий не завершится.

## Настройка

1. `cp .env.example .env` и заполни:
   - `BOT_TOKEN` — от [@BotFather](https://t.me/BotFather)
   - `GITHUB_TOKEN` — fine-grained PAT со scope Actions: Read and write
     на репозиторий `aws-vpn`
   - `GITHUB_OWNER` / `GITHUB_REPO` — по умолчанию `Tsuyakashi/aws-vpn`
   - `ALLOWED_USER_IDS` — твой telegram user_id (узнать у
     [@userinfobot](https://t.me/userinfobot)), через запятую если юзеров
     несколько

2. Локально:

   ```bash
   npm install
   npm run dev
   ```

3. Через Docker (например, на swarm-lab):

   ```bash
   docker compose up -d --build
   ```

## Расширение

Новые команды — отдельным файлом в `src/commands/`, экспортирующим
`registerXxxCommands(bot)`, и подключением в `src/commands/index.ts`.
Свой GitHub-клиент под другой репозиторий/задачу переиспользуй из
`src/github.ts` — там нет ничего специфичного под VPN, кроме списка `JOBS`
в `vpn.ts`.

## Важные нюансы

- GitHub не отдаёт `run_id` сразу после `workflow_dispatch` — приходится
  искать свежий run по `created_at` (см. `findRunAfter`), окно поиска 30 сек.
- Таймаут ожидания завершения — 8 минут (сам workflow ждёт SSM-параметр до
  ~5 минут + время на поднятие инстанса).
- Артефакты качаются как zip и распаковываются в памяти (`adm-zip`), без
  temp-файлов на диске.
- `xray-client.txt` содержит `vless://` ссылку с секретами — бот отправляет
  её только в личку разрешённым `ALLOWED_USER_IDS`, но учитывай, что она
  осядет в истории Telegram-чата.
