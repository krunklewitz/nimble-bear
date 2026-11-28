// Builds the Owlbear Rodeo manifest (https://docs.owlbear.rodeo/extensions/reference/manifest).
// URLs are absolute because the docs don't say how relative paths resolve when the
// site lives in a subfolder (GitHub Pages: /nimble-bear/).

export const PROD_SITE_URL = "https://krunklewitz.github.io/nimble-bear/";
export const DEV_SITE_URL = "http://localhost:5173/";

export interface OwlbearManifest {
  name: string;
  version: string;
  manifest_version: 1;
  description: string;
  author: string;
  homepage_url: string;
  icon: string;
  action: { title: string; icon: string; popover: string; width: number; height: number };
  permissions: { name: "clipboard-write" | "clipboard-read"; reason: string }[];
}

export function buildManifest(siteUrl: string, version: string): OwlbearManifest {
  const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  return {
    name: "Nimble Bear",
    version,
    manifest_version: 1,
    description: "Unofficial, free Nimble 2 character sheet for Owlbear Rodeo. Not affiliated with Nimble Co.",
    author: "krunklewitz",
    homepage_url: base,
    icon: `${base}icon.svg`,
    action: {
      title: "Nimble Bear",
      icon: `${base}icon.svg`,
      // Versioned so a manifest refresh bypasses the browser cache (GitHub Pages: max-age=600).
      popover: `${base}index.html?v=${version}`,
      width: 400,
      height: 600,
    },
    permissions: [
      { name: "clipboard-write", reason: "Copy your character file to the clipboard as a backup." },
      { name: "clipboard-read", reason: "Paste a character file to load it." },
    ],
  };
}
