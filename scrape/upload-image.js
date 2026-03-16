const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline');

/**
 * Uploads an image to the specified host.
 * @param {string} filePath - The absolute or relative path to the image file.
 * @returns {Promise<Object>} The response data from the server.
 */
async function uploadImage(filePath) {
    try {
        const resolvedPath = path.resolve(filePath);

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File not found at: ${resolvedPath}`);
        }

        const formData = new FormData();
        formData.append('file', fs.createReadStream(resolvedPath));

        // Note: The curl endpoint was just /api/upload. Here we need a full URL if it's external,
        // or we assume it's a specific known host if this is part of a larger project.
        // I will use a placeholder domain that the user must change, or if the user meant 
        // to upload to their own server, they need to supply the base URL.
        const baseUrl = process.env.UPLOAD_BASE_URL || 'https://telegra.ph'; // Using telegra.ph as a fallback/example public image host if not specified, but let's point to user's intended host if possible.

        let targetUrl = `${baseUrl}/api/upload`;

        // Let's actually use a common temporary image host for the script unless they have a specific one
        // If they meant their own deployed scrapper website, they should set UPLOAD_BASE_URL
        // The prompt said: await fetch("/api/upload", ...) which implies a relative path on a frontend.
        // For CLI, we need an absolute domain.

        if (!process.env.UPLOAD_BASE_URL) {
            targetUrl = `https://cloud.vtx.my.id/api/upload`; // Defaulting to localhost if not provided
            console.log(chalk.gray(`   Defaulting to ${targetUrl}...\n`));
        }

        const response = await axios.post(targetUrl, formData, {
            headers: {
                ...formData.getHeaders(),
            },
        });

        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(`Upload failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

// CLI Integration
if (require.main === module) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(chalk.cyan.bold('\n=== Image Uploader ===\n'));

    rl.question(chalk.green('? ') + 'Masukkan path file gambar (contoh: ./image.png): ', async (answer) => {
        let filePath = answer.trim();

        // Strip quotes if any (common when copy-pasting paths with spaces)
        if ((filePath.startsWith('"') && filePath.endsWith('"')) || (filePath.startsWith("'") && filePath.endsWith("'"))) {
            filePath = filePath.slice(1, -1);
        }

        if (!filePath) {
            console.log(chalk.red('❌ Path file tidak boleh kosong.'));
            rl.close();
            return;
        }

        console.log(chalk.blue(`\n🚀 Mengunggah file dari: ${filePath} ...`));

        try {
            const result = await uploadImage(filePath);
            console.log(chalk.green('\n✅ Berhasil mengunggah gambar!'));

            if (result.success && result.file) {
                const file = result.file;
                const baseUrl = 'https://cloud.vtx.my.id';

                // Format size to MB or KB
                const sizeStr = file.size > 1024 * 1024
                    ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
                    : (file.size / 1024).toFixed(2) + ' KB';

                console.log(chalk.cyan('--------------------------------------------'));
                console.log(chalk.white('📄 Nama File    : ') + chalk.yellow(file.originalName));
                console.log(chalk.white('⚖️  Ukuran       : ') + chalk.yellow(sizeStr));
                console.log(chalk.white('🏷️  Tipe         : ') + chalk.yellow(file.type));
                console.log(chalk.cyan('--------------------------------------------'));
                console.log(chalk.white('🌐 Preview Link : ') + chalk.blue.underline(`${baseUrl}/u/${file.id}`));
                console.log(chalk.white('📥 Download Link: ') + chalk.blue.underline(`${baseUrl}/d/${file.id}`));
                console.log(chalk.cyan('--------------------------------------------'));
            } else {
                console.log(chalk.white('Respons Server:'));
                console.log(result);
            }
        } catch (error) {
            console.log(chalk.red('\n❌ Gagal mengunggah gambar.'));
            console.error(chalk.red(error.message));
        } finally {
            rl.close();
        }
    });
}

module.exports = { uploadImage };
