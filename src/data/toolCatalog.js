// Curated product recommendations organized by category. Each entry drives
// the /tools page AND can be referenced in blog posts. Amazon search links
// use the affiliate tag automatically. Non-Amazon entries use their own
// affiliate programs via the env-var-based registry.
//
// Adding a product: drop an entry in the right category. The /tools page
// renders everything here with zero additional code.

const env = import.meta.env;
const TAG = env.VITE_AFF_AMAZON_TAG || "";

function az(query, label, desc) {
  return {
    label,
    desc,
    href: TAG
      ? `https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${encodeURIComponent(TAG)}`
      : null,
    vendor: "Amazon",
  };
}

export const TOOL_CATEGORIES = [
  {
    id: "power",
    title: "Power Protection",
    intro: "Florida storm season takes out more office equipment than malware. Every device that matters goes on battery.",
    items: [
      az("APC back-ups pro 1500va line interactive", "Line-Interactive UPS (1000-1500VA)", "The sweet spot for a single desk: workstation, monitor, switch, and router. Keeps you running through a 5-second flicker and gives 10+ minutes for a clean shutdown."),
      az("cyberpower rackmount ups 1500va sine wave", "Rackmount UPS (Pure Sine Wave)", "For the network closet or server rack. Pure-sine output protects sensitive gear. Mount it at the bottom of any 19-inch rack."),
      az("APC replacement battery cartridge", "UPS Replacement Battery", "Batteries last 3-5 years in Florida heat. Swap them on schedule or the UPS is just a power strip."),
      az("coax and ethernet surge protector", "Coax / Ethernet Surge Protector", "Lightning rides the cable or phone line into your router. This stops it at the wall for under $30."),
    ],
  },
  {
    id: "backup",
    title: "Backup & Storage",
    intro: "The 3-2-1 rule: three copies, two media types, one offsite. Here is the hardware that makes it real.",
    items: [
      az("samsung t7 portable ssd 2tb", "Portable SSD (2TB)", "Fast USB-C backup for a single workstation. Plug in overnight, unplug in the morning so ransomware cannot reach it."),
      az("synology 2 bay nas", "2-Bay NAS (Synology)", "Network-attached backup for multi-person offices. Two drives in a mirror, pulling backups from every PC on the network."),
      az("wd red plus 4tb nas drive", "NAS Drive (WD Red Plus 4TB)", "Built for 24/7 NAS use. Pair two in a mirror for a bulletproof local backup tier."),
      az("seagate ironwolf 4tb nas", "NAS Drive (Seagate IronWolf 4TB)", "Alternative NAS drive. Same 24/7 rating, different vendor for those who prefer to diversify."),
    ],
  },
  {
    id: "security",
    title: "Security & Authentication",
    intro: "SMS 2FA is broken. Hardware keys stop the attack that SMS cannot. Pair with a password manager for full coverage.",
    items: [
      az("yubikey 5c nfc", "YubiKey 5C NFC", "The standard hardware security key. USB-C plus NFC for phone tap. Two per person: one on the keyring, one in a drawer."),
      az("yubikey 5 nfc usb a", "YubiKey 5 NFC (USB-A)", "Same security, older plug. For offices with USB-A laptops or desktops."),
      az("yubico security key nfc", "Security Key NFC (Budget)", "FIDO2 only at half the price. Good for larger rollouts where PIV and TOTP are not needed."),
      az("kensington laptop lock", "Laptop Cable Lock", "Physical theft prevention for shared offices and co-working spaces. Fifteen seconds to attach, deters the opportunistic grab."),
    ],
  },
  {
    id: "networking",
    title: "WiFi & Networking",
    intro: "The ISP router was never designed for 15 people on video calls. Business access points fix dead spots and add guest isolation.",
    items: [
      az("ubiquiti unifi u6 pro access point", "Business Access Point (UniFi U6 Pro)", "Ceiling-mount, dual-band, 50+ clients. The reference AP for small-office WiFi that actually works."),
      az("ubiquiti unifi u6 lite access point", "Access Point Lite (UniFi U6 Lite)", "Lower-cost AP for hallways, break rooms, and low-density zones. Same management console."),
      az("ubiquiti unifi switch poe 8 port", "PoE Switch (8-Port)", "Powers access points and cameras over Ethernet. No wall warts on the ceiling."),
      az("managed poe switch 16 port gigabit", "Managed PoE Switch (16-Port)", "For larger offices. VLAN support, traffic stats, and enough PoE budget for multiple APs plus cameras."),
      az("cat6 ethernet patch cable 1ft 5 pack color", "Color-Coded Patch Cables", "Short, color-coded cables for the network closet. Blue for workstations, yellow for phones, green for printers."),
    ],
  },
  {
    id: "desk",
    title: "Desk & Workstation",
    intro: "A laptop on a desk is an ergonomics problem. A dock, monitor, and keyboard turn it into a real workstation.",
    items: [
      az("USB-C docking station dual monitor 100W power delivery", "USB-C Docking Station", "One cable: power, video, data, Ethernet. Walk in, click, start working."),
      az("thunderbolt 4 docking station dual 4k", "Thunderbolt 4 Dock", "For dual 4K monitors and high-bandwidth workflows. Backward-compatible with USB-C."),
      az("27 inch 4k USB-C monitor", "27\" 4K USB-C Monitor", "Sharp text for 8-hour workdays. Some models include a built-in hub and charge the laptop directly."),
      az("wireless keyboard mouse combo business", "Wireless Keyboard + Mouse Combo", "Per-desk essential. Close the laptop lid, use the external display, keep wrists neutral."),
      az("laptop stand aluminum desk mount", "Laptop Stand / Riser", "Gets the closed laptop off the desk surface. Better airflow, reclaimed desk space."),
    ],
  },
  {
    id: "compliance",
    title: "Compliance & Document Handling",
    intro: "HIPAA and legal ethics require proper destruction of paper records. A $200 shredder is the cheapest compliance control you will ever buy.",
    items: [
      az("fellowes micro cut shredder 12 sheet", "Micro-Cut Shredder (12-Sheet)", "P-5 security level, 20+ minute run time. Handles daily office shredding without overheating."),
      az("fellowes commercial shredder 20 sheet cross cut", "Commercial Shredder (20-Sheet)", "Floor-standing for high-volume destruction or end-of-retention purges."),
      az("small desk shredder 6 sheet micro cut", "Desk-Side Shredder", "Compact unit under the front desk or billing station. Catches mis-prints before they hit the recycling."),
      az("brother p-touch label maker", "Label Maker", "Label every cable, every port, every shelf. Thirty dollars that saves hours of troubleshooting."),
    ],
  },
  {
    id: "infrastructure",
    title: "Network Closet & Rack",
    intro: "A messy closet causes outages. A clean rack with labeled cables and a patch panel prevents them.",
    items: [
      az("6u wall mount network rack", "Wall-Mount Rack (6U)", "Gets gear off the floor and into a structured, accessible mount. Screws into studs in 30 minutes."),
      az("24 port cat6 patch panel keystone", "Patch Panel (24-Port)", "Every cable from the office terminates here. Short patch cables connect to the switch. No more tracing spaghetti."),
      az("velcro cable ties reusable", "Velcro Cable Ties", "Reusable, color-coded, and gentler on cables than zip ties. Essential for any rack or under-desk cleanup."),
      az("cyberpower ups 1500va rackmount", "Closet UPS (Rackmount)", "Keeps the switch, modem, and firewall alive through Florida power flickers. Mounts cleanly in the rack."),
    ],
  },
];
