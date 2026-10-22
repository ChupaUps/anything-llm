# AnythingLLM Storage

This folder is for the local or disk storage of ready-to-embed documents, vector-cached embeddings, and the disk-storage of LanceDB.

Relational data (workspaces, chats, users, settings, ...) no longer lives here: AnythingLLM stores it in PostgreSQL and connects via the `DATABASE_URL` environment variable. See `docker/.env.example` for the Docker Compose setup.

This folder should contain the following folders.
`documents`
`lancedb` (if using lancedb)
`vector-cache`

### Legacy SQLite database
If you are upgrading from an SQLite-based installation, the old `anythingllm.db` file (plus its `-wal`/`-shm` sidecars) can stay in this folder. It is only read once by the one-time importer:

- Docker: `docker compose run --rm --entrypoint /bin/bash anything-llm -c "cd /app/server && yarn migrate:sqlite2pg"`
- Bare metal: `yarn migrate:sqlite2pg` from the repo root (run after `DATABASE_URL` is configured)

Keep the file around as a rollback copy until you have verified that all data is present in PostgreSQL.


### Common issues
**`FILE_CANNOT_BE_OPENED` / permission errors** in the server log usually mean the node instance cannot write to this directory. To solve this..

- Local dev
  - Make sure the current user owns this directory: `mkdir -p server/storage/documents server/storage/vector-cache server/storage/lancedb`.

- Docker Instance
  - Get your AnythingLLM docker container id with `docker ps -a`. The container must be running to execute the next commands.
  - Run `docker container exec -u 0 -t <ANYTHINGLLM DOCKER CONTAINER ID> mkdir -p /app/server/storage /app/server/storage/documents /app/server/storage/vector-cache /app/server/storage/lancedb`
  - Run `docker container exec -u 0 -t <ANYTHINGLLM DOCKER CONTAINER ID> chown -R anythingllm:anythingllm /app/collector /app/server`

  - The above commands will create the appropriate folders inside of the docker container and will persist as long as you do not destroy the container and volume. This will also fix any ownership issues of folder files in the collector and the server.

- Database connection
  - If the server logs a Prisma error such as `Can't reach database server` or `Environment variable not found: DATABASE_URL`, check that PostgreSQL is running and that `DATABASE_URL` points to it (`postgres` hostname inside Docker Compose).