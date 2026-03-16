#!/usr/bin/env node

const axios = require("axios");
const cheerio = require("cheerio");
const readline = require("readline");
const fs = require("fs");

const BASE_URL = "https://kusonime.com";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, BASE_URL).toString();
}

function pickBestImage(imgEl) {
  if (!imgEl || !imgEl.length) return null;

  const src =
    imgEl.attr("src") ||
    imgEl.attr("data-src") ||
    imgEl.attr("data-lazy-src") ||
    null;

  const srcset = imgEl.attr("srcset");
  if (srcset) {
    const parts = srcset
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (parts.length) {
      const last = parts[parts.length - 1].split(" ")[0];
      if (last) return absoluteUrl(last);
    }
  }

  return absoluteUrl(src);
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      Referer: BASE_URL + "/",
    },
    timeout: 30000,
    maxRedirects: 5,
  });

  return res.data;
}

function parseAnimeCardsFromHomepage(html) {
  const $ = cheerio.load(html);
  const results = [];

  $(".rseries .venz .kover").each((_, el) => {
    const card = $(el);
    const anchor = card.find(".content h2.episodeye a").first();
    const img = card.find(".thumb img").first();

    const title = cleanText(anchor.text() || anchor.attr("title"));
    const link = absoluteUrl(anchor.attr("href"));
    const image = pickBestImage(img);

    const paragraphs = card.find(".content p");
    const releasedText = cleanText(
      $(paragraphs.get(1)).text().replace(/^Released on/i, "")
    );

    const genres = [];
    $(paragraphs.get(2))
      .find("a")
      .each((_, g) => {
        const genre = cleanText($(g).text());
        if (genre) genres.push(genre);
      });

    if (title && link) {
      results.push({
        title,
        link,
        image,
        released: releasedText || null,
        genres,
      });
    }
  });

  return results;
}

function parseAnimeCardsFromSearch(html) {
  const $ = cheerio.load(html);
  const results = [];

  $(".kover, .detpost, article, .post").each((_, el) => {
    const root = $(el);

    const anchor =
      root.find("h2.episodeye a").first().length
        ? root.find("h2.episodeye a").first()
        : root.find("h2 a").first();

    const img =
      root.find(".thumb img").first().length
        ? root.find(".thumb img").first()
        : root.find("img").first();

    const title = cleanText(anchor.text() || anchor.attr("title"));
    const link = absoluteUrl(anchor.attr("href"));
    const image = pickBestImage(img);

    if (!title || !link) return;
    if (!/kusonime\.com/i.test(link)) return;

    const paragraphs = root.find(".content p, p");
    let released = null;
    const genres = [];

    paragraphs.each((_, p) => {
      const pText = cleanText($(p).text());

      if (/Released on/i.test(pText) && !released) {
        released = cleanText(pText.replace(/^.*Released on/i, ""));
      }

      $(p)
        .find("a")
        .each((__, a) => {
          const genre = cleanText($(a).text());
          if (genre && !genres.includes(genre)) genres.push(genre);
        });
    });

    results.push({
      title,
      link,
      image,
      released,
      genres,
    });
  });

  const unique = [];
  const seen = new Set();

  for (const item of results) {
    if (!item.link || seen.has(item.link)) continue;
    seen.add(item.link);
    unique.push(item);
  }

  return unique;
}

function buildSearchUrl(query) {
  return `${BASE_URL}/?s=${encodeURIComponent(query)}&post_type=post`;
}

async function getLatestUpdates() {
  const html = await fetchHtml(BASE_URL + "/");
  return parseAnimeCardsFromHomepage(html);
}

async function searchAnime(query) {
  const html = await fetchHtml(buildSearchUrl(query));
  return parseAnimeCardsFromSearch(html);
}

function extractInfoMap($, container) {
  const info = {};
  container.find("p").each((_, p) => {
    const bold = $(p).find("b").first();
    if (!bold.length) return;

    const key = cleanText(bold.text()).replace(/\s*:\s*$/, "");
    const rawText = cleanText($(p).text());

    let value = rawText.replace(bold.text(), "");
    value = value.replace(/^:\s*/, "").trim();

    if (!value) {
      const links = [];
      $(p)
        .find("a")
        .each((__, a) => {
          const txt = cleanText($(a).text());
          if (txt) links.push(txt);
        });
      value = links.join(", ");
    }

    if (key && value) {
      info[key] = value;
    }
  });

  return info;
}

