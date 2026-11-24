import "server-only";
import { GameZipError, inspectGameZip } from "@/lib/games";
import { uploadToR2, deleteFromR2Prefix, getR2Object } from "@/lib/storage/r2";

// Unpacking a game holds the zip (up to 50 MB) and its files (up to 150 MB) in
// memory. Only one game is looked at or unpacked at a time in this server
// process, so a few uploads at once cannot use up a small host's memory
// (AOE-SEC-11). Others wait their turn.
let chain: Promise<unknown> = Promise.resolve();
export function oneGameAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/** Checks a game zip without unpacking it anywhere. Throws GameZipError for an unsafe zip. */
export function checkGameZip(read: () => Promise<Buffer>): Promise<boolean> {
  return oneGameAtATime(async () => inspectGameZip(await read()) !== null);
}

/**
 * Unpacks a game from its stored, already-scanned copy in the main bucket (the
 * exact bytes the scanner checked and promoted; AOE-SEC-01), into
 * games/<assetId>/. Returns the prefix, or null when the zip is not a playable
 * game or could not be unpacked (it then stays an ordinary download).
 */
export function unpackScannedGame(assetId: string, finalKey: string): Promise<string | null> {
  return oneGameAtATime(async () => {
    const prefix = `games/${assetId}/`;
    try {
      const obj = await getR2Object(finalKey);
      const zip = Buffer.from(await obj.Body!.transformToByteArray());
      const plan = inspectGameZip(zip);
      if (!plan) return null;
      const queue = [...plan];
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          for (let f = queue.shift(); f; f = queue.shift()) await uploadToR2(prefix + f.path, Buffer.from(f.data), f.mime);
        })
      );
      return prefix;
    } catch (err) {
      if (!(err instanceof GameZipError)) console.error("Could not unpack the game:", err instanceof Error ? err.message : err);
      await deleteFromR2Prefix(prefix).catch(() => undefined);
      return null;
    }
  });
}
