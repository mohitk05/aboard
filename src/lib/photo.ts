import { haversineKm, type LatLng } from "./geo";

// A photo of the place a station is in, from Wikipedia (the lead image of the station's or the
// nearest notable place's article), with the credit and licence Wikimedia Commons asks for.

const API = "https://en.wikipedia.org/w/api.php";
// Wikimedia asks automated clients to identify themselves.
const UA = "Aboard/1.0 (https://github.com/mohitk05/aboard)";
export const PHOTO_WIDTH = 1920;

export interface StopPhoto {
  url: string;
  width: number;
  height: number;
  /** The Wikipedia article the photo leads. */
  title: string;
  page: string;
  /** The image's Commons page, with its full credit and licence. */
  source: string;
  credit: string | null;
  license: string | null;
}

export interface WikiPage {
  index?: number;
  title: string;
  pageimage?: string;
  thumbnail?: { source: string; width: number; height: number };
  coordinates?: { lat: number; lon: number }[];
}

const isPhoto = (p: WikiPage) => !!p.thumbnail && !!p.pageimage && !/\.(svg|gif)$/i.test(p.pageimage);

/**
 * The best photo among search results: the highest-ranked article with a photo (not a map, logo
 * or flag, which are usually SVG), located within `maxKm` of the station, so a search for
 * "Central Station" can't pick one on another continent.
 */
export function choosePage(pages: WikiPage[], at: LatLng, maxKm: number): WikiPage | null {
  return (
    [...pages]
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .find((p) => {
        const c = p.coordinates?.[0];
        return isPhoto(p) && !!c && haversineKm(at, { lat: c.lat, lng: c.lon }) <= maxKm;
      }) ?? null
  );
}

/** Plain text from the HTML in Commons metadata ("<a href=…>Jane Doe</a>" → "Jane Doe"). */
export function plain(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 200) : null;
}

async function query(params: Record<string, string>): Promise<any> {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ action: "query", format: "json", formatversion: "2", ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return res.json();
}

const pageProps = {
  prop: "pageimages|coordinates",
  piprop: "thumbnail|name",
  pithumbsize: String(PHOTO_WIDTH),
  colimit: "max",
};

export async function findStopPhoto(stop: { name: string; country: string; coordinates: LatLng }): Promise<StopPhoto | null> {
  // 1. The station's own article (or what a search for its name finds nearby).
  const search = await query({ generator: "search", gsrsearch: stop.name, gsrlimit: "8", ...pageProps });
  let page = choosePage(search.query?.pages ?? [], stop.coordinates, 60);
  // 2. Otherwise, the nearest notable place with a photo.
  if (!page) {
    const near = await query({
      generator: "geosearch",
      ggscoord: `${stop.coordinates.lat}|${stop.coordinates.lng}`,
      ggsradius: "10000",
      ggslimit: "20",
      ...pageProps,
    });
    page = choosePage(near.query?.pages ?? [], stop.coordinates, 15);
  }
  if (!page?.thumbnail || !page.pageimage) return null;

  // Credit and licence from Commons (or Wikipedia, for locally hosted images).
  const info = await query({
    titles: `File:${page.pageimage}`,
    prop: "imageinfo",
    iiprop: "extmetadata|url",
    iiextmetadatafilter: "Artist|LicenseShortName",
  }).catch(() => null);
  const ii = info?.query?.pages?.[0]?.imageinfo?.[0];
  return {
    url: page.thumbnail.source,
    width: page.thumbnail.width,
    height: page.thumbnail.height,
    title: page.title,
    page: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    source: ii?.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(page.pageimage)}`,
    credit: plain(ii?.extmetadata?.Artist?.value),
    license: plain(ii?.extmetadata?.LicenseShortName?.value),
  };
}
