const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const services = [
  {
    slug: "computer-repair",
    title: "Computer Repair & Diagnostics",
    tagline: "We diagnose the failure first, then repair, upgrade, or recommend replacement based on the condition of the machine and what makes sense to spend.",
    audience: "Both",
    audiences: ["Residential", "Business"],
    price: 149,
    priceFrom: true,
    priceSuffix: "",
    priceNote: "Diagnostic and repair labor starts here. Parts and any work outside the standard repair scope are quoted before we proceed.",
    duration: "By appointment",
    contents: [
      "Hardware and storage diagnostics",
      "Windows and workstation repair",
      "Drive, memory, power, thermal, and peripheral troubleshooting",
      "OS, driver, and performance cleanup",
      "Upgrade and replacement recommendations",
    ],
    notInScope: [
      "Microsoldering or board-level component repair",
      "Guaranteed recovery from physically failed storage",
    ],
    bookingNote: "Available by appointment in the Sarasota and Bradenton area.",
    buyLink: env.VITE_STRIPE_LINK_TUNEUP || "",
    status: "waitlist",
    priority: 1,
  },
  {
    slug: "managed-it",
    title: "Managed IT & Network Support",
    tagline: "Ongoing support for the computers, users, network, Microsoft 365, documentation, and vendors your business relies on every day.",
    audience: "Business",
    audiences: ["Business"],
    price: 0,
    priceSuffix: "",
    priceNote: "We start with a short assessment so the scope reflects your actual environment instead of a generic package.",
    duration: "Ongoing or project-based",
    contents: [
      "Workstation and user support",
      "Business network and Wi-Fi troubleshooting",
      "Microsoft 365 administration and access issues",
      "Endpoint setup, lifecycle, and documentation",
      "Vendor coordination and practical IT planning",
    ],
    notInScope: [
      "Products or add-ons we cannot verify, support, or deliver reliably",
    ],
    bookingNote: "For businesses in Sarasota, Bradenton, Lakewood Ranch, and nearby service areas.",
    buyLink: "/book?topic=managed-it",
    status: "consult",
    priority: 2,
  },
];

export const audienceFilter = (svc, target) => target === "All" || svc.audiences?.includes(target);