import os
from typing import List, Dict, Any
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import CrossEncoder

MODEL_NAME = os.environ.get("RERANKER_MODEL", "BAAI/bge-reranker-base")
PORT = int(os.environ.get("RERANKER_PORT", "8001"))

app = FastAPI(title="Meeting Assistant Reranker")
model = CrossEncoder(MODEL_NAME)

class Document(BaseModel):
    id: str
    text: str
    metadata: Dict[str, Any] | None = None
    score: float | None = None

class RerankRequest(BaseModel):
    query: str
    documents: List[Document]

class RerankResult(BaseModel):
    id: str
    score: float

class RerankResponse(BaseModel):
    results: List[RerankResult]

@app.post("/rerank", response_model=RerankResponse)
def rerank(payload: RerankRequest):
    pairs = [(payload.query, doc.text) for doc in payload.documents]
    scores = model.predict(pairs)
    results = [
        {"id": doc.id, "score": float(score)}
        for doc, score in zip(payload.documents, scores)
    ]
    results.sort(key=lambda item: item["score"], reverse=True)
    return {"results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
