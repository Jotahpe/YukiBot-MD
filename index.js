import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason } from '@whiskeysockets/baileys'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { Boom } from '@hapi/boom'
import { fileURLToPath, pathToFileURL } from 'url'
import NodeCache from 'node-cache'
import http from 'http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionsFolder = './Sessions/Owner'

// BORRA SESSIONS SI ESTÁ CORRUPTA
if (fs.existsSync(sessionsFolder)) {
    console.log('Limpiando sesión vieja...');
    fs.rmSync(sessionsFolder, { recursive: true, force: true });
}
fs.mkdirSync(sessionsFolder, { recursive: true });

console.log('❀ Iniciando...')
console.log('Yuki Suou')
console.log('Made with love by Destroy')

let opcion = "2";
let phoneNumber = "528133791894";
let reconexion = 0;
const intentos = 5; // Solo 5 intentos para no spamear códigos
let codigoGenerado = false; // FLAG: Solo 1 código

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

    // GENERA CÓDIGO SOLO 1 VEZ
    if (opcion === "2" && !sock.authState.creds.registered && !codigoGenerado) {
        codigoGenerado = true; // Ya no genera más
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(chalk.bgGreen.black(' >>> CÓDIGO DE EMPAREJAMIENTO: '), chalk.white.bold(code));
                console.log(chalk.yellow('>>> Tienes 2 minutos para meterlo en WhatsApp'));
            } catch (e) {
                console.log('Error generando código:', e);
                codigoGenerado = false; // Si falla, permite reintentar
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(chalk.green('>>> Bot conectado correctamente. Ya puedes cerrar Render si quieres'));
            reconexion = 0;
        }

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            
            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('>>> Sesión cerrada. Borra carpeta Sessions y reinicia'));
                fs.rmSync(sessionsFolder, { recursive: true, force: true });
                return; // NO RECONECTA para no spamear códigos
            } 
            
            if (reconexion < intentos) {
                reconexion++;
                console.log(chalk.yellow(`>>> Reconectando... Intento ${reconexion}/${intentos}`));
                setTimeout(startBot, 5000);
            } else {
                console.log(chalk.red('>>> Demasiados intentos. Reinicia el deploy manual'));
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startBot();

// PUERTO FALSO PARA QUE RENDER NO MATE EL PROCESO
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('YukiBot Online - No cerrar');
});
server.listen(process.env.PORT || 3000, () => {
    console.log('>>> Puerto abierto para Render');
}); 
