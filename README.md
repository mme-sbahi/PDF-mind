# PDFMind: Local RAG-Powered PDF Q&A

A full-stack, locally-deployable Retrieval-Augmented Generation (RAG) application for intelligent question-answering over PDF documents. Powered by **Groq LLMs**, **ChromaDB** vector embeddings, and a sleek **React** frontend.

##  What It Does

PDFMind enables you to upload PDF documents and ask natural language questions about their contents. The system:

- **Extracts & indexes** PDF text into a vector database (ChromaDB)
- **Retrieves** semantically relevant sections using embeddings
- **Generates** accurate answers using Groq's fast LLM inference
- **Cites sources** with exact page numbers and extracted text snippets

All processing happens locally—no data leaves your infrastructure.

##  Key Features

- **PDF Upload & Indexing**: Parse PDFs, chunk intelligently, and store embeddings in ChromaDB
- **Semantic Search**: Find the most relevant context for each question using `sentence-transformers`
- **Fast LLM Inference**: Powered by Groq's rapid API for sub-second response times
- **Beautiful UI**: Dark-themed React interface with real-time feedback and source citations
- **Source Attribution**: Every answer includes the source document, page number, and retrieved text
- **Document Management**: Upload, list, and delete indexed documents on the fly
- **Docker Compose Stack**: One-command deployment with all services pre-configured

##  Getting Started

### Prerequisites

- **Docker & Docker Compose** (for full-stack deployment)
- **Groq API Key** (free tier available at [console.groq.com](https://console.groq.com/))

### Quick Start

2. **Clone the repository:**
   ```bash
   git clone https://github.com/kid-ouis/pfdmind.git
   cd pfdmind
   ```
   1.  Set up environment variables:

    bash

    ```
    export GROQ_API_KEY="your-groq-api-key-here"

    ```

3.  Start the full stack:

    bash

    ```
    docker compose up --build

    ```

4.  Access the application:

    -   Frontend: [http://localhost:3000](http://localhost:3000/)
    -   Backend API: [http://localhost:8000](http://localhost:8000/)
    -   ChromaDB: [http://localhost:8001](http://localhost:8001/)


### Manual Setup (Without Docker)

Backend:


``` bash
cd backend
pip install -r requirements.txt
export GROQ_API_KEY="your-key"
export CHROMA_DB_PATH="./chroma_db"  # Local persistent storage
uvicorn main:app --host 0.0.0.0 --port 8000

```

Frontend:


```bash
cd frontend
npm install
npm run dev

```

Usage
-----

### Via Web UI

1.  Upload a PDF using the file picker in the sidebar
2.  Wait for indexing to complete (shown in the status panel)
3.  Ask questions in the chat input
4.  View answers with source citations and page references

### Via API

Upload a PDF:



```bash
curl -X POST http://localhost:8000/upload\
  -F "file=@document.pdf"

```

Ask a question:



```bash
curl -X POST http://localhost:8000/chat\
  -H "Content-Type: application/json"\
  -d '{"question": "What is the main topic of this document?"}'

```


Architecture
------------

Code

```
┌─────────────────────────────────────────────────────────┐
│ Frontend (React + TypeScript + Tailwind)                 │
│ - File upload interface                                  │
│ - Chat UI with source citations                          │
│ - Real-time status feedback                              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ HTTP
                   ▼
┌─────────────────────────────────────────────────────────┐
│ Backend (FastAPI + Python)                               │
│ - PDF extraction & chunking                              │
│ - Embedding generation (sentence-transformers)           │
│ - LLM orchestration (Groq)                               │
│ - Vector DB management (ChromaDB)                        │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   ┌─────────────┐    ┌──────────────┐
   │  ChromaDB   │    │   Groq API   │
   │  (Vectors)  │    │   (LLM)      │
   └─────────────┘    └──────────────┘

```

### Tech Stack

| Component | Technology | Role |
| --- | --- | --- |
| Frontend | React 18 + TypeScript | User interface & chat management |
| Backend | FastAPI + Uvicorn | REST API & request orchestration |
| Embeddings | sentence-transformers | Convert text to vectors |
| Vector DB | ChromaDB 0.5 | Store & retrieve embeddings |
| LLM | Groq (llama-3.1) | Generate answers from context |
| PDF Parser | pypdf | Extract text from PDFs |

Environment Variables
---------------------

### Backend

| Variable | Default | Description |
| --- | --- | --- |
| `GROQ_API_KEY` | Required | API key for Groq LLM access |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Groq model name |
| `EMBED_MODEL` | `all-MiniLM-L6-v2` | HuggingFace embedding model |
| `CHROMA_HOST` | (local mode) | ChromaDB server host |
| `CHROMA_PORT` | `8000` | ChromaDB server port |
| `CHROMA_DB_PATH` | `./chroma_db` | Local persistent storage path |

 Development
---------------

### Project Structure


```Code
pfdmind/
├── backend/
│   ├── main.py               # FastAPI app & endpoints
│   ├── requirements.txt       # Python dependencies
│   ├── Dockerfile            # Backend container
│   └── chroma_db/            # Local vector store (generated)
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main React component
│   │   └── main.tsx          # Entry point
│   ├── package.json          # Node dependencies
│   ├── Dockerfile            # Frontend container
│   └── tailwind.config.js    # Tailwind CSS config
├── docker-compose.yml        # Full-stack orchestration
└── README.md                 # This file
```
