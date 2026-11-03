# DQN model service (serve.py). Build from the model/ folder:  docker build -t smartsignal-model ./model
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements-serve.txt .
# CPU-only PyTorch (much smaller than the default CUDA build), then numpy
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple torch \
    && pip install --no-cache-dir -r requirements-serve.txt

COPY serve.py dqn_agent.py ./
COPY results/models/dqn_last.pt results/models/dqn_last.pt

RUN useradd --system --no-create-home app && chown -R app /app
USER app

EXPOSE 5001
# serve.py defaults to 127.0.0.1; inside a container it must listen on all interfaces.
# It is NOT published to the host in docker-compose.yml: only the backend container can reach it.
HEALTHCHECK --interval=10s --timeout=5s --retries=6 --start-period=15s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5001/health', timeout=3).status==200 else 1)"
CMD ["python", "serve.py", "--host", "0.0.0.0", "--port", "5001", "--quiet"]
