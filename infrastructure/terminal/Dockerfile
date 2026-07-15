FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    TERM=xterm-256color

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    dnsutils \
    file \
    iproute2 \
    iputils-ping \
    jq \
    less \
    nano \
    net-tools \
    procps \
    python3 \
    tcpdump \
    telnet \
    traceroute \
    vim \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /root

CMD ["sleep", "infinity"]
