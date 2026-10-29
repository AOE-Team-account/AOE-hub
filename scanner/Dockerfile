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
COPY package.json server.mjs clamd.mjs storage.mjs inspect.mjs ./
COPY start.sh ignore-js-zip.sh /app/
RUN chmod +x /app/start.sh /app/ignore-js-zip.sh

# The Sanesecurity lists are only used when their signature checks out. The key that
# checks them is fetched and imported HERE, while the scanner is built, so the scanner
# never depends on downloading it at startup (a failed download there once made every
# Sanesecurity list get skipped). The build stops if the key cannot be imported.
RUN set -eux; \
    G=/var/lib/clamav-unofficial-sigs/gpg-key; mkdir -p "$G"; \
    curl -fsSL --retry 6 --retry-delay 3 https://www.sanesecurity.com/publickey.gpg -o "$G/publickey.gpg"; \
    gpg -q --no-options --no-default-keyring --homedir "$G" --keyring "$G/ss-keyring.gpg" --import "$G/publickey.gpg"; \
    test -s "$G/ss-keyring.gpg"; \
    gpg --no-options --no-default-keyring --homedir "$G" --keyring "$G/ss-keyring.gpg" --list-keys --with-fingerprint | tee /tmp/ss-key.txt; \
    grep -q '4E02 5A1C BA90 A065 3F38  D2D8 D691 DED9 31EA 4D9E' /tmp/ss-key.txt; \
    chown -R clamav:clamav /var/lib/clamav-unofficial-sigs 2>/dev/null || true

# Bake the extra signature lists in while the scanner is built, too. On Cloud Run the
# scanner only gets full processor power while it is handling a request, so downloading
# them in the background after a start is slow; with them already inside, every start has
# them from the first second and the background update only brings what is new.
# (This step is best-effort: if a download fails during the build, the build still works
# and the update at startup fills the gap.)
RUN printf 'user_configuration_complete="yes"\nenable_random="no"\nreload_dbs="yes"\nditekshen_enabled="yes"\n' > /etc/clamav-unofficial-sigs/user.conf; \
    bash /usr/local/sbin/clamav-unofficial-sigs.sh >/tmp/bake.log 2>&1 || true; \
    ls /var/lib/clamav | grep -E '\.(ndb|hdb|hsb|ldb|cdb|yara|ign2|db|fp)$' | wc -l | tee /tmp/baked-count.txt; \
    bash /app/ignore-js-zip.sh; \
    chown -R clamav:clamav /var/lib/clamav /var/lib/clamav-unofficial-sigs 2>/dev/null || true

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
