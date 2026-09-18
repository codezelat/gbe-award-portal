import "server-only";
import React from "react";
import path from "node:path";
import {
  Document,
  Font,
  Image as PdfImage,
  Page,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import { formatInTimeZone } from "date-fns-tz";
import { publicEnv } from "@/lib/env";
import { getTicketBooking, TicketError } from "./tickets";

export async function buildGuestTicketPdf(id: string) {
  const { booking, tickets } = await getTicketBooking(id);
  if (
    !["paid", "issued"].includes(booking.status) ||
    tickets.length !== booking.quantity ||
    tickets.some((ticket) => ticket.voidedAt)
  )
    throw new TicketError("Tickets are not available for this booking.");
  Font.register({
    family: "Ticket Sans",
    src: path.join(
      process.cwd(),
      "node_modules",
      "@expo-google-fonts",
      "noto-sans",
      "400Regular",
      "NotoSans_400Regular.ttf",
    ),
  });
  const codes = await Promise.all(
    tickets.map((ticket) =>
      QRCode.toDataURL(
        new URL(
          `/admin/tickets/check-in/${ticket.id}`,
          publicEnv.NEXT_PUBLIC_APP_URL,
        ).href,
        { errorCorrectionLevel: "M", width: 500, margin: 2 },
      ),
    ),
  );
  const detailed =
    booking.eventTitle.length +
      booking.name.length +
      booking.venue.length +
      booking.email.length +
      (booking.businessName?.length ?? 0) >
    450;
  return renderToBuffer(
    <Document
      title={`${booking.eventTitle} guest tickets`}
      author="GBE Awards"
      creationDate={booking.confirmedAt ?? booking.createdAt}
      modificationDate={booking.confirmedAt ?? booking.createdAt}
    >
      {tickets.map((ticket, i) => (
        <Page
          key={ticket.id}
          size={detailed ? "A4" : "A5"}
          wrap={false}
          style={{
            padding: 30,
            paddingBottom: 95,
            fontFamily: "Ticket Sans",
            color: "#171713",
            backgroundColor: "#fffdf8",
            fontSize: 10,
          }}
        >
          <Text style={{ color: "#76591f", fontSize: 9, letterSpacing: 2 }}>
            GBE AWARDS
          </Text>
          <Text
            style={{
              fontSize: booking.eventTitle.length > 70 ? 14 : 23,
              marginTop: 16,
            }}
          >
            {booking.eventTitle}
          </Text>
          <Text style={{ fontSize: 11, marginTop: 14 }}>
            Guest ticket {ticket.position} of {booking.quantity}
          </Text>
          <Text
            style={{
              fontSize: booking.name.length > 65 ? 10 : 15,
              marginTop: 10,
            }}
          >
            {booking.name}
          </Text>
          <View
            style={{
              borderTop: "1 solid #e8e5dd",
              marginTop: 20,
              paddingTop: 18,
            }}
          >
            <Text>
              {formatInTimeZone(
                booking.eventAt,
                "Asia/Colombo",
                "EEEE, d MMMM yyyy · h:mm a",
              )}
            </Text>
            <Text
              style={{
                marginTop: 7,
                fontSize: booking.venue.length > 100 ? 8 : 10,
              }}
            >
              {booking.venue}
            </Text>
          </View>
          {/* React PDF's Image embeds bytes directly, without a remote image request. */}
          <PdfImage
            src={codes[i]}
            style={{
              width: 150,
              height: 150,
              alignSelf: "center",
              marginTop: 22,
            }}
          />
          <Text style={{ textAlign: "center", fontSize: 9 }}>
            {ticket.code}
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontSize: 9,
              marginTop: 12,
              color: "#747168",
            }}
          >
            Show this QR code at the entrance. One admission per ticket.
          </Text>
          <View
            wrap={false}
            style={{
              position: "absolute",
              bottom: 25,
              left: 30,
              right: 30,
              fontSize: 8,
              color: "#747168",
            }}
          >
            <Text style={{ marginBottom: 6, fontSize: 7 }}>
              {[booking.name, booking.email, booking.businessName]
                .filter(Boolean)
                .join(", ")}
            </Text>
            <Text>Keep your ticket private. Questions? info@gbeaward.com</Text>
          </View>
        </Page>
      ))}
    </Document>,
  );
}
