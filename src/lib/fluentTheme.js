import { webLightTheme, webDarkTheme } from "@fluentui/react-components";

// Brand-aligned Fluent themes — only imported by the lazy ClientPortal route,
// so the homepage bundle never pulls in @fluentui/react-components.
//
// We override the communication-blue ramp with the site's #0F6CBD so Fluent
// Buttons / accents match the rest of the page, and align the neutral surface
// tokens with the site's --bg / --surface values so FluentProvider's wrapper
// background doesn't fight the page.
// Use the same OS system stack as the rest of the site (index.css :root).
// No web fonts loaded, so referencing "Geist" or "Inter" would just cause
// fallback lottery depending on what the visitor has installed.
const sharedFluentOverrides = {
  fontFamilyBase:
    '-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif',
};

export const brandedLightTheme = {
  ...webLightTheme,
  ...sharedFluentOverrides,
  // Brand ramp
  colorBrandBackground: "#0F6CBD",
  colorBrandBackgroundHover: "#115EA3",
  colorBrandBackgroundPressed: "#0C3B5E",
  colorBrandForeground1: "#0F6CBD",
  colorBrandForeground2: "#115EA3",
  colorBrandForegroundLink: "#0F6CBD",
  colorBrandForegroundLinkHover: "#115EA3",
  colorBrandForegroundLinkPressed: "#0C3B5E",
  // Surfaces
  colorNeutralBackground1: "#FFFFFF",
  colorNeutralBackground2: "#F5F5F5",
  colorNeutralBackground3: "#ECEAE9",
  colorNeutralForeground1: "#1B1B1B",
  colorNeutralForeground2: "#5C5C5C",
  colorNeutralForeground3: "#8A8A8A",
  colorNeutralStroke1: "#D2D0CE",
  colorNeutralStroke2: "#E5E3E1",
};

export const brandedDarkTheme = {
  ...webDarkTheme,
  ...sharedFluentOverrides,
  colorBrandBackground: "#4DA3E8",
  colorBrandBackgroundHover: "#6FB6F0",
  colorBrandBackgroundPressed: "#2B88D8",
  colorBrandForeground1: "#4DA3E8",
  colorBrandForeground2: "#6FB6F0",
  colorBrandForegroundLink: "#4DA3E8",
  colorBrandForegroundLinkHover: "#6FB6F0",
  colorBrandForegroundLinkPressed: "#2B88D8",
  colorNeutralBackground1: "#14171C",
  colorNeutralBackground2: "#1C1F26",
  colorNeutralBackground3: "#232830",
  colorNeutralForeground1: "#F4F5F7",
  colorNeutralForeground2: "#B4BAC4",
  colorNeutralForeground3: "#7A828F",
  colorNeutralStroke1: "#353B45",
  colorNeutralStroke2: "#262B33",
};
