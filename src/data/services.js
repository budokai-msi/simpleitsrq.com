const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const services = [
  {
    slug: "computer-repair",
    title: "Computer Repair & Tune-Up",
    tagline: "We'll make your slow PC run like new or remove viruses completely.",
    audience: "Both",
    audiences: ["Residential", "Business"],
    price: 149,
    priceFrom: true,
    priceSuffix: "",
    priceNote: "Flat fee for most standard fixes. Hardware replacements quoted separately.",
    duration: "1-2 days",
    contents: [
      "Full diagnostic and drive-health check",
      "Malware, adware, and virus removal",
      "Startup-list cleanup and service optimization",
      "Operating system and driver updates",
      "Physical internal dust cleaning",
    ],
    notInScope: [
      "Data recovery from physically dead drives",
      "MacBook logic board microsoldering",
    ],
    bookingNote: "Drop off by appointment, or we come to you in Sarasota/Bradenton.",
    buyLink: env.VITE_STRIPE_LINK_TUNEUP || "",
    status: "waitlist",
    priority: 1,
  },
  {
    slug: "office-network-setup",
    title: "Small Office IT & Network Setup",
    tagline: "Get your office Wi-Fi, printers, and Microsoft 365 accounts running perfectly.",
    audience: "Business",
    audiences: ["Business"],
    price: 499,
    priceFrom: true,
    priceSuffix: "",
    priceNote: "Custom quoted based on square footage and number of employees.",
    duration: "1-2 days",
    contents: [
      "Commercial-grade Wi-Fi access point installation",
      "Firewall configuration and security lockdown",
      "Microsoft 365 / Google Workspace email setup",
      "Printer and scanner network integration",
      "Cable cleanup and switch organization",
    ],
    notInScope: [
      "Running new in-wall Ethernet drops (we partner with low-voltage electricians)",
    ],
    buyLink: env.VITE_STRIPE_LINK_NETWORK || "",
    status: "waitlist",
    priority: 2,
  },
  {
    slug: "free-strategy-call",
    title: "Free 30-Minute IT Strategy Call",
    tagline: "No sales pitch, no obligation. We'll tell you what's worth fixing and what isn't.",
    audience: "Both",
    audiences: ["Residential", "Business"],
    price: 0,
    priceSuffix: "",
    priceNote: "Free | 30 minutes | video or phone",
    duration: "30 minutes",
    contents: [
      "Quick assessment of your current setup",
      "Honest read on the top 2-3 risks",
      "Ballpark pricing for any work we'd recommend",
    ],
    notInScope: [
      "We won't quote a managed-services contract on this call.",
    ],
    buyLink: "/book",
    status: "consult",
    priority: 99,
  },
];

export const audienceFilter = (svc, target) => {
  if (target === "All") return true;
  return svc.audiences?.includes(target);
};
