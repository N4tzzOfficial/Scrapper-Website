const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function generateBrat(text) {
    if (!text) return;

    console.log(`Generating Brat (White) for text: "${text}"...`);

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    // Default viewport but we'll crop precisely
    await page.setViewport({ width: 800, height: 800 });

    // Load the official site
    await page.goto('https://www.bratgenerator.com/', { waitUntil: 'networkidle2' });

    // Hide cookie banners to allow clear screenshots and unblocked clicks
    await page.addStyleTag({
        content: `
        #onetrust-consent-sdk, .onetrust-pc-dark-filter { display: none !important; }
        .themeSelector, #textInput, #screenshot-blurb, .footerWrapper, .scribimg { display: none !important; }
        /* Hide Howard Stirling watermark */
        a[href*="howardstirling"] { display: none !important; }
        
        body, #memeContainer { background-color: #ffffff !important; }
        #memeContainer { 
            margin: 0 auto !important; 
            width: 600px !important; 
            height: 600px !important; 
            aspect-ratio: 1/1 !important;
            overflow: hidden !important;
            position: relative;
        }
    ` });

    // Enable the white theme by executing the same function the button triggers
    await page.evaluate(() => {
        if (typeof setupTheme === "function") {
            setupTheme('white');
        }
    });

    // Wait for the theme change to settle
    await new Promise(r => setTimeout(r, 200));

    // Clear the default text and inject our custom text natively
    await page.evaluate((inputText) => {
        const input = document.getElementById('textInput');
        if (input) {
            input.value = inputText;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, text);

    // Give textFit time to adjust layout
    await new Promise(r => setTimeout(r, 1000));

    // Grab the meme container for the screenshot
    const element = await page.$('#memeContainer');

    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const outFileName = `brat_${Date.now()}.png`;
    const outPath = path.join(downloadsDir, outFileName);

    // Crop exactly to the meme boundaries
    await element.screenshot({ path: outPath, omitBackground: false });

    await browser.close();
    console.log("Screenshot successfully saved as: " + outPath);
    return outPath;
}

async function main() {
    let inputText = process.argv.slice(2).join(" ");
    if (!inputText) {
        inputText = await askQuestion("Masukkan text untuk Brat (Putih): ");
    }
    if (inputText.trim()) {
        await generateBrat(inputText.trim());
    } else {
        console.log("Text kosong, membatalkan.");
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateBrat };
