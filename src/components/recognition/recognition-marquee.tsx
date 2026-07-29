import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

const recognitionPartners = [
  {
    name: "London Business Consultancy",
    logo: "/recognition/london-business-consultancy.webp",
    logoWidth: 220,
    logoHeight: 62,
    logoClassName: "brightness-0",
    flag: "/recognition/flag-united-kingdom.svg",
    flagAlt: "United Kingdom flag",
    country: "United Kingdom",
    role: "LBC Group",
  },
  {
    name: "DEC",
    logo: "/recognition/dec.webp",
    logoWidth: 180,
    logoHeight: 82,
    logoClassName: "",
    flag: "/recognition/flag-sri-lanka.svg",
    flagAlt: "Sri Lanka flag",
    country: "Sri Lanka",
    role: "Government-backed DEC under the Ministry of Industry",
  },
  {
    name: "SITC Campus",
    logo: "/recognition/sitc-campus.webp",
    logoWidth: 180,
    logoHeight: 86,
    logoClassName: "",
    flag: "/recognition/flag-sri-lanka.svg",
    flagAlt: "Sri Lanka flag",
    country: "Sri Lanka",
    role: "SITC Campus - Business Faculty (Business Validation Review)",
  },
] as const;

function RecognitionCards({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <ul
      className="flex shrink-0 gap-4"
      aria-hidden={duplicate ? true : undefined}
    >
      {recognitionPartners.map((partner) => (
        <li
          key={partner.name}
          className="flex w-[16.5rem] shrink-0 flex-col justify-between rounded-xl border border-mist/90 bg-white px-5 py-5 shadow-[0_12px_32px_rgba(58,45,26,0.06)] sm:w-[18.5rem]"
        >
          <div className="flex h-16 items-center justify-center">
            <Image
              src={partner.logo}
              alt={duplicate ? "" : `${partner.name} logo`}
              width={partner.logoWidth}
              height={partner.logoHeight}
              sizes="(max-width: 640px) 220px, 250px"
              className={`max-h-14 w-auto max-w-[13.5rem] object-contain ${partner.logoClassName}`}
            />
          </div>
          <div className="mt-5 border-t border-mist/75 pt-4">
            <div className="flex items-center gap-2">
              <Image
                src={partner.flag}
                alt={duplicate ? "" : partner.flagAlt}
                width={32}
                height={20}
                className="h-5 w-8 rounded-[3px] border border-black/10 object-cover"
              />
              <span className="text-xs font-semibold uppercase tracking-[0.11em] text-ink">
                {partner.country}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-graphite">
              {partner.role}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RecognitionMarquee() {
  return (
    <section
      className="mt-14 border-t border-mist pt-10 md:mt-16 md:pt-12"
      aria-labelledby="recognition-heading"
      data-testid="recognition-marquee"
    >
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h2
            id="recognition-heading"
            className="font-heading text-2xl leading-tight text-ink md:text-[1.75rem]"
          >
            Recognition from the UK and Sri Lanka, with Global Reach
          </h2>
        </div>
        <a
          href="https://gbeaward.com/recognition"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-antique-gold underline-offset-4 hover:underline"
        >
          View recognition details
          <ArrowUpRight className="size-4" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      <div className="recognition-marquee">
        <div
          className="recognition-marquee-track flex w-max gap-4"
          data-testid="recognition-track"
        >
          <RecognitionCards />
          <RecognitionCards duplicate />
        </div>
      </div>
    </section>
  );
}
