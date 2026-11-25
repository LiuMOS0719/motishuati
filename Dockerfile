FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive TZ=Asia/Shanghai
# 换清华源（只改 deb822 的 ubuntu.sources）
RUN sed -i 's@http://archive.ubuntu.com/ubuntu@https://mirrors.tuna.tsinghua.edu.cn/ubuntu@g; \
            s@http://security.ubuntu.com/ubuntu@https://mirrors.tuna.tsinghua.edu.cn/ubuntu@g' \
            /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null || true
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY app/ /app/
ENV DATA_DIR=/data PORT=8090 PYTHONUNBUFFERED=1
EXPOSE 8090
CMD ["sh","-c","python3 /app/import.py && exec python3 /app/server.py"]
