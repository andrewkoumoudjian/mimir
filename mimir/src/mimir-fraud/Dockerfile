FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential cargo rustc && \
    rm -rf /var/lib/apt/lists/*

COPY packages/mimir-core ./packages/mimir-core
COPY packages/xfraud-ml ./packages/xfraud-ml
COPY packages/synthetic-pipeline ./packages/synthetic-pipeline
COPY src/mimir-fraud ./src/mimir-fraud

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
      ./packages/mimir-core \
      ./packages/xfraud-ml \
      ./packages/synthetic-pipeline \
      ./src/mimir-fraud

EXPOSE 8787

CMD ["mimir", "serve", "--host", "0.0.0.0", "--port", "8787", "--input", "/data/transactions.csv", "--output-dir", "/output"]
