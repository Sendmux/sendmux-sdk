# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SENDMUX_MCP_HOST=0.0.0.0 \
    SENDMUX_MCP_PORT=8765 \
    SENDMUX_MCP_PATH=/mcp

WORKDIR /app

RUN addgroup --system sendmux && adduser --system --ingroup sendmux sendmux

COPY packages/python/core /app/packages/python/core
COPY packages/python/mcp /app/packages/python/mcp

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir /app/packages/python/core /app/packages/python/mcp \
    && rm -rf /app/packages

USER sendmux

EXPOSE 8765

CMD ["sendmux-mcp-hosted"]
