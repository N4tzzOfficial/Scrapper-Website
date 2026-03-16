#!/usr/bin/env node

const axios = require("axios");
const cheerio = require("cheerio");
const readline = require("readline");
const fs = require("fs");

const BASE_URL = "https://myanimelist.net";

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

async function fetchHtml(url) {
    const res = await axios.get(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
        timeout: 30000,
    });
    return res.data;
}

/**
 * Scraping search results
 */
async function searchAnime(query) {
    const url = `${BASE_URL}/anime.php?q=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results = [];

    // MAL search results are usually in a table with class 'list-table' or within a div #content
    const rows = $("table tr").filter((i, el) => $(el).find("a.hoverinfo_trigger").length > 0);

    rows.each((i, el) => {
        const row = $(el);
        const anchors = row.find("a.hoverinfo_trigger");

        let title = "";
        let link = "";

        // One anchor has the image, another has the text
        anchors.each((_, a) => {
            const t = cleanText($(a).text());
            if (t) {
                title = t;
                link = absoluteUrl($(a).attr("href"));
            }
        });

        if (!title || !link) return;
        const id = link?.split("/")[4];

        // Try to find score and type in subsequent cells
        const cells = row.find("td");
        let type = "";
        let eps = "";
        let score = "";

        // In MAL search table: 0:img, 1:title/synopsis, 2:type, 3:eps, 4:score
        if (cells.length >= 5) {
            type = cleanText(cells.eq(2).text());
            eps = cleanText(cells.eq(3).text());
            score = cleanText(cells.eq(4).text());
        }

        const image = row.find("img").attr("data-src") || row.find("img").attr("src");

        results.push({ id, title, link, type, eps, score, image });
    });

    return results;
}

/**
 * Scraping anime details
 */
async function getAnimeDetail(idOrUrl) {
    const url = idOrUrl.startsWith("http") ? idOrUrl : `${BASE_URL}/anime/${idOrUrl}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const data = {};
    data.id = url.split("/")[4];
    data.url = url;
    data.title = cleanText($("h1.title-name").text());
    data.title_english = cleanText($(".title-english").text());
    data.image = $(".leftside img").first().attr("data-src") || $(".leftside img").first().attr("src");
    data.synopsis = cleanText($('[itemprop="description"]').text());

    // Left sidebar info
    const sidebar = $(".leftside");
    data.info = {};
    sidebar.find(".spaceit_pad").each((i, el) => {
        const text = $(el).text();
        const split = text.split(":");
        if (split.length >= 2) {
            const key = cleanText(split[0]);
            let val = cleanText(split.slice(1).join(":"));
            if (val === "add some") return;
            data.info[key] = val;
        }
    });

    // Statistics
    data.stats = {};
    data.stats.score = cleanText($(".score-label").text());
    data.stats.ranked = cleanText($(".ranked strong").text());
    data.stats.popularity = cleanText($(".popularity strong").text());
    data.stats.members = cleanText($(".members strong").text());
    data.stats.favorites = cleanText($(".favorites strong").text());

    return data;
}

/**
 * Scraping Genres (Filtered to only actual genres)
 */
async function getGenres() {
    const url = `${BASE_URL}/anime.php`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const genres = [];

    // Filter to only the first genre-link container which is usually "Genres"
    const genreContainer = $(".normal_header:contains('Genres')").next(".genre-link");

    (genreContainer.length ? genreContainer : $(".genre-link")).first().find(".genre-name-link").each((i, el) => {
        const text = cleanText($(el).text());
        const match = text.match(/^(.*)\s\((\d+)\)$/);
        const name = match ? match[1] : text;
        const count = match ? match[2] : "";
        const href = $(el).attr("href");
        const id = href?.split("/")[3];

        if (name && id && href.includes("/anime/genre/")) {
            genres.push({ id, name, count, url: absoluteUrl(href) });
        }
    });

    return genres;
}

