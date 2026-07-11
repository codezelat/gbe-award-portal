import { redirect } from "next/navigation";

export default async function ApplicationMessagesPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  redirect(`/portal/messages?applicationId=${applicationId}`);
}
