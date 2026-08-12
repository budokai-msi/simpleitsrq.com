const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const services = [
  {
    slug: "computer-repair",
    title: "Computer Repair & Diagnostics",
    tagline: "Hardware diagnostics, workstation repair, upgrades, cleanup, and practical repair-or-replace guidance.",
    audience: "Both",
    audiences: ["Residential", "Business"],
    price: 149,
    priceFrom: true,
    priceSuffix: "",
    priceNote: "Diagnostic/repair labor starts here. Parts and advanced board-level work are quoted separately.",
    duration: "By appointment",
    contents: [
      "Hardware and storage diagnostics",
      "Windows and workstation repair",
      "Drive, memory, power, thermal, and peripheral troubleshooting",
      "OS, driver, and performance cleanup",
      "Upgrade and replacement recommendations",
    ],
    notInScope: [
      "Microsoldering / board-level component repair",
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
    tagline: "Business IT support, networking, Microsoft 365, endpoint management, and ongoing operational support for Sarasota-Bradenton organizations.",
    audience: "Business",
    audiences: ["Business"],
    price: 0,
    priceSuffix: "",
    priceNote: "Scoped after a short assessment because every environment is different.",
    duration: "Ongoing or project-based",
    contents: [
      "Workstation and user support",
      "Business network and Wi-Fi troubleshooting",
      "Microsoft 365 administration and access issues",
      "Endpoint setup, lifecycle, and documentation",
      "Vendor coordination and practical IT planning",
    ],
    notInScope: [
      "Services we cannot verify or deliver reliably are not sold as packaged add-ons",
    ],
    bookingNote: "For businesses in Sarasota, Bradenton, Lakewood Ranch, and nearby service areas.",
    buyLink: "/book?topic=managed-it",
    status: "consult",
    priority: 2,
  },
];

export const audienceFilter = (svc, target) => target === "All" || svc.audiences?.includes(target);