async function getAnimeByGenre(genreId) {
    const url = `${BASE_URL}/anime/genre/${genreId}`;
    return getAnimeFromList(url);
}

/**
 * Scraping Seasons
 */
async function getSeasonArchive() {
    const url = `${BASE_URL}/anime/season/archive`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const archiveMap = {};

    $(".anime-seasonal-byseason a").each((i, el) => {
        const text = cleanText($(el).text()); // e.g., "Winter 2026"
        const href = $(el).attr("href");
        if (!text || !href || !href.includes("/anime/season/")) return;

        const match = text.match(/^(\w+)\s+(\d+)$/);
        if (match) {
            const seasonName = match[1];
            const year = match[2];
            const seasonSlug = href.split("/").pop() || seasonName.toLowerCase();

            if (!archiveMap[year]) archiveMap[year] = [];
            archiveMap[year].push({
                name: text,
                year: year,
                season: seasonSlug,
                url: absoluteUrl(href)
            });
        }
    });

    // Convert map to array of { year, seasons } sorted by year descending
    return Object.keys(archiveMap)
        .sort((a, b) => b - a)
        .map(year => ({ year, seasons: archiveMap[year] }));
}

async function getAnimeBySeason(year, season) {
    const url = `${BASE_URL}/anime/season/${year}/${season}`;
    return getAnimeFromList(url);
}

/**
 * Scraping Producer/Studio
 */
async function getAnimeByProducer(id) {
    const url = `${BASE_URL}/anime/producer/${id}`;
    return getAnimeFromList(url);
}

/**
 * Helper to scrape anime list from various pages (Genre, Season, Producer)
 */
async function getAnimeFromList(url) {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results = [];

    $(".seasonal-anime-list .seasonal-anime, .js-categories-seasonal .seasonal-anime").each((i, el) => {
        const box = $(el);
        // Flexible title selector: .link-title (Seasons) or .title a (Producers)
        const anchor = box.find(".link-title, .title a").first();
        const title = cleanText(anchor.text());
        const link = absoluteUrl(anchor.attr("href"));
        const id = link?.split("/")[4];
        const image = box.find("img").attr("data-src") || box.find("img").attr("src");

        // Flexible score selector: .score (Seasons) or .stars (Producers)
        let score = cleanText(box.find(".score").text());
        if (!score) score = cleanText(box.find(".stars").text());

        if (title && link) {
            results.push({ id, title, link, image, score });
        }
    });

    return results;
}

/**
 * UI Functions
 */
function printLine() {
    console.log("--------------------------------------------------");
}

function printAnimeListShort(list) {
    if (!list || list.length === 0) {
        console.log("Tidak ada hasil.");
        return;
    }
    list.slice(0, 20).forEach((item, i) => {
        console.log(`${(i + 1).toString().padEnd(3)}. ${item.title} (Score: ${item.score || "-"})`);
    });
}

function printDetail(data) {
    console.log("\n" + "=".repeat(60));
    console.log(`[${data.id}] ${data.title}`);
    if (data.title_english) console.log(`English: ${data.title_english}`);
    printLine();
    console.log(`Score: ${data.stats.score} | Rank: ${data.stats.ranked} | Pop: ${data.stats.popularity}`);
    console.log(`Members: ${data.stats.members} | Favorites: ${data.stats.favorites}`);
    printLine();

    if (data.info) {
        for (const [k, v] of Object.entries(data.info)) {
            console.log(`${k}: ${v}`);
        }
    }

    printLine();
    console.log("SYNOPSIS:");
    console.log(data.synopsis || "No synopsis available.");
    console.log("=".repeat(60) + "\n");
}

async function handleDetailSelection(list) {
    const select = await ask("\nPilih nomor untuk info detail (0 untuk batal): ");
    const idx = parseInt(select) - 1;

    if (idx >= 0 && idx < list.length) {
        const selected = list[idx];
        console.log(`\nMengambil detail: ${selected.title}...`);
        const detail = await getAnimeDetail(selected.link);
        printDetail(detail);

        const save = await ask("Simpan ke JSON? (y/n): ");
        if (save.toLowerCase() === "y") {
            const filename = `mal_${detail.id}.json`;
            fs.writeFileSync(filename, JSON.stringify(detail, null, 2));
            console.log(`Berhasil disimpan ke ${filename}`);
        }
    }
}

