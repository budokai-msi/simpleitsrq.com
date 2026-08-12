export const BUSINESS = Object.freeze({
  name: "Simple IT SRQ",
  siteUrl: "https://simpleitsrq.com",
  email: "hello@simpleitsrq.com",
  phoneDisplay: "(813) 434-3230",
  phoneE164: "+18134343230",
  locationLabel: "Bradenton, Florida",
  serviceRegion: "Southwest Florida",
  supportHours: "Business hours",
});

export const CONTACT = Object.freeze({
  email: BUSINESS.email,
  mailto: `mailto:${BUSINESS.email}`,
  phoneDisplay: BUSINESS.phoneDisplay,
  tel: `tel:${BUSINESS.phoneE164}`,
  sms: `sms:${BUSINESS.phoneE164}`,
  bookingPath: "/book",
  supportPath: "/support",
});
