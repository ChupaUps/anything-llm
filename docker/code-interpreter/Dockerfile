# Sandboxed Python runtime for the AnythingLLM "code-interpreter" agent skill.
# Started with no network, a read-only root filesystem, dropped capabilities and
# a tmpfs /work - see docker/docker-compose.yml.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    SANDBOX_WORK_ROOT=/work \
    SANDBOX_SOCKET=/sock/ci.sock

# Fonts so matplotlib output is not full of missing-glyph boxes.
RUN apt-get update && \
    apt-get install -yq --no-install-recommends fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*

COPY docker/code-interpreter/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# plt.show() -> figure-<n>.png when agents forget to call savefig().
COPY docker/code-interpreter/hooks/sitecustomize.py \
    /usr/local/lib/python3.12/site-packages/sitecustomize.py

RUN groupadd -g 10001 sandbox && \
    useradd -l -u 10001 -g sandbox -M -d /work -s /usr/sbin/nologin sandbox && \
    mkdir -p /work /sock /opt/sandbox && \
    chown -R 10001:10001 /work /sock /opt/sandbox && \
    chmod 0777 /work /sock

COPY docker/code-interpreter/server.py /opt/sandbox/server.py
COPY docker/code-interpreter/launcher.py /opt/sandbox/launcher.py

USER 10001:10001
WORKDIR /work
EXPOSE 8080

ENTRYPOINT ["python", "-I", "-B", "/opt/sandbox/server.py"]
