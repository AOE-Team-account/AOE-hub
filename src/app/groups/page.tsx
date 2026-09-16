import { listGroups, listMyGroupIds } from "@/lib/data/groups";
import { GroupsClient } from "./GroupsClient";

export default async function GroupsPage() {
  const [groups, myGroupIds] = await Promise.all([listGroups(), listMyGroupIds()]);
  return <GroupsClient groups={groups} myGroupIds={myGroupIds} />;
}
