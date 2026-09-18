import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { TicketScanner } from "@/components/admin/ticket-scanner";

export default async function TicketScanPage() {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "payments.verify")) notFound();
  return (
    <div className="mx-auto w-full min-w-0 max-w-lg space-y-5">
      <Link
        href="/admin/tickets"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Tickets
      </Link>
      <AdminPageHeader title="Event check-in" />
      <TicketScanner />
    </div>
  );
}
