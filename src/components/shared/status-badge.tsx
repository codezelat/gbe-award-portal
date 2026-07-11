import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
const map: Record<string, { label: string; className: string }> = {
  submitted: { label: "Nomination received", className: "status-info" },
  under_review: { label: "Under review", className: "status-review" },
  changes_requested: { label: "Action required", className: "status-action" },
  resubmitted: { label: "Updates received", className: "status-info" },
  approved: { label: "Nomination approved", className: "status-success" },
  entry_confirmed: { label: "Entry confirmed", className: "status-success" },
  shortlisted: {
    label: "Shortlisted",
    className: "bg-[#f1eaf6] text-[#684780] border-[#dccde7]",
  },
  winner: {
    label: "Award winner",
    className: "bg-[#f6eed9] text-[#6d552b] border-[#e4d1a0]",
  },
  rejected: { label: "Not approved", className: "status-error" },
  proof_submitted: { label: "Proof submitted", className: "status-review" },
  verified: { label: "Verified", className: "status-success" },
  not_required: { label: "Not required", className: "status-info" },
};
export function StatusBadge({ status }: { status: string }) {
  const item = map[status] ?? {
    label: status.replaceAll("_", " "),
    className: "",
  };
  return (
    <Badge variant="outline" className={cn("capitalize", item.className)}>
      {item.label}
    </Badge>
  );
}
