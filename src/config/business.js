export const BUSINESS = Object.freeze({
  name: "Simple IT SRQ",
  siteUrl: "https://simpleitsrq.com",
  email: "hello@simpleitsrq.com",
  locationLabel: "Bradenton, Florida",
  serviceRegion: "Southwest Florida",
  supportHours: "Business hours",
});

export const CONTACT = Object.freeze({
  email: BUSINESS.email,
  mailto: `mailto:${BUSINESS.email}`,
  bookingPath: "/book",
  supportPath: "/support",
});
