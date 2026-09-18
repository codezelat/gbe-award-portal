// Only a staff ticket check-in path can survive the login/MFA round trip.
export function ticketCheckInReturn(value: string | null | undefined) {
  return value &&
    /^\/admin\/tickets\/check-in\/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

export function ticketIdFromQr(value: string, origin: string) {
  try {
    const url = new URL(value);
    if (
      url.origin !== new URL(origin).origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const path = ticketCheckInReturn(url.pathname);
    return path ? path.split("/").at(-1)! : null;
  } catch {
    return null;
  }
}
