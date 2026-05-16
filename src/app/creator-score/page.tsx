import { requireUser } from "@/lib/require-user";
import CreatorScoreForm from "./CreatorScoreForm";

export const dynamic = "force-dynamic";

export default async function CreatorScorePage() {
  await requireUser();
  return <CreatorScoreForm />;
}
