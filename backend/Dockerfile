FROM python:3.11

WORKDIR /app

COPY requirements.txt .

# Long timeout + retries so large downloads (PyTorch) survive slow connections.
# CPU-only PyTorch is much smaller than the default build and is all the embedding model needs.
RUN pip install --default-timeout=300 --retries 10 torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --default-timeout=300 --retries 10 -r requirements.txt

# Pre-download the embedding model so first-run startup is instant
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
