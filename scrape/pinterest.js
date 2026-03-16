#!/usr/bin/env node

const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const readline = require("readline");
const puppeteer = require("puppeteer");

let rl;
if (require.main === module) {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(q, activeRl = rl) {
  return new Promise((resolve) => activeRl.question(q, resolve));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUrl(text) {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

function isPinterestUrl(text) {
  try {
    const u = new URL(text);
    return u.hostname.includes("pinterest.");
  } catch {
    return false;
  }
}

function buildSearchUrl(query) {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];

  for (const item of arr) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function cleanText(text) {
  if (!text) return null;
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.toLowerCase() === "pin") return null;
  return t;
}

function normalizePinterestPinUrl(url, id = null) {
  if (!url && id) return `https://www.pinterest.com/pin/${id}/`;
  if (!url) return null;

  try {
    const u = new URL(url, "https://www.pinterest.com");

    if (!u.hostname.includes("pinterest.")) {
      return url;
    }

    const match = u.pathname.match(/\/pin\/(\d+)/);
    if (match) {
      return `https://www.pinterest.com/pin/${match[1]}/`;
    }

    if (id) {
      return `https://www.pinterest.com/pin/${id}/`;
    }

    return u.toString();
  } catch {
    const match = String(url).match(/\/pin\/(\d+)/);
    if (match) {
      return `https://www.pinterest.com/pin/${match[1]}/`;
    }
    if (id) {
      return `https://www.pinterest.com/pin/${id}/`;
    }
    return url;
  }
}

function isValidImageUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

function normalizePin(pin) {
  if (!pin || typeof pin !== "object") return null;

  const id =
    pin.id ||
    pin.pinId ||
    pin.pin_id ||
    pin.aggregated_pin_data?.id ||
    null;

  const title = cleanText(
    pin.title ||
    pin.grid_title ||
    pin.seo_description ||
    pin.description ||
    pin.rich_summary?.display_description ||
    pin.story_pin_data?.title ||
    pin.alt_text ||
    null
  );

  const rawLink =
    pin.link ||
    pin.url ||
    pin.closeup_unified_description?.url ||
    pin.canonical_url ||
    null;

  const link = normalizePinterestPinUrl(rawLink, id);

  const image =
    pin.images?.orig?.url ||
    pin.images?.["736x"]?.url ||
    pin.images?.["564x"]?.url ||
    pin.images?.["474x"]?.url ||
    pin.images?.["236x"]?.url ||
    pin.image_medium_url ||
    pin.image_large_url ||
    pin.image_url ||
    pin.story_pin_data?.pages?.[0]?.image?.images?.orig?.url ||
    pin.videos?.video_list?.V_720P?.url ||
    pin.videos?.video_list?.V_EXP3?.url ||
    null;

  const source =
    pin.domain ||
    pin.rich_metadata?.site_name ||
    pin.tracking_params?.domain ||
    null;

  if (!id && !title && !link && !image) return null;

  return {
    id: id ? String(id) : null,
    title: title || null,
    link: link || null,
    image: isValidImageUrl(image) ? image : null,
    source: source || null,
  };
}

function deepCollectPins(obj, bucket = []) {
  if (!obj || typeof obj !== "object") return bucket;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepCollectPins(item, bucket);
    }
    return bucket;
  }

  const looksLikePin =
    ("id" in obj || "pinId" in obj || "pin_id" in obj) &&
    (
      "images" in obj ||
      "image_url" in obj ||
      "image_medium_url" in obj ||
      "title" in obj ||
      "grid_title" in obj ||
      "description" in obj ||
      "link" in obj ||
      "url" in obj
    );

  if (looksLikePin) {
    const parsed = normalizePin(obj);
    if (parsed) bucket.push(parsed);
  }

  for (const value of Object.values(obj)) {
    deepCollectPins(value, bucket);
  }

  return bucket;
}

function parseScriptJsonById(html, scriptId) {
  const $ = cheerio.load(html);
  const raw = $(`script#${scriptId}`).html();

  if (!raw) return [];

  const json = safeJsonParse(raw);
  if (!json) return [];

  return uniqBy(deepCollectPins(json), (x) => x.id || x.link || x.image);
}

