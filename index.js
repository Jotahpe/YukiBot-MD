import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason } from '@whiskeysockets/baileys'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { Boom } from '@hapi/boom'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import NodeCache from 'node-cache'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionsFolder = './Sessions/Owner'
const maxCache = 100

console.log('❀ Iniciando...')
console.log('Yuki Suou')
console.log('Made with love by Destroy')

if (!fs.existsSync(sessionsFolder)) {
    fs.mkdirSync(sessionsFolder, { recursive: true });
}

function getFolderSizeMB(folder) {
    if (!fs.existsSync(folder)) return 0;
    const files = fs.readdirSync(folder);
    let total = 0;
    for (const file of files) {
        const stat = fs.statSync(path.join(folder, file));
        if (stat.isFile()) total += stat.size;
    }
    return total / 1024 / 1024;
}

const sizeMB = getFolderSizeMB(sessionsFolder);
if (sizeMB > maxCache) {
    console.log(chalk.yellow(`[ Δ ] Sessions ${sizeMB}MB > ${maxCache}MB - Limpiando...`))
    fs.rmSync(sessionsFolder, { recursive: true, force: true });
    fs.mkdirSync(sessionsFolder, { recursive: true });
}

let opcion = "2";
let phoneNumber = "528133791894";
let phoneInput = phoneNumber;
let reconexion = 0;
const intentos = 15;

const msgRetryCounterCache = new NodeCache()

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionsFolder);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: "silent" });

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'),
        auth: state,
        msgRetryCounterCache,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        getMessage: async () => "",
        keepAliveIntervalMs: 45000,
    });

    global.client = sock;
    global.conn = sock;

    const pluginFolder = path.join(__dirname, './cmds');
    if (fs.existsSync(pluginFolder)) {
        const pluginFilter = filename => /\.js$/.test(filename);
        global.plugins = {};

        for (let filename of fs.readdirSync(pluginFolder).filter(pluginFilter)) {
            try {
                let file = path.join(pluginFolder, filename);
                const module = await import(pathToFileURL(file).href);
                global.plugins[filename] = module.default || module;
            } catch (e) {
                console.error(`Error al cargar plugin ${filename}:`, e);
            }
        }
    }

    if (opcion === "2" &&!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneInput);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(chalk.bgGreen.black(' Código de emparejamiento: '), chalk.white(code));
            } catch (e) {
                console.log('Error generando código:', e);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log(chalk.green('Bot conectado correctamente'));
            reconexion = 0;
        }
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log(chalk.red('Sesión incorrecta, borra Sessions y reescanea'));
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log(chalk.yellow('Conexión cerrada, reconectando...'));
                startBot();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log(chalk.yellow('Conexión perdida, reconectando...'));
                startBot();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('Sesión cerrada, borra Sessions y reescanea'));
                fs.rmSync(sessionsFolder, { recursive: true, force: true });
            } else if (reason === DisconnectReason.restartRequired) {
                console.log(chalk.cyan('Reinicio requerido, reiniciando...'));
                startBot();
            } else {
                console.log(chalk.red(`Desconectado por razón desconocida: ${reason}`));
                if (reconexion < intentos) {
                    reconexion++;
                    startBot();
                }
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    try {
        const handler = await import('./core/handler.js');
        sock.ev.on('messages.upsert', handler.default.bind(sock));
    } catch (e) {
        console.log('No se encontró handler.js, usando básico');
    }
}

startBot();
