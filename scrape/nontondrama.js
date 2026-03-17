const axios = require('axios');
const cheerio = require('cheerio');
const readline = require('readline');
const fs = require('fs');
const chalk = require('chalk');
const boxen = require('boxen');
const Table = require('cli-table3');

const BASE_URL = 'https://tv3.nontondrama.my';

// Color themes
const theme = {
    primary: chalk.cyanBright,
    secondary: chalk.yellowBright,
    success: chalk.greenBright,
    error: chalk.redBright,
    info: chalk.blueBright,
    warning: chalk.hex('#FFA500'),
    highlight: chalk.magentaBright,
    dim: chalk.gray,
    title: chalk.white.bold,
    accent: chalk.hex('#FF69B4')
};

// UI Components
const ui = {
    header: (text) => {
        console.log(boxen(theme.primary(text), {
            padding: 1,
            margin: 1,
            borderStyle: 'double',
            borderColor: 'cyan'
        }));
    },

    subHeader: (text) => {
        console.log(boxen(theme.secondary(text), {
            padding: { left: 2, right: 2 },
            margin: { top: 1, bottom: 0 },
            borderStyle: 'round',
            borderColor: 'yellow'
        }));
    },

    success: (text) => {
        console.log(boxen(theme.success(text), {
            padding: 1,
            margin: 1,
            borderStyle: 'bold',
            borderColor: 'green'
        }));
    },

    error: (text) => {
        console.log(boxen(theme.error(text), {
            padding: 1,
            margin: 1,
            borderStyle: 'double',
            borderColor: 'red'
        }));
    },

    info: (text) => {
        console.log(boxen(theme.info(text), {
            padding: { left: 1, right: 1 },
            margin: { top: 0, bottom: 1 },
            borderStyle: 'classic',
            borderColor: 'blue'
        }));
    },

    divider: () => {
        console.log(theme.dim('═'.repeat(process.stdout.columns || 80)));
    },

    progressBar: (current, total, width = 30) => {
        const percent = Math.round((current / total) * 100);
        const filled = Math.round((current / total) * width);
        const empty = width - filled;
        return theme.success('█'.repeat(filled)) + theme.dim('░'.repeat(empty)) + ` ${theme.primary(percent + '%')}`;
    },

    spinner: (text) => {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        return setInterval(() => {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(theme.primary(frames[i]) + ' ' + text);
            i = (i + 1) % frames.length;
        }, 80);
    }
};

/**
 * Helper to parse movie/series lists from HTML
 */
