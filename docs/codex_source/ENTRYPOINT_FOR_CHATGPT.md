# ENTRYPOINT FOR CHATGPT — AI Court Game

STATUS: initial

Назначение:

- Это первый файл, который ChatGPT должен читать в начале нового диалога по AI Court Game.
- Он нужен, чтобы ChatGPT и Codex опирались на память репозитория, а не гадали по прошлому состоянию чата.
- Не полагайтесь только на память, пока не проверите этот entrypoint и текущий индекс документации.

Текущее известное состояние репозитория:

- Public repo: `https://github.com/MaksimUnimax/ai-court-game`
- Local project root: `/opt/ai-court-game`
- Docs root: `docs/codex_source/**`

Текущее состояние bootstrap:

- Root `AGENTS.md` должен существовать.
- Rules должны находиться в `docs/codex_source/rules/**`.
- Product ТЗ ещё не написано.
- Roadmap ещё не написан.
- Application code ещё не создан.

Основной путь чтения:

1. `AGENTS.md`
2. `docs/codex_source/index.yaml`
3. точные файлы, перечисленные ChatGPT в текущем prompt

Примечания:

- Roadmap/context — это историческая память проекта, а не source-of-truth для поведения внешнего API.
- Для технических задач читайте только точные требуемые документы.
- Для append-only обновлений читайте только manifest + tail, а не весь большой context.
- Если обязательный документ отсутствует, является stub или противоречивым, будущие fix-run'ы должны останавливаться с `STOP_DOCS_MISSING`.
