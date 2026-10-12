import re
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
HEADING_RE = re.compile(
    r"^\s*(?P<number>(?:section\s+)?(?:\d+(?:\.\d+)*|[A-Z]|[IVXLCDM]+)[.):]?)\s+.+$",
    re.IGNORECASE,
)
model: SentenceTransformer | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model
    model = SentenceTransformer(MODEL_NAME)
    yield
    model = None


app = FastAPI(title="Contract Clause Embedding Service", lifespan=lifespan)


class ProcessContractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2_000_000)


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=128)


def segment_clauses(text: str) -> list[dict[str, str]]:
    """Split contract text at numbered headings, falling back to blank lines."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    lines = normalized.splitlines()
    starts = [index for index, line in enumerate(lines) if HEADING_RE.match(line)]
    if starts:
        chunks: list[tuple[str, str]] = []
        if starts[0] > 0:
            preamble = "\n".join(lines[: starts[0]]).strip()
            if preamble:
                chunks.append(("Preamble", preamble))
        for position, start in enumerate(starts):
            end = starts[position + 1] if position + 1 < len(starts) else len(lines)
            block = "\n".join(lines[start:end]).strip()
            match = HEADING_RE.match(lines[start])
            number = match.group("number").strip() if match else str(position + 1)
            if block:
                chunks.append((number, block))
    else:
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n+", normalized) if part.strip()]
        chunks = [(str(index), paragraph) for index, paragraph in enumerate(paragraphs, start=1)]

    return [{"clause_number": number, "clause_text": content} for number, content in chunks]


def encode_texts(texts: list[str]) -> list[list[float]]:
    if model is None:
        raise RuntimeError("Embedding model is not ready")
    vectors = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return [[float(value) for value in vector] for vector in vectors]


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": MODEL_NAME, "model_loaded": model is not None}


@app.post("/embed")
def embed(request: EmbedRequest) -> dict[str, Any]:
    texts = [value.strip() for value in request.texts]
    if any(not value for value in texts):
        raise HTTPException(status_code=422, detail="Each text must contain non-whitespace characters")
    try:
        embeddings = encode_texts(texts)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"model": MODEL_NAME, "dimension": 384, "embeddings": embeddings}


@app.post("/process-contract")
def process_contract(request: ProcessContractRequest) -> dict[str, Any]:
    clauses = segment_clauses(request.text)
    if not clauses:
        raise HTTPException(status_code=422, detail="No contract text was provided")
    try:
        embeddings = encode_texts([clause["clause_text"] for clause in clauses])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    result = [
        {**clause, "embedding": embedding}
        for clause, embedding in zip(clauses, embeddings, strict=True)
    ]
    return {"model": MODEL_NAME, "dimension": 384, "clauses": result}
