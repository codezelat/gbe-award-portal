import { redirect } from "next/navigation";

export default async function ApplicationDocumentsPage() {
  redirect("/portal/documents");
}
