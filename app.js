const VkBot = require('node-vk-bot-api');
const api = require('node-vk-bot-api/lib/api');
const ApiError = require('node-vk-bot-api/lib/errors/ApiError');
const config = require('./config.json');
function formatDate(date, includeMS = false) {
    const adjustZeros = (x, required = 2) => {
        x = String(x);
        while (x.length < required) x = '0' + x;
        return x;
    }
    if (!(date instanceof Date)) date = new Date(+date * 1000);

    let Y = date.getFullYear();
    let M = adjustZeros(date.getMonth() + 1);
    let D = adjustZeros(date.getDate());

    let h = adjustZeros(date.getHours());
    let m = adjustZeros(date.getMinutes());
    let s = adjustZeros(date.getUTCSeconds());
    let ms = adjustZeros(date.getUTCMilliseconds());

    return `${D}.${M}.${Y} ${h}:${m}:${s}` + (includeMS ? ':' + ms : '');
}
function log(...args) {
    console.log(`[${formatDate(new Date, true)}]`, ...args);
}
log('Starting...');

/**
 * 
 * @param {VkBot} bot 
 */
function botSetup(bot, configIndex) {
    let group = config.groups[configIndex];
    if (configIndex) {
        bot.command('+', async (ctx, next) => {
            if (ctx.message.text != '+') next();
            ctx.reply('Секунду...');
            for (let i = 1; i < config.groups.length; i++) {
                let g = config.groups[i];
                let admins = await getAdminList(g);
                if (admins.some(i => i == ctx.message.from_id)) {
                    if (g == group) return ctx.reply(`Ты уже редактор в этом паблике`);
                    else return ctx.reply(`Ты уже редактор в паблике ${g.link}\nДавай экономить места, их всего 100 в каждом паблике`);
                }
            }
            try {
                let editManager = await api('groups.editManager', {
                    access_token: config.adminToken,
                    group_id: group.id,
                    user_id: ctx.message.from_id,
                    role: 'editor',
                    is_contact: 0
                });
                log(`User ${ctx.message.from_id} modded`);
                ctx.reply('Ты назначен редактором. Теперь ты можешь писать от имени сообщества');
            }
            catch (e) {
                if (e.response && e.response.error_code) switch (e.response.error_code) {
                    case 700: {
                        ctx.reply('Ты и так создатель лол');
                        break;
                    }
                    case 701: {
                        ctx.reply('ВК не даст мне назначить тебя редактором, пока ты не состоишь в группе. Вступи и напиши + ещё раз');
                        break;
                    }
                    case 702: {
                        ctx.reply(`Тут нет мест, попробуй что-нибудь из списка:\n${config.groups.slice(1).map(x => x.link).join('\n')}`);
                        break;
                    }
                    default: {
                        ctx.reply('Что-то пошло не так, ошибка ' + e.response.error_code);
                        console.warn(e.response);
                        break;
                    }
                }
                else throw e;
            }
            
        });

        bot.command('-', async (ctx, next) => {
            if (ctx.message.text != '-') next();
            ctx.reply('Секунду...');
            let admins = await getAdminList(group);
            if (admins.indexOf(ctx.message.from_id) != -1) {
                let code = await unmod(group, ctx.message.from_id, 'user\'s discretion');
                switch (code) {
                    case 1: {
                        ctx.reply('Готово, ты больше не редактор');
                        break;
                    }
                    case 700: {
                        ctx.reply('Ты создатель лол');
                        break;
                    }
                    case 701: {
                        ctx.reply('ВК не даст мне назначить тебя редактором, пока ты не состоишь в группе. Вступи и напиши + ещё раз');
                        break;
                    }
                    default: {
                        ctx.reply('Что-то пошло не так, ошибка ' + e.response.error_code);
                        console.warn(e.response);
                        break;
                    }
                }
            }
            else ctx.reply('Ты и так не редактор :/');
        });

        bot.event('group_leave', async ctx => {
            log(`User ${ctx.message.user_id} left group #${configIndex}`);
            let admins = await getAdminList(group);
            if (admins.indexOf(ctx.message.user_id) != -1) {
                let unmodCode = await unmod(group, ctx.message.user_id, 'user left the group');
                if (unmodCode == 1) ctx.reply('Ты покинул паблик, поэтому я тебя снял с поста редактора. Хочешь вернуться? Подпишись и введи "+"');
            }
        });

        bot.event();
    }
    else {
        bot.command('/admins', async ctx => {
            let idx = +ctx.message.text.replace('/admins', '').trim();
            if (config.groups[idx]) {
                let admins = await getAdminList(config.groups[idx]);
                ctx.reply(`Found ${admins.length} admins:\n\n` + admins.map(x => `https://vk.com/id${x}`).join('\n'));
            }
            else ctx.reply('No group with index ' + idx);
            ctx.reply('amogus');
        });
        bot.command('/ban', async ctx => {
            let id = +ctx.message.text.replace('/ban', '').trim();
            if (isNaN(id)) ctx.reply('nan');
            await ban(id, 'by admin');
        });
    }
    bot.startPolling().then(() => log("Bot started for group #" + configIndex));
}

config.groups.forEach((g, i) => {
    g.bot = new VkBot(g.token);
    botSetup(g.bot, i);
});

async function getAdminList(g) {
    try {
        let r = await api('groups.getMembers', {
            access_token: g.token,
            group_id: g.id,
            filter: 'managers'
        });
        return r.response.items.map(x => x.id);
    }
    catch (e) {
        console.error(e);
        throw e;
    }
}

async function unmod(group, user, reason) {
    try {
        await api('groups.editManager', {
            access_token: config.adminToken,
            group_id: group.id,
            user_id: user,
            is_contact: 0
        });
        log(`User ${user} unmodded: ${reason}`);
        return 1;
    }
    catch (e) {
        if (e instanceof ApiError) return e.response.error_code;
        else throw e;
    }
}

async function ban(user, reason) {
    for (let i = 0; i < config.groups.length; i++) {
        let g = config.groups[i];
        try {
            await api('groups.ban', {
                access_token: config.adminToken,
                group_id: g.id,
                owner_id: user,
                comment: 'Заблокирован ботом',
                comment_visible: 0
            });
        }
        catch (e) {
            if (e.response) switch (e.response.error_code) {
                default: {
                    //todo a notify
                    log('ban err', e.response.error_code);
                    break;
                }
            }
            else throw e;
        }
    }
    //todo notify admin
    log(`User ${user} banned: ${reason}`);
}

async function unban(user) {
    for (let i = 0; i < config.groups.length; i++) {
        let g = config.groups[i];
        try {
            await api('groups.unban', {
                access_token: config.adminToken,
                group_id: g.id,
                owner_id: user
            });
        }
        catch (e) {
            if (e.response) switch (e.response.error_code) {
                default: {
                    //todo a notify
                    log('ban err', e.response.error_code);
                    break;
                }
            }
            else throw e;
        }
    }
    //todo notify admin
    log(`User ${user} unbanned`);
}