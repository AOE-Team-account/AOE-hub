import { listFilePosts } from "@/lib/data/files";
import { getUserById } from "@/lib/data/users";
import type { User } from "@/lib/types";
import { FileBoardClient } from "./FileBoardClient";

export default async function FileBoardPage() {
  const files = await listFilePosts();

  const authorIds = [...new Set(files.map((f) => f.authorId))];
  const authorEntries = await Promise.all(authorIds.map(async (id) => [id, await getUserById(id)] as const));
  const authors: Record<string, User | undefined> = Object.fromEntries(authorEntries);

  return <FileBoardClient files={files} authors={authors} />;
}
