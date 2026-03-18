#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const crypto = require("crypto");
const readline = require("readline");
const cliProgress = require("cli-progress");
const bytes = require("bytes");
const chalk = require("chalk");

let rl;
if (require.main === module) {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

function ask(q) {
    return new Promise((resolve) => rl.question(chalk.cyan(q), resolve));
}

function createSpinner(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;

    const spinner = setInterval(() => {
        process.stdout.write(`\r${chalk.cyan(frames[i])} ${text}`);
        i = (i + 1) % frames.length;
    }, 80);

    return {
        stop: (clear = false) => {
            clearInterval(spinner);
            if (clear) {
                process.stdout.write('\r' + ' '.repeat(process.stdout.columns || 80) + '\r');
            } else {
                process.stdout.write('\n');
            }
        },
        update: (newText) => {
            text = newText;
        }
    };
}

async function downloadFile(url, outputPath, fileName) {
    const res = await axios.get(url, {
        responseType: "stream",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
        timeout: 120000,
    });

    const totalBytes = parseInt(res.headers['content-length'] || '0', 10);

    const progressBar = new cliProgress.SingleBar({
        format: chalk.cyan('📥 Downloading') + ' |' + chalk.cyan('{bar}') + '| ' +
            chalk.yellow('{percentage}%') + ' | ' +
            chalk.green('{value}') + '/' + chalk.green('{total}') + ' | ' +
            chalk.magenta('⚡ {speed}'),
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: false,
        stopOnComplete: true,
        formatBar: function (bar, options) {
            const barLength = 30;
            const completeLength = Math.round(barLength * options.progress);
            const incompleteLength = barLength - completeLength;
            return chalk.cyan('█').repeat(completeLength) + chalk.gray('░').repeat(incompleteLength);
        }
    }, cliProgress.Presets.shades_classic);

    progressBar.start(totalBytes, 0, {
        speed: '0 B/s',
        value: '0 B',
        total: totalBytes ? bytes(totalBytes) : 'Unknown'
    });

    let downloadedBytes = 0;
    let startTime = Date.now();
    let lastUpdateTime = Date.now();
    let lastBytes = 0;

    res.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;

        const now = Date.now();
        if (now - lastUpdateTime > 200) {
            const elapsedSeconds = (now - startTime) / 1000;
            const instantSpeed = (downloadedBytes - lastBytes) / ((now - lastUpdateTime) / 1000);

            progressBar.update(downloadedBytes, {
                speed: bytes(instantSpeed) + '/s',
                value: bytes(downloadedBytes),
                total: totalBytes ? bytes(totalBytes) : 'Unknown'
            });

            lastUpdateTime = now;
            lastBytes = downloadedBytes;
        }
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);

        res.data.pipe(writer);

        writer.on('finish', () => {
            progressBar.update(downloadedBytes, {
                speed: '0 B/s',
                value: bytes(downloadedBytes),
                total: totalBytes ? bytes(totalBytes) : bytes(downloadedBytes)
            });
            progressBar.stop();
            console.log(chalk.green('\n✓ Download selesai!'));
            resolve();
        });

        writer.on('error', (err) => {
            progressBar.stop();
            reject(err);
        });

        res.data.on('error', (err) => {
            progressBar.stop();
            reject(err);
        });
    });
}

