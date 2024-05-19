const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const unirest = require('unirest');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Insert the Telegram token into the .env
const token = process.env.TG_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Insert the chat ID into the .env
const chatId = process.env.CHAT_ID;

const downloadImage = async (url, filename) => {
    const response = await axios({
        url,
        responseType: 'stream',
    });

    const writer = fs.createWriteStream(filename);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filename));
        writer.on('error', reject);
    });
};

const checkAndRemoveImages = (imageDir, maxDirSizeMB, imagesData) => {
    const dirSize = getDirectorySize(imageDir);
    const maxSizeBytes = maxDirSizeMB * 1024 * 1024;

    if (dirSize > maxSizeBytes && imagesData.length > 0) {
        const files = fs.readdirSync(imageDir);
        const imagesToRemove = files.slice(0, imagesData.length);

        imagesToRemove.forEach(file => {
            const filePath = path.join(imageDir, file);
            fs.unlinkSync(filePath);
        });

        console.log(`Removed ${imagesToRemove.length} images to reduce directory size.`);
    }
};

const getDirectorySize = (dir) => {
    let totalSize = 0;

    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
    });

    return totalSize;
};

const selectRandom = () => {
    const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
    ];
    const randomNumber = Math.floor(Math.random() * userAgents.length);
    return userAgents[randomNumber];
};

let query = "ржачный мем";
const query_lang = "ru";

const getImagesData = async () => {
    const user_agent = selectRandom();
    const header = { "User-Agent": `${user_agent}` };
    
    const formatQuery = query => query.trim().toLowerCase().replace(/\s+/g, '+');
    const formatedQuery = formatQuery(query);

    const response = await unirest
        .get(
            `https://www.google.com/search?q=${encodeURIComponent(formatedQuery)}&hl=${query_lang}&tbs=qdr:w&tbm=isch&asearch=ichunk&async=_id:rg_s,_pms:s,_fmt:pc&sourceid=chrome&ie=UTF-8`
        )
        .headers(header)
        .encoding('utf-8');

    let $ = cheerio.load(response.body);

    let images_results = [];
    $("div.rg_bx").each((i, el) => {
        let json_string = $(el).find(".rg_meta").text();
        images_results.push({
            title: $(el).find(".iKjWAf .mVDMnf").text(),
            source: $(el).find(".iKjWAf .FnqxG").text(),
            link: JSON.parse(json_string).ru,
            original: JSON.parse(json_string).ou,
            thumbnail: $(el).find(".rg_l img").attr("src") ? $(el).find(".rg_l img").attr("src") : $(el).find(".rg_l img").attr("data-src"),
        });
    });

    return images_results;
};

const saveAndSendRandomImage = async (chatId) => {
    try {
        const imagesData = await getImagesData();
        const randomImage = imagesData[Math.floor(Math.random() * imagesData.length)];

        const imageUrl = randomImage.original;
        const imageDir = path.join(__dirname, 'images');
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir);
        }

        const filename = path.join(imageDir, `${Date.now()}.jpg`);
        await downloadImage(imageUrl, filename);

        console.log('Image saved:', filename);

        checkAndRemoveImages(imageDir, 100, imagesData);

        const fileCount = fs.readdirSync(imageDir).length;

        const message = `

*😄 Рандомный мем из интернета № ${fileCount} 😁*
*Источник:* [Ссылка](${randomImage.link})
*Дисклеймер:*
_Данный бот отправляет случайные мемы из интернета, взятые из открытых источников._
_Обратите внимание, что автор бота не несёт ответственности за содержание изображений,_
_так как они выбираются случайным образом._
_Если вы встретите что-то неподобающее, пожалуйста, имейте это в виду._

        `;

         const options = {
            caption: message,
            parse_mode: 'Markdown',
            disable_notification: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '😂 Ещё мем 🤣', callback_data: 'get_meme' }],
                    [{ text: '😱 Удалить, это не мем! 😰', callback_data: 'delete' }]
                ]
            }
        };

        const sentMessage = await bot.sendPhoto(chatId, filename, options);

    } catch (error) {
        console.error('Error saving and sending image:', error);
    }
};

// The task runs every N minutes
const N = '60';
cron.schedule(`*/${N} * * * *`, () => saveAndSendRandomImage(chatId));

saveAndSendRandomImage(chatId);

bot.on('message', msg => {
    const { id } = msg.chat;
    console.log('Chat ID:', id);
});

bot.onText(/\/start/, msg => {
    const { id } = msg.chat;

    const message = `

<b>Доступные команды:</b>
- /start
- /about
- /meme

        `;

    bot.sendMessage(id, message, { parse_mode: 'HTML' });
});

bot.onText(/\/about/, msg => {
    const { id } = msg.chat;

    const message = `

<b>О данном боте:</b>
- <b>Разработчик бота:</b> @art0tod
- <b>Цель бота:</b> автоматизировать получениe позитивных эмоций.
- <b>Как работает:</b> бот отправляет в заданную группу с определённым интервалом сообщение с картинкой и подписью с источниками и прочей полезной информацией.
- <b>Как пользоваться:</b> добавить бота в нужную группу (обращаться к разработчику) или просто прописать /meme, чтобы отправить мем в текущий чат.
        `;

    bot.sendMessage(id, message, { parse_mode: 'HTML' });
});

bot.onText(/\/meme/, async (msg) => {
    const { id } = msg.chat;
    await saveAndSendRandomImage(id);
});

bot.on('callback_query', async (callbackQuery) => {
    const { message_id, chat: { id } } = callbackQuery.message;
    const data = callbackQuery.data;

    try {
        if (data === 'get_meme') {
            await saveAndSendRandomImage(id);
        } else if (data === 'delete') {
            await bot.deleteMessage(id, message_id);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
        console.error('Error handling callback query:', error);
    }
});

