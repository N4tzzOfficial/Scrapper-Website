#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const readline = require("readline");
const puppeteer = require("puppeteer");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cleanText(text) {
  if (!text) return null;
  const t = String(text).replace(/\s+/g, " ").trim();
  return t || null;
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

function isUrl(text) {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

function isPixivUrl(text) {
  try {
    const u = new URL(text);
    return u.hostname.includes("pixiv.net") || u.hostname.includes("pximg.net");
  } catch {
    return false;
  }
}

function buildSearchUrl(query) {
  return `https://www.pixiv.net/en/tags/${encodeURIComponent(query)}/artworks`;
}

function parseArtworkIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/(?:artworks\/|illust_id=)(\d+)/);
  return m ? m[1] : null;
}

function normalizeArtworkUrl(url, id = null) {
  if (!url && id) return `https://www.pixiv.net/artworks/${id}`;
  if (!url) return null;

  try {
    const u = new URL(url, "https://www.pixiv.net");
    const illustId = u.searchParams.get("illust_id");
    if (illustId) return `https://www.pixiv.net/artworks/${illustId}`;

    const m = u.pathname.match(/\/artworks\/(\d+)/);
    if (m) return `https://www.pixiv.net/artworks/${m[1]}`;

    if (id) return `https://www.pixiv.net/artworks/${id}`;
    return u.toString();
  } catch {
    const m = String(url).match(/(?:artworks\/|illust_id=)(\d+)/);
    if (m) return `https://www.pixiv.net/artworks/${m[1]}`;
    if (id) return `https://www.pixiv.net/artworks/${id}`;
    return url;
  }
}

function normalizeUserUrl(url, userId = null) {
  if (!url && userId) return `https://www.pixiv.net/users/${userId}`;
  if (!url) return null;

  try {
    const u = new URL(url, "https://www.pixiv.net");
    const m = u.pathname.match(/\/users\/(\d+)/);
    if (m) return `https://www.pixiv.net/users/${m[1]}`;
    if (userId) return `https://www.pixiv.net/users/${userId}`;
    return u.toString();
  } catch {
    const m = String(url).match(/\/users\/(\d+)/);
    if (m) return `https://www.pixiv.net/users/${m[1]}`;
    if (userId) return `https://www.pixiv.net/users/${userId}`;
    return url;
  }
}

function sanitizeFileName(name) {
  return String(name || "untitled")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function getExtFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return ext || ".jpg";
  } catch {
    return ".jpg";
  }
}

function makeHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
    "Referer": "https://www.pixiv.net/",
  };
}

function isGoodImageUrl(url) {
  return !!url && /^https?:\/\//i.test(url);
}

function normalizePixivItem(item) {
  if (!item || typeof item !== "object") return null;

  const id =
    item.id ||
    item.illustId ||
    item.illust_id ||
    parseArtworkIdFromUrl(item.url) ||
    parseArtworkIdFromUrl(item.link) ||
    null;

  if (!id) return null;

  const title = cleanText(
    item.title ||
      item.illust_title ||
      item.alt ||
      item.caption ||
      null
  );

  const userId =
    item.userId ||
    item.user_id ||
    (() => {
      const m = String(item.userUrl || item.www_user_url || "").match(/\/users\/(\d+)/);
      return m ? m[1] : null;
    })();

  const link = normalizeArtworkUrl(
    item.link ||
      item.url ||
      item.artworkUrl ||
      item.www_member_illust_medium_url ||
      null,
    id
  );

  const image =
    item.image ||
    item.src ||
    item.urls?.original ||
    item.url ||
    null;

  const artist = cleanText(item.userName || item.user_name || item.artist || null);
  const artistUrl = normalizeUserUrl(item.userUrl || item.www_user_url || null, userId);

  return {
    id: String(id),
    title: title || null,
    link: link || `https://www.pixiv.net/artworks/${id}`,
    displayUrl: link || `https://www.pixiv.net/artworks/${id}`,
    image: isGoodImageUrl(image) ? image : null,
    artist: artist || null,
    artistUrl: artistUrl || null,
    userId: userId ? String(userId) : null,
    images: [],
  };
}

function deepCollectPixivItems(obj, bucket = []) {
  if (!obj || typeof obj !== "object") return bucket;

  if (Array.isArray(obj)) {
    for (const item of obj) deepCollectPixivItems(item, bucket);
    return bucket;
  }

  const parsed = normalizePixivItem(obj);
  if (parsed) bucket.push(parsed);

  for (const value of Object.values(obj)) {
    deepCollectPixivItems(value, bucket);
  }

  return bucket;
}

function parseInitConfigJson(html) {
  const $ = cheerio.load(html);
  const raw =
    $("#init-config").attr("content") ||
    $("#init-config").text() ||
    $("#init-config.json-data").attr("value");

  if (!raw) return [];
  const json = safeJsonParse(raw);
  if (!json) return [];
  return uniqBy(deepCollectPixivItems(json), (x) => x.id);
}

