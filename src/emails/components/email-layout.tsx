import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
export function EmailLayout({
  preview,
  title,
  children,
  action,
}: {
  preview: string;
  title: string;
  children: React.ReactNode;
  action?: { label: string; url: string };
}) {
  return (
    <Html lang="en-GB">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#f8f6f1",
          fontFamily: "Arial,sans-serif",
          color: "#171713",
          padding: "32px 12px",
        }}
      >
        <Container
          style={{
            backgroundColor: "#fffdf8",
            border: "1px solid #e8e5dd",
            borderRadius: 18,
            maxWidth: 600,
            overflow: "hidden",
          }}
        >
          <Section
            style={{
              padding: "28px 36px 18px",
              borderBottom: "1px solid #e8e5dd",
            }}
          >
            <Text
              style={{
                color: "#9b6d20",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.16em",
                margin: 0,
              }}
            >
              GBE AWARDS · 2026 PORTAL
            </Text>
            <Heading
              style={{
                fontFamily: "Georgia,serif",
                fontSize: 34,
                lineHeight: 1.1,
                margin: "14px 0 0",
              }}
            >
              {title}
            </Heading>
          </Section>
          <Section style={{ padding: "28px 36px" }}>
            {children}
            {action ? (
              <Button
                href={action.url}
                style={{
                  backgroundColor: "#171713",
                  borderRadius: 12,
                  color: "#fffdf8",
                  display: "inline-block",
                  fontWeight: 600,
                  marginTop: 18,
                  padding: "14px 22px",
                }}
              >
                {action.label}
              </Button>
            ) : null}
            <Hr style={{ borderColor: "#e8e5dd", margin: "30px 0 20px" }} />
            <Text style={{ color: "#747168", fontSize: 13, lineHeight: 1.6 }}>
              Global Business Excellence Awards · Need help? Reply to this email
              or contact info@gbeaward.com.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
