import { listExperiencePosts } from "@/lib/data/experience";
import { getUserById } from "@/lib/data/users";
import type { User } from "@/lib/types";
import { ExperienceBoardClient } from "./ExperienceBoardClient";

export default async function ExperienceBoardPage() {
  const posts = await listExperiencePosts();

  const authorIds = [...new Set(posts.map((p) => p.authorId))];
  const authorEntries = await Promise.all(authorIds.map(async (id) => [id, await getUserById(id)] as const));
  const authors: Record<string, User | undefined> = Object.fromEntries(authorEntries);

  return <ExperienceBoardClient posts={posts} authors={authors} />;
}