function parseNextData(html) {
  const results = [];
  const matches = [...html.matchAll(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/g)];

  for (const m of matches) {
    const json = safeJsonParse(m[1]);
    if (!json) continue;
    results.push(...deepCollectPixivItems(json));
  }

  return uniqBy(results, (x) => x.id);
}

function parsePreloadData(html) {
  const results = [];
  const matches = [...html.matchAll(/<meta[^>]+id=["']meta-preload-data["'][^>]+content=["']([^"]+)["']/g)];

  for (const m of matches) {
    const raw = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");

    const json = safeJsonParse(raw);
    if (!json) continue;
    results.push(...deepCollectPixivItems(json));
  }

  return uniqBy(results, (x) => x.id);
}

function parseAnchors(html) {
  const $ = cheerio.load(html);
  const results = [];

  $("a[href*='/artworks/'], a[href*='illust_id=']").each((_, el) => {
    const a = $(el);
    const href = a.attr("href");
    const link = normalizeArtworkUrl(href);
    const id = parseArtworkIdFromUrl(link);
    if (!id) return;

    const img = a.find("img").first();
    const image =
      img.attr("src") ||
      img.attr("data-src") ||
      img.attr("data-lazy-src") ||
      null;

    const title = cleanText(
      a.attr("title") ||
      a.attr("aria-label") ||
      img.attr("alt") ||
      null
    );

    let artist = null;
    let artistUrl = null;
    let userId = null;

    const wrapper = a.closest("li, article, div, figure");
    const userAnchor = wrapper.find("a[href*='/users/']").first();

    if (userAnchor.length) {
      artist = cleanText(userAnchor.attr("title") || userAnchor.text() || null);
      artistUrl = normalizeUserUrl(userAnchor.attr("href"));
      userId = artistUrl ? (artistUrl.match(/\/users\/(\d+)/) || [])[1] || null : null;
    }

    results.push({
      id: String(id),
      title: title || null,
      link,
      displayUrl: link,
      image: isGoodImageUrl(image) ? image : null,
      artist,
      artistUrl,
      userId,
      images: [],
    });
  });

  return uniqBy(results, (x) => x.id);
}

function extractResultsFromHtml(html) {
  const items = [
    ...parseInitConfigJson(html),
    ...parseNextData(html),
    ...parsePreloadData(html),
    ...parseAnchors(html),
  ];

  return uniqBy(
    items
      .filter(Boolean)
      .filter((x) => x.id)
      .map((x) => ({
        id: String(x.id),
        title: cleanText(x.title),
        link: normalizeArtworkUrl(x.link, x.id),
        displayUrl: normalizeArtworkUrl(x.displayUrl || x.link, x.id),
        image: isGoodImageUrl(x.image) ? x.image : null,
        artist: cleanText(x.artist),
        artistUrl: normalizeUserUrl(x.artistUrl, x.userId),
        userId: x.userId ? String(x.userId) : null,
        images: Array.isArray(x.images) ? x.images.filter(isGoodImageUrl) : [],
      })),
    (x) => x.id
  );
}

async function fetchHtmlWithAxios(url) {
  const res = await axios.get(url, {
    headers: {
      ...makeHeaders(),
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
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
      const distance = 1000;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= 10000) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
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

    await page.setExtraHTTPHeaders(makeHeaders());

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await delay(4000);
    await autoScroll(page);
    await delay(2000);

    return await page.content();
  } finally {
    await browser.close();
  }
}

async function getBestResults(url) {
  try {
    const html = await fetchHtmlWithAxios(url);
    const results = extractResultsFromHtml(html);
    if (results.length > 0) {
      return { html, results, method: "axios" };
    }
  } catch {}

  const html = await fetchHtmlWithPuppeteer(url);
  const results = extractResultsFromHtml(html);
  return { html, results, method: "puppeteer" };
}

// Mengambil URL gambar resolusi original
async function fetchArtworkPages(artworkId) {
  const apiUrl = `https://www.pixiv.net/ajax/illust/${artworkId}/pages?lang=en`;

  try {
    const res = await axios.get(apiUrl, {
      headers: {
        ...makeHeaders(),
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 30000,
    });

    const body = res.data?.body;
    if (!Array.isArray(body)) return [];

    const urls = [];

    // Hanya mengambil img-original
    for (const page of body) {
      if (page?.urls?.original && isGoodImageUrl(page.urls.original)) {
        urls.push(page.urls.original);
      }
    }

    return uniqBy(urls, (x) => x);
  } catch {
    return [];
  }
}

// Mengambil detail metadata artis jika kosong
async function fetchArtworkDetails(artworkId) {
  const apiUrl = `https://www.pixiv.net/ajax/illust/${artworkId}?lang=en`;
  
  try {
    const res = await axios.get(apiUrl, {
      headers: {
        ...makeHeaders(),
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 30000,
    });

    return res.data?.body || null;
  } catch {
    return null;
  }
}

async function enrichImages(items) {
  const out = [];

  for (const item of items) {
    const images = await fetchArtworkPages(item.id);
    
    let artist = item.artist;
    let userId = item.userId;
    let title = item.title;
    let artistUrl = item.artistUrl;

    // Memastikan metadata artis terisi
    if (!artist || !userId || !title) {
      const details = await fetchArtworkDetails(item.id);
      if (details) {
        artist = details.userName || artist;
        userId = details.userId || userId;
        title = details.illustTitle || details.title || title;
      }
    }

    if (userId && !artistUrl) {
      artistUrl = `https://www.pixiv.net/users/${userId}`;
    }

    const bestImage = images[0] || item.image || null;

    out.push({
      ...item,
      title: title || item.title,
      artist: artist || item.artist,
      userId: userId || item.userId,
      artistUrl: artistUrl || item.artistUrl,
      image: bestImage,
      images,
    });

    await delay(350);
  }

  return out;
}

async function downloadFile(url, outputPath) {
  const res = await axios.get(url, {
    responseType: "stream",
    headers: {
      ...makeHeaders(),
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    timeout: 60000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    res.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function downloadAllImages(items) {
  const baseDir = path.join(process.cwd(), "pixiv");

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  let success = 0;
  let failed = 0;

  for (const item of items) {
    const imageList = Array.isArray(item.images) && item.images.length
      ? item.images
      : item.image
        ? [item.image]
        : [];

    if (!imageList.length) {
      console.log(`[SKIP] ID ${item.id} tidak memiliki tautan gambar.`);
      failed++;
      continue;
    }

    for (let i = 0; i < imageList.length; i++) {
      const imgUrl = imageList[i];
      const ext = getExtFromUrl(imgUrl);
      const safeTitle = sanitizeFileName(item.title || item.id);
      const fileName = imageList.length > 1
        ? `${item.id}_${i + 1}_${safeTitle}${ext}`
        : `${item.id}_${safeTitle}${ext}`;

      const outputPath = path.join(baseDir, fileName);

      try {
        await downloadFile(imgUrl, outputPath);
        console.log(`[OK] ${fileName}`);
        success++;
      } catch (err) {
        console.log(`[GAGAL] ${fileName} -> ${err.message}`);
        failed++;
      }

      await delay(500);
    }
  }

  return { success, failed, dir: baseDir };
}

async function main() {
  try {
    const input = (await ask("Masukkan kata kunci pencarian atau tautan Pixiv: ")).trim();
    if (!input) {
      console.log("Input tidak boleh kosong.");
      return;
    }

    const inputIsUrl = isUrl(input);
    const inputIsPixiv = isPixivUrl(input);

    let limit = 10;
    let singleMode = false;

    if (inputIsUrl && inputIsPixiv) {
      singleMode = true;
    } else {
      const limitRaw = (await ask("Jumlah data yang ingin diambil? (default 10): ")).trim();
      limit = Number(limitRaw) > 0 ? Number(limitRaw) : 10;
    }

    const url = inputIsUrl ? input : buildSearchUrl(input);

    console.log(`\nMengambil data dari: ${url}\n`);

    const { html, results, method } = await getBestResults(url);

    let finalResults = results;

    if (singleMode) {
      const exactId = parseArtworkIdFromUrl(url);
      if (exactId) {
        finalResults = finalResults.filter((x) => x.id === exactId);
      }
      finalResults = finalResults.slice(0, 1);
    } else {
      finalResults = finalResults.slice(0, limit);
    }

    if (!finalResults.length) {
      console.log("Data karya seni Pixiv tidak ditemukan.");
      fs.writeFileSync("debug-pixiv.html", html, "utf8");
      console.log("File HTML debug telah disimpan ke debug-pixiv.html");
      return;
    }

    console.log("Melengkapi metadata dan tautan gambar original...");
    finalResults = await enrichImages(finalResults);

    console.log(`Metode penarikan data: ${method}`);
    console.log(`Berhasil menemukan ${finalResults.length} data:\n`);

    finalResults.forEach((item, i) => {
      console.log(`=== ${i + 1} ===`);
      console.log("ID        :", item.id || "-");
      console.log("Title     :", item.title || "-");
      console.log("Link      :", item.link || "-");
      console.log("Display   :", item.displayUrl || "-");
      console.log("Image     :", item.image || "-");
      console.log("Artist    :", item.artist || "-");
      console.log("ArtistURL :", item.artistUrl || "-");
      console.log("User ID   :", item.userId || "-");
      console.log("TotalImgs :", item.images?.length || 0);
      console.log("");
    });

    fs.writeFileSync("pixiv-results.json", JSON.stringify(finalResults, null, 2), "utf8");
    console.log("Data telah disimpan ke dalam file pixiv-results.json");

    const answer = (await ask("Apakah kamu ingin mengunduh semua gambar? (y/n): ")).trim().toLowerCase();

    if (answer === "y") {
      console.log("\nMengunduh gambar ke dalam direktori pixiv...\n");
      const result = await downloadAllImages(finalResults);
      console.log(`\nProses pengunduhan selesai.`);
      console.log(`Direktori : ${result.dir}`);
      console.log(`Berhasil  : ${result.success}`);
      console.log(`Gagal     : ${result.failed}`);
    }
  } catch (err) {
    console.error("Terjadi kesalahan sistem:");
    console.error(err.message || err);
  } finally {
    rl.close();
  }
}

main();