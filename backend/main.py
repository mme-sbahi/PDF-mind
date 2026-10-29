import io
import os
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader
import chromadb
from openai import OpenAI
from sentence_transformers import SentenceTransformer

# ── Configuration ─────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
EMBED_MODEL  = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")

CHROMA_HOST = os.getenv("CHROMA_HOST")
CHROMA_PORT = os.getenv("CHROMA_PORT", "8000")

# Global singletons
chroma_client    = None
collection       = None
embedding_model  = None
groq_client      = None

# ── Startup / Shutdown ────────────────────────────────────────────────────────

def init_groq():
    global groq_client
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY environment variable is not set. "
            "Get your key at https://console.groq.com/"
        )
    groq_client = OpenAI(
        api_key=GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
    )
    print(f"✅ Groq client initialised (model: {GROQ_MODEL})")


def init_embeddings():
    global embedding_model
    print(f"⏳ Loading embedding model '{EMBED_MODEL}' (may take a moment on first run)...")
    embedding_model = SentenceTransformer(EMBED_MODEL)
    print(f"✅ Embedding model '{EMBED_MODEL}' loaded.")


def init_chroma():
    global chroma_client, collection
    if CHROMA_HOST:
        retries = 20
        while retries > 0:
            try:
                chroma_client = chromadb.HttpClient(host=CHROMA_HOST, port=int(CHROMA_PORT))
                collection = chroma_client.get_or_create_collection(
                    name="pdf_documents",
                    metadata={"hnsw:space": "cosine"},
                )
                print("✅ Connected to ChromaDB server.")
                return
            except Exception as e:
                retries -= 1
                if retries == 0:
                    print(f"❌ Could not connect to ChromaDB after 20 attempts: {e}")
                    raise e
                print(f"⏳ ChromaDB not ready — retrying in 3 s… ({retries} left)")
                time.sleep(3)
    else:
        CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
        chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        collection = chroma_client.get_or_create_collection(
            name="pdf_documents",
            metadata={"hnsw:space": "cosine"},
        )
        print("✅ Connected to local ChromaDB persistent storage.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting up…")
    init_chroma()
    init_embeddings()
    init_groq()
    yield
    print("🛑 Shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="RAG PDF Q&A — Groq + ChromaDB", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Embed a list of strings using the local SentenceTransformer model."""
    try:
        vecs = embedding_model.encode(texts, show_progress_bar=False)
        return vecs.tolist()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")


def get_embedding(text: str) -> list[float]:
    return get_embeddings([text])[0]


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    chunks, start = [], 0
    text_len = len(text)
    if text_len == 0:
        return chunks
    while start < text_len:
        chunk = text[start : start + chunk_size].strip()
        if chunk:
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


def extract_and_chunk_pdf(pdf_bytes: bytes, filename: str) -> list[dict]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    all_chunks = []
    for page_idx, page in enumerate(reader.pages):
        extracted = page.extract_text()
        if not extracted or not extracted.strip():
            continue
        for chunk in chunk_text(extracted):
            all_chunks.append({
                "text": chunk,
                "page": page_idx + 1,
                "filename": filename,
            })
    return all_chunks

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "RAG PDF Q&A API is running. Upload PDFs at /upload and ask at /chat."}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    try:
        content = await file.read()
        chunks  = extract_and_chunk_pdf(content, file.filename)
        if not chunks:
            raise HTTPException(status_code=400, detail="PDF contains no extractable text.")

        documents = [c["text"]     for c in chunks]
        metadatas = [{"page": c["page"], "filename": c["filename"]} for c in chunks]
        ids       = [f"{file.filename}_p{c['page']}_{i}_{uuid.uuid4().hex[:6]}" for i, c in enumerate(chunks)]
        embeddings = get_embeddings(documents)

        collection.add(documents=documents, embeddings=embeddings, metadatas=metadatas, ids=ids)

        return {
            "filename": file.filename,
            "status": "success",
            "message": f"Indexed {len(chunks)} chunks from '{file.filename}'.",
            "chunk_count": len(chunks),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {e}")


@app.post("/query")
@app.post("/chat")
async def query_pdf(request: QueryRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    try:
        query_embedding = get_embedding(question)
        results = collection.query(query_embeddings=[query_embedding], n_results=5)

        retrieved_docs  = results.get("documents", [[]])[0]
        retrieved_metas = results.get("metadatas",  [[]])[0]

        if not retrieved_docs:
            return {
                "answer": "I couldn't find any matching context. Please upload and index a PDF first.",
                "sources": [],
            }

        sources = [
            {
                "page":     meta.get("page", 1),
                "filename": meta.get("filename", "unknown"),
                "text":     doc,
            }
            for doc, meta in zip(retrieved_docs, retrieved_metas)
        ]

        context_str = "\n---\n".join(s["text"] for s in sources)
        prompt = (
            'Answer ONLY using the context below.\n'
            'If the answer is not in the context, say "I don\'t know".\n\n'
            f'Context:\n{context_str}\n\n'
            f'Question:\n{question}\n'
        )

        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
        answer = response.choices[0].message.content

        return {"answer": answer, "sources": sources}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process query: {e}")


@app.post("/clear")
async def clear_database():
    global collection
    try:
        try:
            chroma_client.delete_collection("pdf_documents")
        except Exception:
            pass
        collection = chroma_client.get_or_create_collection(
            name="pdf_documents",
            metadata={"hnsw:space": "cosine"},
        )
        return {"status": "success", "message": "ChromaDB collection cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear database: {e}")


@app.get("/documents")
async def list_documents():
    try:
        results   = collection.get(include=["metadatas"])
        metadatas = results.get("metadatas", [])
        unique    = {m["filename"] for m in metadatas if m and "filename" in m}
        return {"documents": list(unique)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {e}")


@app.delete("/documents/{filename}")
async def delete_document(filename: str):
    try:
        collection.delete(where={"filename": filename})
        return {"status": "success", "message": f"Deleted '{filename}' from ChromaDB."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete '{filename}': {e}")