async function fetchVideoData(input) {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const SERIAL = crypto.createHash('md5').update(UA + Date.now()).digest('hex');

    const headers = (extra = {}) => Object.assign({
        'accept': '*/*',
        'product-serial': SERIAL,
        'user-agent': UA,
        'Referer': 'https://unblurimage.ai/'
    }, extra);

    let spinner = createSpinner(chalk.dim('Memproses input video...'));

    let videoBuffer;
    try {
        if (input.startsWith('http://') || input.startsWith('https://')) {
            spinner.update(chalk.dim('Mengunduh video dari URL...'));
            const res = await axios.get(input, { responseType: 'arraybuffer' });
            const contentType = res.headers['content-type'] || '';
            if (!contentType.includes('video') && !input.match(/\.(mp4|webm|mkv|mov)(\?.*)?$/i)) {
                spinner.stop(true);
                console.log(chalk.yellow('⚠ Peringatan: Tautan mungkin bukan video atau gagal dideteksi. Melanjutkan...'));
                spinner = createSpinner(chalk.dim('Melanjutkan proses...'));
            }
            videoBuffer = Buffer.from(res.data);
        } else {
            const ext = path.extname(input).toLowerCase();
            if (!['.mp4', '.webm', '.mkv', '.mov', '.avi'].includes(ext)) {
                spinner.stop(true);
                console.log(chalk.yellow('⚠ Peringatan: Ekstensi file bukan video umum. Melanjutkan...'));
                spinner = createSpinner(chalk.dim('Melanjutkan proses...'));
            }
            if (!fs.existsSync(input)) {
                throw new Error(`File lokal tidak ditemukan: ${input}`);
            }
            videoBuffer = fs.readFileSync(input);
        }

        spinner.update(chalk.dim('Mengunggah video ke server AI...'));

        const fileName = crypto.randomBytes(3).toString('hex') + '_video.mp4';
        const formReg = new FormData();
        formReg.append('video_file_name', fileName);

        const reg = await axios.post(
            'https://api.unblurimage.ai/api/upscaler/v1/ai-video-enhancer/upload-video',
            formReg,
            { headers: Object.assign(headers(), formReg.getHeaders()) }
        );

        const { url: ossUrl, object_name: objectName } = reg.data.result;

        spinner.update(chalk.dim('Menyimpan file ke cloud platform...'));

        await axios.put(ossUrl, videoBuffer, {
            headers: { 'Content-Type': 'video/mp4', 'User-Agent': UA }
        });

        spinner.update(chalk.dim('Membuat pekerjaan AI (Enhancing ke 2K)...'));

        const formJob = new FormData();
        formJob.append('original_video_file', `https://cdn.unblurimage.ai/${objectName}`);
        formJob.append('resolution', '2k');
        formJob.append('is_preview', 'false');

        const create = await axios.post(
            'https://api.unblurimage.ai/api/upscaler/v2/ai-video-enhancer/create-job',
            formJob,
            { headers: Object.assign(headers(), formJob.getHeaders()) }
        );

        const jobId = create.data.result.job_id;
        if (!jobId) throw new Error('Gagal membuat job');

        let outputUrl = null;

        spinner.update(chalk.dim('Menunggu proses AI selesai (bisa memakan waktu beberapa menit)...'));

        for (let i = 0; i < 120; i++) { // Increase wait time because video processing can be long
            await new Promise(resolve => setTimeout(resolve, 5000));

            try {
                const check = await axios.get(
                    `https://api.unblurimage.ai/api/upscaler/v2/ai-video-enhancer/get-job/${jobId}`,
                    { headers: headers() }
                );

                if (check.data.result?.output_url) {
                    outputUrl = check.data.result.output_url;
                    break;
                } else {
                    const statusText = check.data.result?.status || 'Processing';
                    const progress = check.data.result?.progress || '0';
                    spinner.update(chalk.dim(`Status AI: ${statusText} | Progress: ${progress}%...`));
                }
            } catch (err) {
                // Ignore temporary fetch error
            }
        }

        spinner.stop(true);

        if (!outputUrl) throw new Error('Timeout atau gagal memproses dari server AI (Server sangat sibuk atau file terlalu besar)');

        return {
            status: true,
            result: outputUrl
        };
    } catch (err) {
        if (spinner) spinner.stop(true);
        throw err;
    }
}

module.exports = async function handleHdVideo(input, { rl: passedRl } = {}) {
    const activeRl = passedRl || rl;
    console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════╗
║             HD VIDEO ENHANCER            ║
╚══════════════════════════════════════════╝
    `));

    try {
        console.log(chalk.dim('\n⏳ Memulai proses. Tergantung ukuran, proses dapat memakan waktu lama...\n'));

        const data = await fetchVideoData(input);

        if (!data || !data.status) {
            console.log(chalk.red('\n✗ Gagal menskalakan video.'));
            return;
        }

        console.log(chalk.green('✓ AI Video Enhancement Selesai!\n'));
        console.log(chalk.bold('🔗 Link Output: ') + chalk.cyan(data.result) + '\n');

        const downloadDir = path.join(process.cwd(), "downloads");
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir);
            console.log(chalk.green('✓ Folder downloads dibuat'));
        }

        const fileName = "Enhanced_" + crypto.randomBytes(4).toString('hex') + ".mp4";
        const outputPath = path.join(downloadDir, fileName);

        console.log(chalk.dim(`Mempersiapkan unduhan file akhir...`));
        console.log(chalk.bold('📁 File: ') + chalk.cyan(fileName));
        console.log('');

        console.log(chalk.bold('📥 Memulai download hasil...\n'));
        await downloadFile(data.result, outputPath, fileName);

        console.log(chalk.green.bold('\n✨ Berhasil disimpan! ✨'));
        console.log(chalk.dim('📂 Lokasi: ') + chalk.cyan(outputPath));
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(chalk.dim('💾 Ukuran: ') + chalk.green(bytes(stats.size)));
        }

        console.log(chalk.green.bold('\n🎉 Semua proses selesai!'));

    } catch (err) {
        console.log(chalk.red('\n✗ Terjadi kesalahan:'));
        console.log(chalk.red(err.response?.data?.message || err.message));
    }
};

if (require.main === module) {
    (async () => {
        console.clear();
        try {
            let input = (await ask("📎 Masukkan URL Video atau Path File lokal: ")).trim();

            if (!input) {
                console.log(chalk.red('\n✗ Input tidak boleh kosong!'));
                process.exit(1);
            }

            await module.exports(input);
        } finally {
            if (rl) rl.close();
        }
    })();

    process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n⏹ Program dihentikan oleh user.'));
        process.exit(0);
    });
}
