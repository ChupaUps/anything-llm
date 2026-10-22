# PostgreSQL: запуск, перенос данных и эксплуатация

AnythingLLM хранит все реляционные данные (пользователи, пространства, чаты, настройки, файлы)
в PostgreSQL. SQLite больше не используется: его миграции заархивированы в
`server/prisma/migrations-sqlite`, а базовая миграция для Postgres лежит в
`server/prisma/migrations/20261021000000_init`.

## 1. Состав стека

`docker/docker-compose.yml` поднимает два сервиса:

| Сервис | Что делает |
| --- | --- |
| `postgres` | `postgres:16-alpine`, volume `anythingllm_pgdata`, healthcheck `pg_isready` |
| `anything-llm` | приложение; стартует только после `service_healthy` у базы |

Важно:

- порт 5432 **не публикуется** на хост — база доступна только внутри compose-сети по имени `postgres`;
- том `anythingllm_pgdata` — это и есть все реляционные данные, его нужно включать в бэкап;
- документы, LanceDB и сгенерированные файлы по-прежнему лежат в `server/storage`.

## 2. Переменные в `docker/.env`

```env
POSTGRES_USER=anythingllm
POSTGRES_PASSWORD=<длинный случайный пароль>
POSTGRES_DB=anythingllm
DATABASE_URL=postgresql://anythingllm:<тот же пароль>@postgres:5432/anythingllm?schema=public&connection_limit=10

# multi-user режим
AUTH_TOKEN=<случайная строка>
JWT_SECRET=<случайная строка>

# уже были раньше, не менять без необходимости
SIG_KEY=<...>
SIG_SALT=<...>
```

- `DATABASE_URL` и `POSTGRES_PASSWORD` должны содержать **один и тот же** пароль.
- `DATABASE_URL` пишется **без кавычек** (`docker run --env-file` не срезает кавычки).
- `AUTH_TOKEN` + `JWT_SECRET` нужны для авторизации. Логин в multi-user режиме идёт по
  логину/паролю пользователя, `AUTH_TOKEN` — пароль для однопользовательского режима.
- `SIG_KEY`/`SIG_SALT` менять нельзя: иначе перестанут расшифровываться JWT и сохранённые секреты.

## 3. Первый запуск

```bash
cd docker
cp .env.example .env          # если .env ещё нет
# заполнить POSTGRES_PASSWORD, DATABASE_URL, AUTH_TOKEN, JWT_SECRET
docker compose up -d --build
docker compose ps             # оба сервиса должны быть healthy
curl -s http://localhost:3001/api/ping
```

При старте entrypoint сам выполняет `prisma generate` и `prisma migrate deploy`, поэтому
отдельно накатывать схему не нужно. В логах успешного старта видно:

```
No pending migrations to apply.
prisma:info Starting a postgresql pool with 10 connections.
Primary server in HTTP mode listening on port 3001
```

## 4. Одноразовый перенос данных из SQLite

1. Остановить приложение (важно: пока работает старое приложение, файл менять нельзя):

   ```bash
   cd docker
   docker compose stop anything-llm
   ```

2. Проверить, что рядом с `server/storage/anythingllm.db` **нет** чужих `-wal`/`-shm`.
   Если они остались от другой копии базы, их нужно убрать из этой папки (см. раздел 9).

3. Запустить импорт:

   ```bash
   docker compose run --rm --entrypoint /bin/bash anything-llm \
     -c "cd /app/server && yarn migrate:sqlite2pg"
   ```

   Полезные варианты:

   - `SQLITE_DB_PATH` — путь к другому файлу базы (по умолчанию `/app/server/storage/anythingllm.db`);
   - `--force` — разрешить импорт в непустую базу (сначала делает `TRUNCATE ... RESTART IDENTITY CASCADE`).

4. Что делает скрипт:

   - копирует `.db` вместе с `-wal`/`-shm` во временную папку, поэтому читает консистентный снимок;
   - при пустой схеме сам применяет миграции;
   - отказывается писать в непустую базу без `--force` и печатает список непустых таблиц;
   - копирует 33 таблицы в порядке, безопасном для внешних ключей, батчами по 500 строк;
   - конвертирует даты из unix-миллисекунд SQLite в `TIMESTAMP(3)`, `0/1` в boolean, учитывает `@map`-колонки;
   - выставляет последовательности (`setval`) и сверяет количество строк до/после.

5. Вернуть приложение:

   ```bash
   docker compose up -d anything-llm
   ```

6. Проверить данные:

   ```bash
   docker exec -it anythingllm-postgres psql -U anythingllm -d anythingllm \
     -c "select count(*) from users; select count(*) from workspace_chats;"
   ```