function parseSynopsis($, root) {
  const synopsis = [];
  let started = false;

  root.contents().each((_, node) => {
    const el = $(node);

    if (!started) {
      if (el.hasClass("info")) {
        started = true;
      }
      return;
    }

    if (el.hasClass("dlbodz")) return false;
    if (el.hasClass("socialshare")) return false;
    if (el.hasClass("tagser")) return false;
    if (el.hasClass("infolink")) return false;

    if (node.type === "text") {
      const t = cleanText(el.text());
      if (t) synopsis.push(t);
      return;
    }

    if (node.name === "p") {
      const text = cleanText(el.text());

      if (!text) return;

      if (/^Credit\s*:/i.test(text)) return;
      if (/^Anime Sebelumnya/i.test(text)) return;
      if (/^Download /i.test(text)) return;
      if (/^Tolong di Baca/i.test(text)) return;

      synopsis.push(text);
    }
  });

  return synopsis.join("\n\n").trim();
}

function parseDownloads($) {
  const downloads = [];

  $(".dlbodz .smokeurlrh").each((_, el) => {
    const row = $(el);
    const quality = cleanText(row.find("strong").first().text());

    const links = [];
    row.find("a").each((__, a) => {
      const host = cleanText($(a).text());
      const href = absoluteUrl($(a).attr("href"));
      if (host && href) {
        links.push({ host, url: href });
      }
    });

    if (quality && links.length) {
      downloads.push({ quality, links });
    }
  });

  return downloads;
}

async function getAnimeDetail(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title =
    cleanText($(".post-thumb h1.jdlz").first().text()) ||
    cleanText($("title").text().replace(/\|\s*Kusonime/i, ""));

  const banner =
    pickBestImage($(".post-thumb img").first()) ||
    absoluteUrl($('meta[property="og:image"]').attr("content"));

  const infoContainer = $(".lexot .info").first();
  const info = extractInfoMap($, infoContainer);

  const synopsis = parseSynopsis($, $(".venutama").first());

  const downloads = parseDownloads($);

  return {
    title,
    url,
    banner,
    info,
    synopsis,
    downloads,
  };
}

function printAnimeList(items) {
  console.log("\nDaftar anime:\n");

  items.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.title}`);
    console.log(`   Link     : ${item.link}`);
    console.log(`   Banner   : ${item.image || "-"}`);
    console.log(`   Released : ${item.released || "-"}`);
    console.log(`   Genre    : ${item.genres?.length ? item.genres.join(", ") : "-"}`);
    console.log("");
  });
}

function printAnimeDetail(data) {
  console.log("\n========== DETAIL ANIME ==========\n");
  console.log(`Judul   : ${data.title || "-"}`);
  console.log(`Link    : ${data.url || "-"}`);
  console.log(`Banner  : ${data.banner || "-"}`);

  console.log("\n--- INFO ANIME ---");
  if (Object.keys(data.info).length) {
    for (const [key, value] of Object.entries(data.info)) {
      console.log(`${key}: ${value}`);
    }
  } else {
    console.log("-");
  }

  console.log("\n--- SYNOPSIS ---");
  console.log(data.synopsis || "-");

  console.log("\n--- DOWNLOAD ---");
  if (data.downloads.length) {
    for (const item of data.downloads) {
      console.log(`\n[${item.quality}]`);
      item.links.forEach((link, idx) => {
        console.log(`${idx + 1}. ${link.host}: ${link.url}`);
      });
    }
  } else {
    console.log("-");
  }
}

async function main() {
  try {
    console.log("=== Kusonime Scraper ===");
    console.log("Kosongkan judul untuk mengambil Updatan Terbaru.\n");

    const keyword = cleanText(await ask("Masukkan judul anime: "));
    const limitRaw = cleanText(await ask("Masukkan limit daftar (default 10): "));
    const limit = Number(limitRaw) > 0 ? Number(limitRaw) : 10;

    let results = [];

    if (!keyword) {
      console.log("\nMengambil updatan terbaru...\n");
      results = await getLatestUpdates();
    } else {
      console.log(`\nMencari anime: ${keyword}\n`);
      results = await searchAnime(keyword);
    }

    results = results.slice(0, limit);

    if (!results.length) {
      console.log("Tidak ada anime yang ditemukan.");
      return;
    }

    printAnimeList(results);

    const chooseRaw = cleanText(
      await ask(`Pilih nomor anime (1-${results.length}): `)
    );
    const choose = Number(chooseRaw);

    if (!choose || choose < 1 || choose > results.length) {
      console.log("Nomor pilihan tidak valid.");
      return;
    }

    const selected = results[choose - 1];
    console.log(`\nMengambil detail: ${selected.title}\n`);

    const detail = await getAnimeDetail(selected.link);
    printAnimeDetail(detail);

    const save = cleanText(await ask("\nSimpan hasil ke JSON? (y/n): "));
    if (/^y(es)?$/i.test(save)) {
      const filename = "kusonime-detail.json";
      fs.writeFileSync(filename, JSON.stringify(detail, null, 2), "utf8");
      console.log(`Data disimpan ke ${filename}`);
    }
  } catch (err) {
    console.error("Terjadi error:");
    console.error(err.message || err);
  } finally {
    await delay(50);
    rl.close();
  }
}

main();