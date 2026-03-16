#!/usr/bin/env node

const readline = require("readline");
const chalk = require("chalk");

const handleYoutube = require("./youtube.js");
const handleInstagram = require("./instagram.js");
const handleTiktok = require("./tiktok.js");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(q) {
    return new Promise((resolve) => rl.question(chalk.cyan(q), resolve));
}

function detectPlatform(url) {
    if (url.includes("youtube.com/watch") || url.includes("youtu.be/")) {
        return "youtube";
    }
    if (url.includes("instagram.com/")) {
        return "instagram";
    }
    if (url.includes("tiktok.com/")) {
        return "tiktok";
    }
    return null;
}

async function main() {
    console.clear();

    console.log(chalk.bold.yellow(`
╔════════════════════════════════════════════════════╗
║             ALL-IN-ONE MEDIA DOWNLOADER            ║
║         (YouTube, Instagram, TikTok Support)       ║
╚════════════════════════════════════════════════════╝
    `));

    try {
        const urlInput = (await ask("📎 Masukkan URL Media: ")).trim();

        if (!urlInput) {
            console.log(chalk.red('\n✗ URL tidak boleh kosong!'));
            return;
        }

        const platform = detectPlatform(urlInput);

        if (!platform) {
            console.log(chalk.red('\n✗ URL tidak dikenali atau tidak didukung!'));
            console.log(chalk.dim('ℹ Mohon masukkan URL dari YouTube, Instagram, atau TikTok.'));
            return;
        }

        console.log(chalk.green(`\n✓ Terdeteksi URL dari: `) + chalk.bold.white(platform.toUpperCase()));

        // We pass 'rl' so we don't have to spawn multiple readline interfaces
        switch (platform) {
            case "youtube":
                await handleYoutube(urlInput, { rl });
                break;
            case "instagram":
                await handleInstagram(urlInput, { rl });
                break;
            case "tiktok":
                await handleTiktok(urlInput, { rl });
                break;
        }

    } catch (err) {
        console.log(chalk.red('\n✗ Terjadi kesalahan pada sistem: ' + err.message));
    } finally {
        rl.close();
    }
}

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⏹ Program dihentikan oleh user.'));
    process.exit(0);
});

main();