Файл `server/storage/anythingllm.db` скрипт не изменяет — он остаётся резервной копией.

## 5. Многопользовательский режим

Признак режима хранится в БД, а не в env:

```sql
select value from system_settings where label = 'multi_user_mode';  -- true
```

- при `true` приложение показывает экран входа, работает по логину/паролю, инвайтам и ролям
  (`admin`, `manager`, `default`);
- при первом развёртывании «с нуля» режим включается в UI: Settings → Security → Multi-User Mode;
- для запросов нужен `JWT_SECRET`; без него токены не подписываются и вход не работает.

## 6. Ежедневная эксплуатация

```bash
cd docker
docker compose ps                       # состояние
docker compose logs -f anything-llm     # логи приложения
docker compose restart anything-llm     # перезапуск
docker compose down                     # остановить (данные в volume сохраняются)
```

Обновление версии:

```bash
git pull
cd docker
docker compose up -d --build            # миграции применятся автоматически
```

`docker compose down -v` удаляет volume `anythingllm_pgdata` вместе с базой — без бэкапа не запускать.

## 7. Бэкап и восстановление

Реляционные данные:

```bash
# бэкап
docker exec anythingllm-postgres pg_dump -U anythingllm -d anythingllm -Fc > backup-$(date +%F).dump

# восстановление в пустую базу
docker exec -i anythingllm-postgres dropdb -U anythingllm --if-exists anythingllm
docker exec -i anythingllm-postgres createdb -U anythingllm anythingllm
docker exec -i anythingllm-postgres pg_restore -U anythingllm -d anythingllm --no-owner < backup-2026-10-21.dump
```

Файлы и векторы (обязательно вместе с базой):

```bash
tar czf storage-$(date +%F).tar.gz server/storage --exclude=server/storage/backups
```

В `server/storage/backups/` уже лежит первый дамп после переключения:
`postgres-2026-10-21.dump` (73 МБ). Папка исключена из git.

## 8. Диагностика

| Симптом | Что проверить |
| --- | --- |
| `Can't reach database server` / `P1001` | `docker compose ps` — сервис `postgres` healthy? пароль в `DATABASE_URL` совпадает с `POSTGRES_PASSWORD`? |
| `Environment variable not found: DATABASE_URL` | переменная не попала в `docker/.env` или контейнер не пересоздан (`docker compose up -d --force-recreate anything-llm`) |
| `No auth token found` на всех запросах | это норма для multi-user без логина: нужен токен из `POST /api/request-token` |
| Вход не работает у всех | `JWT_SECRET` пустой или менялся; пользователи входят заново |
| `migration ... failed` при старте | посмотреть `docker compose logs anything-llm`; схема могла быть создана вручную |
| Таблицы пустые после импорта | импорт запускался с `SQLITE_DB_PATH` на другой файл; проверить вывод `[sqlite2pg]` |

Полезные запросы:

```bash
docker exec -it anythingllm-postgres psql -U anythingllm -d anythingllm
\dt                       -- список таблиц
select * from _prisma_migrations order by finished_at desc limit 5;
select count(*) from users;
```

## 9. Если остались старые `-wal`/`-shm`

`-wal` и `-shm` относятся к конкретному файлу базы. Если основной `.db` заменяли копией
(например, из бэкапа), старые sidecar-файлы нельзя оставлять рядом: SQLite попытается
применить чужой журнал и упадёт с `malformed database schema ... invalid rootpage`.

В этом проекте такие файлы от 20.10.2026 перенесены в
`server/storage/legacy-wal-2026-10-20/`. Их можно удалить, когда бэкап базы проверен.

## 10. Переезд боевого сервера со SQLite (пошагово)

Сценарий: на сервере стоит старое AnythingLLM на SQLite, нужно перевести его на эту версию
с PostgreSQL, сохранив пользователей, чаты и файлы. Простой приложения неизбежен —
планируйте окно 30–60 минут.

### 10.1. Подготовка (за день до переезда)

- Docker 24+ и Compose v2 (`docker compose version`), 5–10 ГБ свободного места.
- Скачать с сервера копию `docker/.env` и `server/storage` (там `comkey`, документы, LanceDB).
- Проверить, что старый контейнер запускается через compose, а не голым `docker run`
  (`docker inspect <container> --format '{{json .Mounts}}'`). Если storage — named volume,
  либо перенесите compose на bind-mount `../server/storage`, либо скопируйте данные
  `docker cp` в `server/storage`.
- Не менять `SIG_KEY`/`SIG_SALT`: без них не расшифруются сохранённые секреты.

### 10.2. Регламент на сервере (Linux)

