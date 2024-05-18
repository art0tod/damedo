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

let query = "смешной мем";
const query_lang = "ru"

const getImagesData = async () => {
    const user_agent = selectRandom();
    const header = { "User-Agent": `${user_agent}` };
    
    const formatQuery = query => query.trim().toLowerCase().replace(/\s+/g, '+');
    const formatedQuery = formatQuery(query);

    const response = await unirest
        .get(
            `https://www.google.com/search?q=${encodeURIComponent(formatedQuery)}&hl=${query_lang}&tbm=isch&asearch=ichunk&async=_id:rg_s,_pms:s,_fmt:pc&sourceid=chrome&ie=UTF-8`
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

const saveAndSendRandomImage = async () => {
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

        const message = `

<b>Название:</b> ${randomImage.title}
<b>Источник:</b> ${randomImage.link}
<b>Запрос:</b> ${query}
<i>За любыми вопросами и пожеланиями обращайтесь к @art0tod</i>

        `;
        await bot.sendPhoto(chatId, filename, { caption: message, parse_mode: 'HTML', disable_notification: true });

    } catch (error) {
        console.error('Error saving and sending image:', error);
    }
};

// The task runs every N minutes
const N = '30';
cron.schedule(`*/${N} * * * *`, saveAndSendRandomImage);

saveAndSendRandomImage();

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
- <b>Как пользоваться:</b> добавить бота в нужную группу (обращаться к разработчику)
        `;

    bot.sendMessage(id, message, { parse_mode: 'HTML' });
});