const parseList = ($) => {
    const results = [];
    $('article figure, .pop-movie-item').each((i, el) => {
        const a = $(el).find('a').first();
        if (!a.length) return;

        let href = a.attr('href');
        if (!href) return;

        const url = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? href : '/' + href}`;
        let slug = href.split('/').filter(Boolean).pop();

        let title = $(el).find('.poster-title').text().trim() || a.find('img').attr('alt') || a.find('img').attr('title');
        let poster = $(el).find('img').attr('src');
        let eps = $(el).find('.episode').text().replace(/EPS/i, '').trim();
        let season = $(el).find('.duration').text().replace(/S\./i, '').trim();
        let year = $(el).find('.year, .pop-movie-year').text().trim();
        let rating = $(el).find('.rating').text().trim() || $(el).find('.pop-movie-info').text().trim();
        let genre = $(el).find('.genre').text().trim();

        results.push({
            title,
            slug,
            url,
            poster,
            episode: eps || null,
            season: season || null,
            year: year || null,
            rating: rating ? rating.replace(/\n| /g, '').slice(0, 3) : null,
            genre: genre ? genre.split(',').map(g => g.trim()) : []
        });
    });

    // Remove duplicates by slug
    const uniqueResults = [];
    const seen = new Set();
    for (const item of results) {
        if (!seen.has(item.slug) && item.slug && item.title) {
            seen.add(item.slug);
            uniqueResults.push(item);
        }
    }

    return uniqueResults;
}

/**
 * Build URL with optional pagination
 */
const getPageUrl = (path, page) => {
    let finalPath = path;
    if (page > 1) {
        if (finalPath.includes('?')) {
            finalPath += `&page=${page}`;
        } else {
            finalPath += `/page/${page}`;
        }
    }
    return `${BASE_URL}${finalPath}`;
}

const search = async (query) => {
    try {
        const baseRes = await axios.get(BASE_URL);
        const $base = cheerio.load(baseRes.data);
        const searchUrl = $base('body').attr('data-search_url') || 'https://gudangvape.com/';
        const thumbnailUrl = $base('body').attr('data-thumbnail_url') || 'https://static-jpg.lk21.party/wp-content/uploads/';

        const apiUrl = `${searchUrl}search.php?s=${encodeURIComponent(query)}&page=1`;

        const res = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': BASE_URL,
                'Origin': BASE_URL
            }
        });

        if (res.data && res.data.data && Array.isArray(res.data.data)) {
            return res.data.data.map(item => {
                let posterUrl = item.poster;
                if (posterUrl && !posterUrl.startsWith('http')) {
                    posterUrl = `${thumbnailUrl}${posterUrl}`;
                }

                return {
                    title: item.title ? item.title.replace(/\(\d{4}\)|\- Series|\- Movie/ig, '').trim() : item.title,
                    slug: item.slug,
                    url: `${BASE_URL}/${item.slug}`,
                    poster: posterUrl,
                    episode: item.episode ? String(item.episode) : null,
                    season: item.season ? String(item.season) : null,
                    year: item.year ? String(item.year) : null,
                    rating: item.rating ? String(item.rating) : null,
                    genre: []
                };
            });
        }
        return [];
    } catch (e) {
        return [];
    }
}

const genre = async (slug, page = 1) => {
    try {
        const res = await axios.get(getPageUrl(`/genre/${slug}`, page));
        return parseList(cheerio.load(res.data));
    } catch (e) {
        return [];
    }
}

const series = async (category = 'ongoing', page = 1) => {
    try {
        const res = await axios.get(getPageUrl(`/series/${category}`, page));
        return parseList(cheerio.load(res.data));
    } catch (e) {
        return [];
    }
}

const country = async (slug, page = 1) => {
    try {
        const res = await axios.get(getPageUrl(`/country/${slug}`, page));
        return parseList(cheerio.load(res.data));
    } catch (e) {
        return [];
    }
}

const year = async (slug, page = 1) => {
    try {
        const res = await axios.get(getPageUrl(`/year/${slug}`, page));
        return parseList(cheerio.load(res.data));
    } catch (e) {
        return [];
    }
}

const recommendations = async () => {
    try {
        const res = await axios.get(BASE_URL);
        const $ = cheerio.load(res.data);

        let targetHTML = null;
        $('.widget').each((i, el) => {
            if ($(el).find('h2').text().toLowerCase().includes('rekomendasi')) {
                targetHTML = $(el).html();
            }
        });

        if (targetHTML) {
            return parseList(cheerio.load(targetHTML));
        }

        return parseList($);
    } catch (e) {
        return [];
    }
}

const getSeriesDetails = async (slug) => {
    try {
        const res = await axios.get(`${BASE_URL}/${slug}`);
        const $ = cheerio.load(res.data);

        let title = $('h1').first().text().replace('Nonton Serial ', '').replace(' Sub Indo', '').trim();
        let poster = $('.detail img').attr('src');
        let synopsis = $('.synopsis').text().trim();

        let info = {};
        $('.detail p').each((i, el) => {
            let text = $(el).text();
            let splits = text.split(':');
            if (splits.length > 1) {
                let key = splits[0].trim().toLowerCase().replace(/ /g, '_');
                let val = splits.slice(1).join(':').trim();
                info[key] = val;
            }
        });

        let tags = [];
        $('.tag-list .tag a').each((i, el) => {
            tags.push($(el).text().trim());
        });

        let rating = $('.info-tag span strong').text().trim();
        let infoTags = [];
        $('.info-tag > span').not(':has(strong)').each((i, el) => {
            let text = $(el).text().trim();
            if (text) infoTags.push(text);
        });

        let episodes = {};
        const seasonDataText = $('#season-data').html();
        if (seasonDataText) {
            try {
                episodes = JSON.parse(seasonDataText);
            } catch (e) { }
        }

        return {
            title,
            poster,
            synopsis,
            rating,
            info_tags: infoTags,
            details: info,
            tags,
            episodes
        };
    } catch (e) {
        return null;
    }
}

const getEpisodeDetails = async (slug) => {
    try {
        const res = await axios.get(`${BASE_URL}/${slug}`);
        const $ = cheerio.load(res.data);

        let title = $('h1').first().text().trim();
        let download_link = $('.movie-action a[title^="Download"]').attr('href');

        let players = [];
        $('#player-list li a').each((i, el) => {
            let url = $(el).data('url') || $(el).attr('href');
            let serverName = $(el).data('server') || $(el).text().trim();
            if (url) {
                players.push({
                    server: serverName,
                    url: url
                });
            }
        });

        let synopsis = $('.synopsis').text().trim();

        return {
            title,
            download_link: download_link || null,
            players,
            synopsis
        };
    } catch (e) {
        return null;
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = async (q) => {
    return new Promise(resolve => {
        rl.question(theme.info(q), resolve);
    });
}

const displayMenu = () => {
    ui.header('🎬 NONTONDRAMA SCRAPER');

    const menu = new Table({
        chars: {
            'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
            'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
            'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
            'right': '║', 'right-mid': '╢', 'middle': '│'
        },
        style: { 'padding-left': 2, 'padding-right': 2 }
    });

    menu.push(
        [theme.primary('1'), theme.secondary('🔍 Search')],
        [theme.primary('2'), theme.secondary('🎭 Genre')],
        [theme.primary('3'), theme.secondary('📺 Series')],
        [theme.primary('4'), theme.secondary('🌍 Negara')],
        [theme.primary('5'), theme.secondary('📅 Tahun')],
        [theme.primary('6'), theme.secondary('⭐ Rekomendasi')]
    );

    console.log(menu.toString());
    console.log();
};

const displayResults = (results) => {
    if (!results || results.length === 0) {
        ui.error('❌ Data tidak ditemukan!');
        return;
    }

    ui.subHeader('📋 HASIL PENCARIAN');

    const resultTable = new Table({
        head: [theme.primary('#'), theme.primary('Judul'), theme.primary('Tahun'), theme.primary('Episode')],
        colWidths: [5, 50, 10, 10],
        style: { head: [], border: [] }
    });

    results.forEach((r, i) => {
        resultTable.push([
            theme.accent(i + 1),
            theme.secondary(r.title.substring(0, 47) + (r.title.length > 47 ? '...' : '')),
            r.year || '-',
            r.episode ? theme.success(r.episode) : '-'
        ]);
    });

    console.log(resultTable.toString());
};

async function main() {
    try {
        displayMenu();

        let option = await ask(theme.info("📌 Pilih menu (1-6): "));

        // Clear console untuk tampilan lebih bersih
        console.clear();

        ui.header('🎬 NONTONDRAMA SCRAPER');

        let results = [];
        let searchQuery = '';

        if (option === '1') {
            ui.subHeader('🔍 PENCARIAN');
            searchQuery = await ask("Masukkan kata kunci pencarian: ");
            ui.info(`Mencari "${searchQuery}"...`);

            const spinner = ui.spinner('Mengambil data...');
            results = await search(searchQuery);
            clearInterval(spinner);
            console.log();

        } else if (option === '2') {
            ui.subHeader('🎭 GENRE');
            searchQuery = await ask("Masukkan genre (contoh: action, comedy, drama): ");
            ui.info(`Mencari genre "${searchQuery}"...`);

            const spinner = ui.spinner('Mengambil data...');
            results = await genre(searchQuery);
            clearInterval(spinner);
            console.log();

        } else if (option === '3') {
            ui.subHeader('📺 SERIES');
            searchQuery = await ask("Masukkan kategori series (ongoing/complete/asian/west): ");
            ui.info(`Mencari series "${searchQuery}"...`);

            const spinner = ui.spinner('Mengambil data...');
            results = await series(searchQuery);
            clearInterval(spinner);
            console.log();

        } else if (option === '4') {
            ui.subHeader('🌍 NEGARA');
            searchQuery = await ask("Masukkan negara (contoh: south-korea, japan): ");
            ui.info(`Mencari negara "${searchQuery}"...`);

            const spinner = ui.spinner('Mengambil data...');
            results = await country(searchQuery);
            clearInterval(spinner);
            console.log();

        } else if (option === '5') {
            ui.subHeader('📅 TAHUN');
            searchQuery = await ask("Masukkan tahun (contoh: 2026): ");
            ui.info(`Mencari tahun "${searchQuery}"...`);

            const spinner = ui.spinner('Mengambil data...');
            results = await year(searchQuery);
            clearInterval(spinner);
            console.log();

        } else if (option === '6') {
            ui.subHeader('⭐ REKOMENDASI');
            ui.info('Mengambil rekomendasi...');

            const spinner = ui.spinner('Mengambil data...');
            results = await recommendations();
            clearInterval(spinner);
            console.log();

        } else {
            ui.error('❌ Pilihan tidak valid!');
            return;
        }

        displayResults(results);

        if (!results || results.length === 0) {
            return;
        }

        let pick = await ask(`\n📌 Pilih nomor untuk melihat detail (1-${results.length}): `);
        let idx = parseInt(pick) - 1;

        if (isNaN(idx) || idx < 0 || idx >= results.length) {
            ui.error('❌ Pilihan tidak valid!');
            return;
        }

        let selected = results[idx];
        ui.subHeader(`📖 DETAIL SERIES: ${selected.title}`);

        ui.info('Mengambil detail series...');
        const spinner = ui.spinner('Loading...');

        let detail = await getSeriesDetails(selected.slug);
        clearInterval(spinner);
        console.log();

        if (!detail) {
            ui.error('❌ Gagal mengambil detail!');
            return;
        }

        // Display series details in a nice format
        console.log();
        ui.divider();

        const infoTable = new Table({
            style: { 'padding-left': 2, 'padding-right': 2 }
        });

        infoTable.push(
            [theme.primary('📌 Judul'), theme.secondary(detail.title)],
            [theme.primary('⭐ Rating'), theme.success(detail.rating || 'N/A')],
            [theme.primary('🏷️ Tags'), theme.info((detail.tags || []).join(', ') || 'N/A')],
            [theme.primary('ℹ️ Info'), theme.info((detail.info_tags || []).join(', ') || 'N/A')]
        );

        console.log(infoTable.toString());
        ui.divider();

        // Display additional details
        if (Object.keys(detail.details).length > 0) {
            console.log(theme.primary('\n📋 INFORMASI TAMBAHAN:'));
            const detailTable = new Table();
            for (let k in detail.details) {
                detailTable.push([theme.secondary(k), theme.info(detail.details[k])]);
            }
            console.log(detailTable.toString());
        }

        console.log(theme.primary('\n📝 SINOPSIS:'));
        console.log(theme.dim(detail.synopsis || 'Tidak ada sinopsis'));

        let epsList = [];
        if (detail.episodes) {
            for (let s in detail.episodes) {
                epsList = epsList.concat(detail.episodes[s]);
            }
        }

        let fullData = { ...detail };

        if (epsList.length > 0) {
            ui.subHeader(`📺 DAFTAR EPISODE (${epsList.length} Episode)`);

            const episodeTable = new Table({
                head: [theme.primary('#'), theme.primary('Judul Episode')],
                colWidths: [8, 70],
                style: { head: [], border: [] }
            });

            let start = 0;
            if (epsList.length > 50) {
                ui.warning('⚠️ Daftar episode terlalu banyak, menampilkan 50 episode terakhir.');
                start = epsList.length - 50;
            }

            for (let i = start; i < epsList.length; i++) {
                episodeTable.push([
                    theme.accent(i + 1),
                    theme.secondary(epsList[i].title.substring(0, 67) + (epsList[i].title.length > 67 ? '...' : ''))
                ]);
            }

            console.log(episodeTable.toString());

            let epPick = await ask(`\n📌 Pilih episode untuk melihat link player (1-${epsList.length}), kosongkan untuk lewati: `);

            if (epPick.trim() !== '') {
                let epIdx = parseInt(epPick) - 1;
                if (!isNaN(epIdx) && epIdx >= 0 && epIdx < epsList.length) {
                    ui.subHeader(`🎬 DETAIL EPISODE: ${epsList[epIdx].title}`);

                    ui.info('Mengambil detail episode...');
                    const epSpinner = ui.spinner('Loading...');

                    let epData = await getEpisodeDetails(epsList[epIdx].slug);
                    clearInterval(epSpinner);
                    console.log();

                    if (epData) {
                        console.log();
                        ui.divider();

                        console.log(theme.primary('📌 Judul: ') + theme.secondary(epData.title));

                        if (epData.download_link) {
                            console.log(theme.primary('📥 Download: ') + theme.success(epData.download_link));
                        }

                        if (epData.players && epData.players.length > 0) {
                            console.log(theme.primary('\n🎮 PLAYERS:'));
                            epData.players.forEach((p, idx) => {
                                console.log(theme.accent(`  ${idx + 1}. [${p.server}] `) + theme.info(p.url));
                            });
                        }

                        if (epData.synopsis) {
                            console.log(theme.primary('\n📝 Sinopsis: '));
                            console.log(theme.dim(epData.synopsis));
                        }

                        fullData.selected_episode = epData;
                    } else {
                        ui.error('❌ Gagal mendapatkan link episode!');
                    }
                }
            }
        }
    } catch (e) {
        ui.error('❌ Terjadi error!');
        console.error(theme.error(e.message));
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    // Check if required packages are installed
    const requiredPackages = ['chalk', 'boxen', 'cli-table3'];
    const missingPackages = [];

    requiredPackages.forEach(pkg => {
        try {
            require.resolve(pkg);
        } catch (e) {
            missingPackages.push(pkg);
        }
    });

    if (missingPackages.length > 0) {
        console.log(chalk.red('❌ Package berikut diperlukan:'));
        missingPackages.forEach(pkg => {
            console.log(chalk.yellow(`   - ${pkg}`));
        });
        console.log(chalk.green('\n📦 Install dengan:'));
        console.log(chalk.cyan(`npm install ${missingPackages.join(' ')}`));
        process.exit(1);
    }

    main();
}

module.exports = {
    search,
    genre,
    series,
    country,
    year,
    recommendations,
    getSeriesDetails,
    getEpisodeDetails
};