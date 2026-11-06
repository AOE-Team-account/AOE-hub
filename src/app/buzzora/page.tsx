import { listBuzzoraPosts } from "@/lib/data/experience";
import { BuzzoraBoardClient } from "./BuzzoraBoardClient";

// The Buzzora Board: news, laws and regulations about homeschooling and
// unschooling, collected daily from government sites and major news outlets.
export default async function BuzzoraPage() {
  const posts = await listBuzzoraPosts();
  return <BuzzoraBoardClient posts={posts} />;
}
