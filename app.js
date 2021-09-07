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
    let ms = adjustZeros(date.getUTCMilliseconds(), 3);

    return `${D}.${M}.${Y} ${h}:${m}:${s}` + (includeMS ? ':' + ms : '');
}
function log(...args) {
    console.log(`[${formatDate(new Date, true)}]`, ...args);
}
log('Запускаем...');

/**
 * 
 * @param {VkBot} bot 
 */
function botSetup(bot, configIndex) {
    let group = config.groups[configIndex];
    if (configIndex) {
        bot.command('+', async (ctx, next) => {
            if (ctx.message.text != '+') next();
            ctx.reply('[Бот] Секунду...');
            for (let i = 1; i < config.groups.length; i++) {
                let g = config.groups[i];
                let admins = await getAdminList(g);
                if (admins.some(i => i == ctx.message.from_id)) {
                    if (g == group) return ctx.reply(`[Бот] Ты уже редактор в этом паблике`);
                    else return ctx.reply(`[Бот] Ты уже редактор в паблике ${g.link}\nДавай экономить места, их всего 100 в каждом паблике`);
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
                log(`Выдан ред юзеру ${ctx.message.from_id} в паблике #${configIndex}`);
                ctx.reply('[Бот] Ты назначен редактором. Теперь ты можешь писать от имени сообщества');
            }
            catch (e) {
                if (e.response && e.response.error_code) switch (e.response.error_code) {
                    case 700: {
                        ctx.reply('[Бот] Ты и так создатель лол');
                        break;
                    }
                    case 701: {
                        ctx.reply('[Бот] ВК не даст мне назначить тебя редактором, пока ты не состоишь в группе. Вступи и напиши + ещё раз');
                        break;
                    }
                    case 702: {
                        ctx.reply(`[Бот] Тут нет мест, попробуй что-нибудь из списка:\n${config.groups.slice(1).map(x => x.link).join('\n')}`);
                        break;
                    }
                    default: {
                        ctx.reply('[Бот] Что-то пошло не так, ошибка ' + e.response.error_code);
                        console.warn(e.response);
                        break;
                    }
                }
                else throw e;
            }
            
        });

        bot.command('-', async (ctx, next) => {
            if (ctx.message.text != '-') next();
            ctx.reply('[Бот] Секунду...');
            let admins = await getAdminList(group);
            if (admins.indexOf(ctx.message.from_id) != -1) {
                let code = await unmod(group, ctx.message.from_id, 'решение пользователя');
                switch (code) {
                    case 1: {
                        ctx.reply('[Бот] Готово, ты больше не редактор');
                        break;
                    }
                    case 700: {
                        ctx.reply('[Бот] Ты создатель лол');
                        break;
                    }
                    case 701: {
                        ctx.reply('[Бот] ВК не даст мне назначить тебя редактором, пока ты не состоишь в группе. Вступи и напиши + ещё раз');
                        break;
                    }
                    default: {
                        ctx.reply('[Бот] Что-то пошло не так, ошибка ' + e.response.error_code);
                        console.warn(e.response);
                        break;
                    }
                }
            }
            else ctx.reply('[Бот] Ты и так не редактор :/');
        });

        bot.event('group_leave', async ctx => {
            //log(`Юзер ${ctx.message.user_id} покинул паблик #${configIndex}`);
            let admins = await getAdminList(group);
            if (admins.indexOf(ctx.message.user_id) != -1) {
                let unmodCode = await unmod(group, ctx.message.user_id, 'юзер покинул паблик');
                if (unmodCode == 1) ctx.reply('[Бот] Ты покинул паблик, поэтому я тебя снял с поста редактора. Хочешь вернуться? Подпишись и введи "+"');
            }
        });

        bot.event('message_reply', ctx => {
            if (ctx.message.from_id < 0) return; //Исходящее сообщение от бота
            if (/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z]{1,4}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?/gi.test(ctx.message.text)) {
                group.bot.sendMessage(ctx.message.from_id, '[Бот] Кажется, ты прислал кому-то сообщение со спамом. Если это не так, тебя скоро разбанят. Поаккуратнее со ссылками');
                api('messages.delete', {
                    access_token: group.token,
                    message_ids: ctx.message.id
                });
                ban(ctx.message.from_id, 'Подозрительное сообщение: \n' + ctx.message.text);
            }
        });
    }
    else {
        bot.command('/admins', async ctx => {
            let idx = +ctx.message.text.replace('/admins', '').trim();
            if (config.groups[idx]) {
                ctx.reply('[Бот] Секунду...');
                let admins = await getAdminList(config.groups[idx]);
                ctx.reply(`[Бот] Список админов (${admins.length}):\n\n` + admins.map(x => `https://vk.com/id${x}`).join('\n'));
            }
            else ctx.reply('[Бот] Нет паблика #' + idx);
        });
        bot.command('/ban', async ctx => {
            let cmd = ctx.message.text.split(' ').slice(1);
            if (cmd.length < 2 || isNaN(cmd[0])) return ctx.reply('[Бот] /ban [ID юзера] [причина]');
            ctx.reply('[Бот] Секунду...');
            await ban(+cmd[0], 'Решение админа: ' + cmd.slice(1).join(' '));
        });
        bot.command('/unban', async ctx => {
            let cmd = ctx.message.text.split(' ').slice(1);
            if (cmd.length < 1 || isNaN(cmd[0])) return ctx.reply('[Бот] /unban [ID юзера]');
            ctx.reply('[Бот] Секунду...');
            await unban(+cmd[0]);
            ctx.reply('[Бот] Разбанен');
        });
    }
    bot.command('/test', ctx => ctx.reply('[Бот] Бот работает'));

    bot.event('user_block', ctx => {
        if (ctx.message.admin_id == config.adminId) return;
        //ban(ctx.message.admin_id, `забанил юзера ${ctx.message.user_id} в паблике ${group.link}`);
        bot.sendMessage(ctx.message.admin_id, '[Бот] Эй, не трогай чёрный список! Админ того пользователя разбанит, сам ты это уже не сделаешь (бот не даст)');
    });

    bot.event('user_unblock', ctx => {
        if (ctx.message.admin_id == config.adminId) return;
        ban(ctx.message.user_id, `несанкционированный разбан от юзера https://vk.com/id${ctx.message.admin_id}`);
        bot.sendMessage(ctx.message.admin_id, '[Бот] Эй, не трогай чёрный список! Тот, кого ты пытался разбанить, забанен обратно');
    });

    bot.event('group_change_photo', ctx => {
        if (ctx.message.user_id == config.adminId) return;
        bot.sendMessage(ctx.message.user_id, '[Бот] Эй, не трогай аватарку! Если ты выполнял миссию по её возврату, претензий нет :)');
        notifyAdmin(`АВАТАРКА! ${group.link}\n${ctx.message.photo.sizes[0].url}`);
    })

    bot.startPolling().then(() => {
        log(`Запущен бот паблика #${configIndex} (${group.link})`);
        group.botStarted = true;
        if (config.groups.every(g => g.botStarted)) log('Все боты запущены');
    });
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
        log(`Снят ред с юзера ${user} ${config.groups.indexOf(group)}: ${reason}`);
        return 1;
    }
    catch (e) {
        if (e instanceof ApiError) return e.response.error_code;
        else throw e;
    }
}

async function ban(user, reason) {
    for (let i = 1; i < config.groups.length; i++) {
        let g = config.groups[i];
        await unmod(g, user, `бан`);
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
                    log('Не могу забанить, ошибка ', e.response.error_code);
                    break;
                }
            }
            else throw e;
        }
    }
    await notifyAdmin(`[Бан] https://vk.com/id${user} ${reason}`);
    log(`Юзер ${user} забанен: ${reason}`);
}

async function unban(user) {
    for (let i = 1; i < config.groups.length; i++) {
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
                    log('Не могу разбанить, ошибка', e.response.error_code);
                    break;
                }
            }
            else throw e;
        }
    }
    //todo notify admin
    log(`Юзер ${user} разбанен`);
}

async function notifyAdmin(msg) {
    /**
     * @type {VkBot}
     */
    let bot = config.groups[0].bot;
    try {
        await bot.sendMessage(config.adminId, msg);
    }
    catch (e) {
        log('Не могу сообщить админу:', e.response ? e.response.error_code : e);
    }
}