async function main() {
    while (true) {
        console.log("\n=== MYANIMELIST SCRAPER ===");
        console.log("1. Search Anime");
        console.log("2. Browse Genres");
        console.log("3. Browse by Season");
        console.log("4. Info by Studio [id]");
        console.log("5. Info by Producer [id]");
        console.log("6. Anime Info by ID");
        console.log("7. Exit");

        const choice = await ask("Pilih menu: ");

        if (choice === "1") {
            const query = await ask("Masukkan keyword pencarian: ");
            if (!query) continue;
            console.log(`\nMencari "${query}"...`);
            try {
                const results = await searchAnime(query);
                printAnimeListShort(results);
                await handleDetailSelection(results);
            } catch (e) { console.error("Error:", e.message); }

        } else if (choice === "2") {
            console.log("\nMengambil daftar genre...");
            try {
                const genres = await getGenres();
                genres.forEach((g, i) => {
                    process.stdout.write(`${(i + 1).toString().padEnd(3)}. ${g.name.padEnd(20)} `);
                    if ((i + 1) % 3 === 0) console.log("");
                });
                console.log("");
                const select = await ask("\nPilih nomor genre: ");
                const idx = parseInt(select) - 1;
                if (idx >= 0 && idx < genres.length) {
                    const g = genres[idx];
                    console.log(`\nMengambil anime di genre ${g.name}...`);
                    const list = await getAnimeByGenre(g.id);
                    printAnimeListShort(list);
                    await handleDetailSelection(list);
                }
            } catch (e) { console.error("Error:", e.message); }

        } else if (choice === "3") {
            console.log("\nMengambil archive season...");
            try {
                const archive = await getSeasonArchive();
                archive.slice(0, 10).forEach((item, i) => {
                    console.log(`${i + 1}. ${item.year}`);
                });
                const ySelect = await ask("\nPilih tahun: ");
                const yIdx = parseInt(ySelect) - 1;
                if (yIdx >= 0 && yIdx < archive.length) {
                    const yearData = archive[yIdx];
                    yearData.seasons.forEach((s, i) => {
                        console.log(`${i + 1}. ${s.name}`);
                    });
                    const sSelect = await ask("\nPilih season: ");
                    const sIdx = parseInt(sSelect) - 1;
                    if (sIdx >= 0 && sIdx < yearData.seasons.length) {
                        const s = yearData.seasons[sIdx];
                        console.log(`\nMengambil anime di ${s.name} ${s.year}...`);
                        const list = await getAnimeBySeason(s.year, s.season);
                        printAnimeListShort(list);
                        await handleDetailSelection(list);
                    }
                }
            } catch (e) { console.error("Error:", e.message); }

        } else if (choice === "4" || choice === "5") {
            const type = choice === "4" ? "Studio" : "Producer";
            const id = await ask(`Masukkan ${type} ID: `);
            if (!id) continue;
            try {
                console.log(`\nMengambil anime dari ${type} ID ${id}...`);
                const list = await getAnimeByProducer(id);
                printAnimeListShort(list);
                await handleDetailSelection(list);
            } catch (e) { console.error("Error:", e.message); }

        } else if (choice === "6") {
            const id = await ask("Masukkan MAL ID (misal: 21): ");
            if (!id) continue;
            try {
                console.log(`\nMengambil info ID ${id}...`);
                const detail = await getAnimeDetail(id);
                printDetail(detail);
            } catch (e) { console.log("Gagal mengambil data. Pastikan ID benar."); }

        } else if (choice === "7") {
            console.log("Goodbye!");
            rl.close();
            break;
        } else {
            console.log("Pilihan tidak valid.");
        }
    }
}

main();
