const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();
const cors = require('cors');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

const imagesDir = path.join(__dirname, 'images');
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');

[imagesDir, uploadsDir, outputDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
});

const images = fs.readdirSync(imagesDir).filter(file => /\.(jpg|jpeg|png)$/.test(file));

const fonts = {
    'custom': path.join(__dirname, 'Noot3.fnt'),
};

async function createMeme(imagePath, text) {
    try {
        const image = await Jimp.read(imagePath);
        const font = await Jimp.loadFont(fonts['custom']);
        const maxWidth = image.bitmap.width - 40;

        const textImage = new Jimp(image.bitmap.width, image.bitmap.height);
        textImage.print(font, 0, 0, { text, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, maxWidth);

        const textHeight = Jimp.measureTextHeight(font, text, maxWidth);
        const y = image.bitmap.height - textHeight - 150;

        image.composite(textImage, 0, y, {
            mode: Jimp.BLEND_SOURCE_OVER,
            opacitySource: 1,
            opacityDest: 1
        });

        const outputPath = path.join(outputDir, `meme-${Date.now()}.png`);
        await image.writeAsync(outputPath);
        return outputPath;
    } catch (error) {
        console.error('Error creating meme:', error);
        throw error;
    }
}

bot.onText(/\/memebot/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Welcome to DADA Meme Bot, time to get absurd! 🍭 Use /upload to use your own image or /library to choose a premade image. Loading the library will take a few seconds.');
});
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Welcome to DADA Meme Bot, time to get absurd! 🍭 Use /upload to use your own image or /library to choose a premade image. Loading the library will take a few seconds.');
});

bot.onText(/\/upload/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Please upload an image.');
    bot.once('photo', async (msg) => {
        const messageIdsToDelete = [msg.message_id];
        try {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const filePath = await bot.getFileLink(fileId);
            const image = await Jimp.read(filePath);
            const localPath = path.join(uploadsDir, `${fileId}.jpg`);
            await image.writeAsync(localPath);
            const textMsg = await bot.sendMessage(msg.chat.id, 'Image uploaded. Now send the caption text.');
            messageIdsToDelete.push(textMsg.message_id);
            bot.once('message', async (msg) => {
                const text = msg.text;
                messageIdsToDelete.push(msg.message_id);
                const memePath = await createMeme(localPath, text);
                await bot.sendPhoto(msg.chat.id, memePath);
                messageIdsToDelete.forEach(messageId => bot.deleteMessage(msg.chat.id, messageId));
            });
        } catch (error) {
            console.error('Error handling upload:', error);
            bot.sendMessage(msg.chat.id, 'An error occurred while processing your upload. Please try again.');
        }
    });
});

bot.onText(/\/library/, async (msg) => {
    try {
        const updatedImages = fs.readdirSync(imagesDir).filter(file => /\.(jpg|jpeg|png)$/.test(file));
        const messageIdsToDelete = [];

        const thumbnailPromises = updatedImages.map(async (image, index) => {
            const imagePath = path.join(imagesDir, image);
            const imageBuffer = await Jimp.read(imagePath);
            imageBuffer.resize(100, Jimp.AUTO);
            const thumbnailPath = path.join(outputDir, `thumb-${index}.jpg`);
            await imageBuffer.writeAsync(thumbnailPath);
            return thumbnailPath;
        });

        const thumbnails = await Promise.all(thumbnailPromises);

        for (let thumbnail of thumbnails) {
            const sentMessage = await bot.sendPhoto(msg.chat.id, thumbnail);
            messageIdsToDelete.push(sentMessage.message_id);
        }

        const options = updatedImages.map((image, index) => [
            { text: `Image ${index + 1}`, callback_data: `choose_${index}` }
        ]);

        const keyboardMsg = await bot.sendMessage(msg.chat.id, 'Choose an image:', {
            reply_markup: {
                inline_keyboard: options
            }
        });
        messageIdsToDelete.push(keyboardMsg.message_id);

        bot.once('callback_query', async (callbackQuery) => {
            const action = callbackQuery.data;
            const msg = callbackQuery.message;
            messageIdsToDelete.push(msg.message_id);

            if (action.startsWith('choose_')) {
                const index = parseInt(action.split('_')[1], 10);
                const chosenImage = updatedImages[index];
                const imagePath = path.join(imagesDir, chosenImage);

                const textMsg = await bot.sendMessage(msg.chat.id, 'Image chosen. Now send the caption text.');
                messageIdsToDelete.push(textMsg.message_id);
                bot.once('message', async (msg) => {
                    const text = msg.text;
                    messageIdsToDelete.push(msg.message_id);
                    const memePath = await createMeme(imagePath, text);
                    await bot.sendPhoto(msg.chat.id, memePath);
                    messageIdsToDelete.forEach(messageId => bot.deleteMessage(msg.chat.id, messageId));
                });
            }
        });
    } catch (error) {
        console.error('Error generating thumbnails:', error);
        bot.sendMessage(msg.chat.id, 'An error occurred while fetching images. Please try again.');
    }
});

bot.onText(/\/removeimage/, async (msg) => {
    try {
        const updatedImages = fs.readdirSync(imagesDir).filter(file => /\.(jpg|jpeg|png)$/.test(file));

        const options = updatedImages.map((image, index) => [
            { text: `Image ${index + 1}`, callback_data: `remove_${index}` }
        ]);

        const keyboardMsg = await bot.sendMessage(msg.chat.id, 'Choose an image to remove:', {
            reply_markup: {
                inline_keyboard: options
            }
        });

        bot.once('callback_query', async (callbackQuery) => {
            const action = callbackQuery.data;
            if (action.startsWith('remove_')) {
                const index = parseInt(action.split('_')[1], 10);
                const imageToRemove = updatedImages[index];
                const imagePath = path.join(imagesDir, imageToRemove);

                fs.unlinkSync(imagePath);

                bot.sendMessage(callbackQuery.message.chat.id, 'Image removed from the library.');
            }
        });
    } catch (error) {
        console.error('Error removing image:', error);
        bot.sendMessage(msg.chat.id, 'An error occurred while removing the image. Please try again.');
    }
});

bot.onText(/\/addimage/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Please upload the image to add to the library.');
    bot.once('photo', async (msg) => {
        try {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const filePath = await bot.getFileLink(fileId);
            const image = await Jimp.read(filePath);
            const localPath = path.join(imagesDir, `${fileId}.jpg`);
            await image.writeAsync(localPath);
            bot.sendMessage(msg.chat.id, 'Image added to the library.');
        } catch (error) {
            console.error('Error adding image:', error);
            bot.sendMessage(msg.chat.id, 'An error occurred while adding the image. Please try again.');
        }
    });
});


const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`Bot is running on port ${PORT}`);
});
