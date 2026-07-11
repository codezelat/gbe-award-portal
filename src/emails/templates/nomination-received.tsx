import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";
export function NominationReceivedEmail({
  name,
  reference,
}: {
  name: string;
  reference: string;
}) {
  return (
    <EmailLayout
      preview={`Nomination ${reference} received`}
      title="Nomination received"
    >
      <Text>Dear {name},</Text>
      <Text>
        Thank you. Your nomination has been received and is now in the GBE
        Awards administrative review queue.
      </Text>
      <Text
        style={{
          backgroundColor: "#f4ecd8",
          borderRadius: 10,
          fontFamily: "monospace",
          fontSize: 18,
          fontWeight: 700,
          padding: "14px 18px",
        }}
      >
        {reference}
      </Text>
      <Text>
        No portal account has been created at this stage. If the nomination is
        approved, we will send a secure invitation separately.
      </Text>
    </EmailLayout>
  );
}
