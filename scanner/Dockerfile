# AOEhub virus scanner: ClamAV (clamd + freshclam) with the free extra signature
# sources from clamav-unofficial-sigs, plus a small Node service that streams
# files from storage into the engine.
# Stage 1: install the service's few JavaScript dependencies.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: ClamAV with the extra signature sources, plus the Node runtime and our service.
FROM ghcr.io/extremeshok/clamav-unofficial-sigs:latest
USER root
COPY --from=deps /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.mjs clamd.mjs storage.mjs ./
COPY start.sh /app/start.sh

# Limits and extra checks for the engine (applied by the base image's init).
# Files up to 2047 MB (ClamAV cannot scan 2 GiB or more) are scanned in full; anything the engine cannot
# fully inspect (too big, too deeply nested, encrypted archives) is reported as
# a problem instead of being let through.
ENV CLAMD_CONF_StreamMaxLength=2047M \
    CLAMD_CONF_MaxFileSize=2047M \
    CLAMD_CONF_MaxScanSize=4000M \
    CLAMD_CONF_MaxRecursion=12 \
    CLAMD_CONF_MaxFiles=10000 \
    CLAMD_CONF_MaxThreads=4 \
    CLAMD_CONF_ReadTimeout=600 \
    CLAMD_CONF_CommandReadTimeout=60 \
    CLAMD_CONF_AlertExceedsMax=yes \
    CLAMD_CONF_AlertEncryptedArchive=yes \
    CLAMD_CONF_AlertOLE2Macros=yes \
    CLAMD_CONF_AlertBrokenExecutables=yes \
    CLAMD_CONF_DetectPUA=yes \
    CLAMD_CONF_HeuristicAlerts=yes \
    CLAMD_CONF_ScanPDF=yes \
    CLAMD_CONF_ScanOLE2=yes \
    CLAMD_CONF_ScanArchive=yes \
    CLAMD_CONF_PhishingSignatures=yes \
    CLAMD_CONF_PhishingScanURLs=yes \
    CUS_UPDATE_HOURS=4 \
    PORT=8080

EXPOSE 8080
ENTRYPOINT ["/app/start.sh"]