```bash
# 1. каталог стенда
cd /opt/anything-llm
cd docker && docker compose ps

# 2. бэкап данных и старого образа
cd ..
tar czf /root/anythingllm-before-pg-$(date +%F).tar.gz docker/.env server/storage
docker tag anythingllm-anything-llm:latest anythingllm-anything-llm:pre-pg

# 3. остановить старое приложение (важно: до импорта оно не должно работать)
cd docker
docker compose down || docker stop anythingllm
ls -la ../server/storage/anythingllm.db*

# 4. обновить код
cd ..
git fetch --all && git checkout <ветка> && git pull

# 5. настроить docker/.env
#    добавить POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB и DATABASE_URL без кавычек,
#    AUTH_TOKEN и JWT_SECRET; SIG_KEY/SIG_SALT оставить как были.
#    openssl rand -hex 24  — для пароля и секретов
nano docker/.env

# 6. собрать образ и поднять пустую базу
cd docker
docker compose build anything-llm
docker compose up -d postgres
docker compose ps                     # postgres должен стать healthy

# 7. одноразовый импорт (приложение ещё не запущено)
docker compose run --rm -T --entrypoint /bin/bash anything-llm \
  -c "cd /app/server && yarn migrate:sqlite2pg"

# 8. запуск и проверка
docker compose up -d anything-llm
docker compose logs -f anything-llm
curl -s http://127.0.0.1:3001/api/ping
```

Нюансы:

- `-T` у `docker compose run` нужен при запуске по SSH/cron без TTY.
- Если импорт прервался на середине, повторный запуск требует `-- --force` (скрипт
  очистит непустые таблицы перед заливкой).
- `-wal`/`-shm` рядом с `.db` можно оставлять только если это журнал **этого же** файла.
  Если `.db` подменяли копией из бэкапа — sidecar-файлы убрать (раздел 9).
- Импорт не трогает `server/storage`: документы и векторы остаются на месте.
- Пароли пользователей переносятся в виде bcrypt-хешей и продолжают работать.
  Сессии сбросятся (все входят заново), если `JWT_SECRET` отличается от старого;
  чтобы сохранить сессии — перенесите прежний `JWT_SECRET` без изменений.
- Если на сервере мало RAM (1–2 ГБ), фронтенд-сборка может не пройти: соберите образ
  на другой машине и перенесите его через `docker save` / `docker load`.

### 10.3. Если на сервере уже есть свой PostgreSQL

Встроенный контейнер можно не использовать:

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE anythingllm LOGIN PASSWORD 'длинный-пароль';
CREATE DATABASE anythingllm OWNER anythingllm;
SQL
```

- в `DATABASE_URL` укажите адрес этого сервера (`host.docker.internal` уже прописан
  в `extra_hosts`, либо LAN-IP);
- разрешите подключения в `pg_hba.conf` для docker-подсети (`172.16.0.0/12`) и
  `listen_addresses`;
- запускайте только приложение, без встроенной базы:

  ```bash
  docker compose up -d --no-deps anything-llm
  docker compose run --rm -T --no-deps --entrypoint /bin/bash anything-llm \
    -c "cd /app/server && yarn migrate:sqlite2pg"
  ```

- бэкапы делайте средствами серверного PostgreSQL, а не `docker exec anythingllm-postgres`.

### 10.4. Переезд на новый сервер

1. Разверните репозиторий и `.env` на новом сервере, перенесите архив `server/storage`
   (вместе с `anythingllm.db` и `comkey`).
2. Выполните шаги 5–7 из 10.2 на новом сервере.
3. Проверьте вход и данные, затем переключите DNS/обратный прокси на новый хост.
4. Старый сервер остановите, но не удаляйте 2–4 недели.

### 10.5. Чек-лист после переключения

- вход администратора работает, список пространств и последние чаты на месте;
- документы открываются, эмбеддинги не пересчитывались;
- `select count(*) from _prisma_migrations;` = 1, `select count(*) from users;` совпадает;
- сделан первый `pg_dump` (раздел 7), настроен ежедневный бэкап;
- старый `anythingllm.db` сохранён как резерв (не удалять минимум месяц).

## 11. Откат на SQLite

Быстрый откат возможен, пока старая копия кода и файл базы сохранены:

1. `docker compose down` в `docker/`.
2. Вернуть старый код (`git checkout <коммит до переезда>`), старый `docker/.env`
   и тег образа: `docker tag anythingllm-anything-llm:pre-pg anythingllm-anything-llm:latest`.
3. Убедиться, что `server/storage/anythingllm.db` на месте и к нему нет чужих sidecar-файлов.
4. `docker compose up -d --build`.

Помните: всё, что было записано в Postgres после переключения, в SQLite-файле отсутствует.
Если после переезда прошло много времени, откат без потерь уже невозможен — нужен
экспорт данных обратно в SQLite (скрипта пока нет).
