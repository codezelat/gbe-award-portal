import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-5 py-16">
      <section className="surface max-w-lg rounded-lg p-8 text-center">
        <p className="font-mono text-sm text-antique-gold">404</p>
        <h1 className="font-display mt-3 text-4xl font-semibold">
          Page not found
        </h1>
        <p className="mt-3 text-graphite">
          The page may have moved, or your account may not have access to that
          record.
        </p>
        <Button className="mt-7" render={<Link href="/" />}>
          Return to the portal
        </Button>
      </section>
    </main>
  );
}
