import net from "node:net";

// A tiny client for clamd's INSTREAM command: the file is streamed to the
// scanner in chunks, never saved by us. Protocol: "zINSTREAM\0", then for each
// chunk a 4-byte big-endian length + the bytes, then a zero length to end.
// The reply is "stream: OK", "stream: <Name> FOUND" or an ERROR line.

const HOST = process.env.CLAMD_HOST || "127.0.0.1";
const PORT = Number(process.env.CLAMD_PORT || 3310);

function connect(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: HOST, port: PORT });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("clamd connect timeout")); }, timeoutMs);
    socket.once("connect", () => { clearTimeout(timer); resolve(socket); });
    socket.once("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

/** One-line commands (PING, VERSION). */
export async function command(cmd, timeoutMs = 5000) {
  const socket = await connect(timeoutMs);
  return new Promise((resolve, reject) => {
    let out = "";
    socket.setTimeout(timeoutMs, () => { socket.destroy(); reject(new Error("clamd timeout")); });
    socket.on("data", (d) => { out += d.toString("utf8"); });
    socket.on("end", () => resolve(out.replace(/\0/g, "").trim()));
    socket.on("error", reject);
    socket.write(`z${cmd}\0`);
  });
}

export async function isReady() {
  try { return (await command("PING", 2000)) === "PONG"; } catch { return false; }
}

export async function waitUntilReady(timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isReady()) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Scans an async iterable of Buffers. Returns { status: "clean" | "flagged" | "error", signature?, message? }.
 */
export async function scanStream(chunks) {
  const socket = await connect();
  let reply = "";
  let ended = false;
  const done = new Promise((resolve, reject) => {
    socket.on("data", (d) => { reply += d.toString("utf8"); });
    socket.on("end", () => { ended = true; resolve(); });
    socket.on("close", () => resolve());
    socket.on("error", (e) => { if (!ended) reject(e); });
  });
  const write = (buf) => new Promise((resolve, reject) => {
    if (socket.destroyed) return reject(new Error("clamd closed the connection"));
    const ok = socket.write(buf, (err) => (err ? reject(err) : undefined));
    if (ok) resolve(); else socket.once("drain", resolve);
  });
  try {
    await write(Buffer.from("zINSTREAM\0"));
    for await (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i += 1024 * 1024) {
        const part = chunk.subarray(i, Math.min(chunk.length, i + 1024 * 1024));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        await write(Buffer.concat([len, part]));
      }
    }
    await write(Buffer.alloc(4)); // zero length: end of stream
    await done;
  } catch (err) {
    // clamd may have answered (for example "size limit exceeded") and hung up before we finished writing.
    if (!reply) { socket.destroy(); return { status: "error", message: err instanceof Error ? err.message : String(err) }; }
  } finally {
    socket.destroy();
  }
  const text = reply.replace(/\0/g, "").trim();
  const found = text.match(/^stream:\s*(.+?)\s+FOUND$/);
  if (found) return { status: "flagged", signature: found[1] };
  if (/^stream:\s*OK$/.test(text)) return { status: "clean" };
  return { status: "error", message: text || "No answer from the scanner engine." };
}
