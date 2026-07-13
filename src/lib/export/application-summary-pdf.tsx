import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

export type ApplicationSummaryData = {
  reference: string;
  nomineeName: string;
  designation?: string | null;
  awardNomination: string;
  businessWebsite?: string | null;
  email: string;
  phone: string;
  category: string;
  workflowStatus: string;
  paymentStatus: string;
  submittedAt: string;
  generatedAt: string;
};

const styles = StyleSheet.create({
  page: {
    padding: "46 48 52",
    backgroundColor: "#f8f6f1",
    color: "#171713",
    fontFamily: "Noto Sans",
    fontSize: 10,
    borderTop: "12 solid #9d7d3f",
  },
  eyebrow: { color: "#9d7d3f", fontSize: 9, fontWeight: 700 },
  title: { fontSize: 28, fontWeight: 700, marginTop: 24 },
  reference: { color: "#45443e", fontSize: 12, fontWeight: 700, marginTop: 7 },
  meta: { color: "#747168", fontSize: 8, marginTop: 5 },
  rule: { borderBottom: "1 solid #e8e5dd", marginVertical: 22 },
  nominee: { fontSize: 19, fontWeight: 700 },
  category: { color: "#45443e", fontSize: 10.5, marginTop: 7 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 24 },
  field: {
    width: "50%",
    minHeight: 78,
    paddingRight: 20,
    paddingBottom: 18,
    marginBottom: 14,
    borderBottom: "1 solid #e8e5dd",
  },
  label: { color: "#747168", fontSize: 8, fontWeight: 700, marginBottom: 8 },
  value: { fontSize: 10.5, lineHeight: 1.45 },
  note: {
    backgroundColor: "#f4ecd8",
    border: "1 solid #9d7d3f",
    marginTop: 10,
    padding: 16,
  },
  noteTitle: {
    color: "#9d7d3f",
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 8,
  },
  noteBody: { color: "#45443e", fontSize: 9.5, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 28,
    color: "#747168",
    fontSize: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={styles.value}>{value || "Not provided"}</Text>
    </View>
  );
}

export async function buildApplicationSummaryPdf(input: {
  data: ApplicationSummaryData;
  regularFontPath: string;
  boldFontPath: string;
}) {
  Font.register({
    family: "Noto Sans",
    fonts: [
      { src: input.regularFontPath, fontWeight: 400 },
      { src: input.boldFontPath, fontWeight: 700 },
    ],
  });
  const data = input.data;
  return renderToBuffer(
    <Document
      title={`GBE Awards application summary - ${data.reference}`}
      author="Global Business Excellence Awards"
      subject="Applicant-authorised nomination summary"
      creator="GBE Awards Portal"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>GLOBAL BUSINESS EXCELLENCE AWARDS</Text>
        <Text style={styles.title}>Application summary</Text>
        <Text style={styles.reference}>{data.reference}</Text>
        <Text style={styles.meta}>Generated {data.generatedAt}</Text>
        <View style={styles.rule} />
        <Text style={styles.nominee}>{data.nomineeName}</Text>
        <Text style={styles.category}>{data.category}</Text>
        <View style={styles.grid}>
          <Field label="Designation" value={data.designation} />
          <Field label="Award nomination" value={data.awardNomination} />
          <Field label="Primary email" value={data.email} />
          <Field label="Telephone" value={data.phone} />
          <Field label="Business website" value={data.businessWebsite} />
          <Field label="Submitted" value={data.submittedAt} />
          <Field label="Application status" value={data.workflowStatus} />
          <Field label="Payment status" value={data.paymentStatus} />
        </View>
        <View style={styles.note}>
          <Text style={styles.noteTitle}>ABOUT THIS SUMMARY</Text>
          <Text style={styles.noteBody}>
            This system-generated summary reflects the applicant-visible
            nomination record at the time shown above. It is not a payment
            receipt, judging certificate or public award result.
          </Text>
        </View>
        <View style={styles.footer} fixed>
          <Text>Global Business Excellence Awards · info@gbeaward.com</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>,
  );
}