function parseMetaFallback(html, pageUrl = null) {
  const $ = cheerio.load(html);

  const title =
    cleanText($('meta[property="og:title"]').attr("content")) ||
    cleanText($('meta[name="twitter:title"]').attr("content")) ||
    cleanText($("title").text());

  const image =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    null;

  const canonical =
    $('link[rel="canonical"]').attr("href") ||
    $('meta[property="og:url"]').attr("content") ||
    pageUrl ||
    null;

  const normalizedLink = normalizePinterestPinUrl(canonical, null);
  const idMatch = normalizedLink ? normalizedLink.match(/\/pin\/(\d+)\//) : null;
  const id = idMatch ? idMatch[1] : null;

  if (!id && !title && !image && !normalizedLink) return [];

  return [
    {
      id: id || null,
      title: title || null,
      link: normalizedLink || null,
      image: isValidImageUrl(image) ? image : null,
      source: null,
    },
  ];
}

function parseFromRenderedDom(html) {
  const $ = cheerio.load(html);
  const results = [];

  $("a[href*='/pin/']").each((_, el) => {
    const a = $(el);
    const href = a.attr("href");
    if (!href) return;

    const fullLink = href.startsWith("http")
      ? href
      : `https://www.pinterest.com${href}`;

    if (/\/repin\/?/i.test(fullLink)) return;
    if (/\/pin\/create\//i.test(fullLink)) return;

    const normalizedLink = normalizePinterestPinUrl(fullLink);
    const idMatch = normalizedLink.match(/\/pin\/(\d+)\//);
    if (!idMatch) return;

    const img =
      a.find("img").first().length
        ? a.find("img").first()
        : a.closest("*").find("img").first();

    const title = cleanText(
      img.attr("alt") ||
      a.attr("aria-label") ||
      a.text().trim() ||
      null
    );

    const image =
      img.attr("src") ||
      img.attr("data-src") ||
      img.attr("srcset")?.split(",").pop()?.trim().split(" ")[0] ||
      null;

    results.push({
      id: idMatch[1],
      title: title || null,
      link: normalizedLink,
      image: isValidImageUrl(image) ? image : null,
      source: null,
    });
  });

  return uniqBy(results, (x) => x.id || x.link || x.image);
}

function scorePin(pin) {
  let score = 0;
  if (pin.id) score += 3;
  if (pin.link && /\/pin\/\d+\/$/i.test(pin.link)) score += 4;
  if (pin.image) score += 4;
  if (pin.title) score += 2;
  if (pin.source) score += 1;
  if (pin.link && /\/repin\/?/i.test(pin.link)) score -= 10;
  return score;
}

function cleanFinalResults(results) {
  const cleaned = results
    .map((item) => ({
      id: item.id ? String(item.id) : null,
      title: cleanText(item.title),
      link: normalizePinterestPinUrl(item.link, item.id),
      image: isValidImageUrl(item.image) ? item.image : null,
      source: item.source || null,
    }))
    .filter((item) => item.id || item.title || item.link || item.image);

  const deduped = uniqBy(cleaned, (x) => x.id || x.link || x.image);

  deduped.sort((a, b) => scorePin(b) - scorePin(a));

  return deduped;
}

async function fetchHtmlWithAxios(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      Referer: "https://www.pinterest.com/",
    },
    timeout: 30000,
    maxRedirects: 5,
  });

  return res.data;
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 800;
      const maxScroll = 5000;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= maxScroll) {
          clearInterval(timer);
          resolve();
        }
      }, 400);
    });
  });
}

async function fetchHtmlWithPuppeteer(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await delay(5000);
    await autoScroll(page);
    await delay(2000);

    return await page.content();
  } finally {
    await browser.close();
  }
}

async function getBestHtml(url) {
  try {
    const html = await fetchHtmlWithAxios(url);

    const candidates = cleanFinalResults([
      ...parseScriptJsonById(html, "__PWS_DATA__"),
      ...parseScriptJsonById(html, "__PWS_INITIAL_PROPS__"),
      ...parseFromRenderedDom(html),
      ...parseMetaFallback(html, url),
    ]);

    if (candidates.length > 0) {
      return { html, method: "axios" };
    }
  } catch (_) {
    // fallback
  }

  const html = await fetchHtmlWithPuppeteer(url);
  return { html, method: "puppeteer" };
}

module.exports = async function handlePinterest(inputUrl, { rl: passedRl } = {}) {
  const activeRl = passedRl || rl;
  try {
    const input = inputUrl || (await ask("Masukkan keyword atau link Pinterest: ", activeRl)).trim();

    if (!input) {
      console.log("Input kosong.");
      return;
    }

    const inputIsUrl = isUrl(input);
    const inputIsPinterest = isPinterestUrl(input);

    let limit = 10;
    let singleMode = false;

    if (inputIsUrl && inputIsPinterest) {
      singleMode = true;
    } else {
      const limitRaw = (await ask("Jumlah data yang ingin diambil? (default 10): ", activeRl)).trim();
      limit = Number(limitRaw) > 0 ? Number(limitRaw) : 10;
    }

    const url = inputIsUrl ? input : buildSearchUrl(input);

    console.log(`\nMengambil data dari: ${url}\n`);

    const { html, method } = await getBestHtml(url);

    let finalResults = cleanFinalResults([
      ...parseScriptJsonById(html, "__PWS_DATA__"),
      ...parseScriptJsonById(html, "__PWS_INITIAL_PROPS__"),
      ...parseFromRenderedDom(html),
      ...parseMetaFallback(html, url),
    ]);

    if (singleMode) {
      const exactPinId = url.match(/\/pin\/(\d+)/)?.[1] || null;

      if (exactPinId) {
        finalResults.sort((a, b) => {
          const aExact = a.id === exactPinId ? 1 : 0;
          const bExact = b.id === exactPinId ? 1 : 0;
          return bExact - aExact || scorePin(b) - scorePin(a);
        });
      }

      finalResults = finalResults.slice(0, 1);
    } else {
      finalResults = finalResults.slice(0, limit);
    }

    if (!finalResults.length) {
      console.log("HTML berhasil diambil, tetapi data pin tidak ditemukan.");
      console.log("Kemungkinan halaman yang dibuka bukan halaman hasil pin, atau Pinterest membatasi akses anonim.");
      fs.writeFileSync("debug-pinterest.html", html, "utf8");
      console.log("HTML debug disimpan ke debug-pinterest.html");
      return;
    }

    console.log(`Metode fetch: ${method}`);
    console.log(`Berhasil menemukan ${finalResults.length} data:\n`);

    finalResults.forEach((item, i) => {
      console.log(`=== ${i + 1} ===`);
      console.log("ID    :", item.id || "-");
      console.log("Title :", item.title || "-");
      console.log("Link  :", item.link || "-");
      console.log("Image :", item.image || "-");
      console.log("Source:", item.source || "-");
      console.log("");
    });

    fs.writeFileSync(
      "pinterest-results.json",
      JSON.stringify(finalResults, null, 2),
      "utf8"
    );

    console.log("Data disimpan ke pinterest-results.json");
  } catch (err) {
    console.error("Terjadi error:");
    console.error(err.message || err);
  } finally {
    if (!passedRl && rl) rl.close();
  }
}

if (require.main === module) {
  module.exports();
}