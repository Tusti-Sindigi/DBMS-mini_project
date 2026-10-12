# AI-Assisted Smart Contract Clause Risk Flagging System

DBMS course project for surfacing potentially risky contract clauses for human review. The system uses PostgreSQL with pgvector and a local pretrained embedding model. It flags candidates for review; it does not provide legal advice or decide whether a contract should be accepted.

## Team

- Tusti (PES1UG24CS505) — database, embeddings, and risk detection
- Ritu Ravish (PES1UG24CS928) — application, access control, and review workflow

## Track A files

- `database/schema.sql` — PostgreSQL/pgvector schema, similarity and risk-score functions, automatic flagging trigger, and vector indexes.
- `embedding_service/` — clause segmentation, local embedding API, and risk-library seed script.
- `docs/TRACK_A_HANDOFF.md` — ER diagram, database and service contracts, setup, and Track B integration notes.

## Track A setup

1. Create a PostgreSQL database with pgvector installed and available.
2. Set `DATABASE_URL` to the database connection string in your local environment.
3. Apply `database/schema.sql` using a PostgreSQL client.
4. Install the Python requirements with `pip install -r embedding_service/requirements.txt`.
5. Run `python -m embedding_service.seed_risk_library` to embed and load the example risk patterns.
6. Start the local service with `uvicorn embedding_service.app:app --host 127.0.0.1 --port 8001`.

The embedding model downloads the first time it starts. See [Track A handoff](docs/TRACK_A_HANDOFF.md) for endpoint formats, SQL interfaces, setup details, and integration notes. The `.env.example` file lists configuration names with placeholders only; create a local environment file and replace the placeholders with your own values.

