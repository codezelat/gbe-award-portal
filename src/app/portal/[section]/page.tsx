import { notFound } from "next/navigation";
import { LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
const sections: Record<string, { title: string; description: string }> = {
  documents: {
    title: "Documents",
    description:
      "Supporting documents, payment evidence and requested uploads linked to your application.",
  },
  payment: {
    title: "Payment",
    description:
      "Your current verification state and any requested replacement action.",
  },
  messages: {
    title: "Messages",
    description:
      "Official updates and replies between you and the GBE Awards team.",
  },
  profile: {
    title: "Profile",
    description:
      "Manage permitted profile and contact information without changing your official submitted nomination.",
  },
  security: {
    title: "Security",
    description: "Manage your password and active account sessions.",
  },
  help: {
    title: "Help",
    description:
      "Contact the GBE Awards concierge team for application or account assistance.",
  },
};
export default async function PortalSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const config = sections[section];
  if (!config) notFound();
  return (
    <>
      <h1 className="page-heading">{config.title}</h1>
      <p className="mt-2 max-w-2xl text-graphite">{config.description}</p>
      <section className="surface mt-7 rounded-lg p-6 md:p-8">
        <div className="flex items-start gap-4">
          <LockKeyhole className="text-antique-gold" />
          <div>
            <h2 className="text-lg font-semibold">Private account area</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Only information linked to your approved account is displayed
              here. Original nomination fields and submitted files remain
              protected.
            </p>
            <Button
              variant="outline"
              className="mt-5"
              render={<a href="mailto:info@gbeaward.com" />}
            >
              <Mail data-icon="inline-start" />
              Contact info@gbeaward.com
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
