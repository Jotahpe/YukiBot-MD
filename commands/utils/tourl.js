import fetch from 'node-fetch'
import FormData from 'form-data'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`
}

function getExtensionFromMime(mime) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
  }
  return map[mime] || 'bin'
}

export default {
  command: ['tourl'],
  category: 'utils',
  run: async (client, m, args, usedPrefix, command) => {
    try {
      const q = m.quoted || m
      const mime = q.mimetype || q.msg?.mimetype || ''

      if (!mime) {
        return m.reply(
          `《✧》 Por favor, responde a una imagen o video con el comando *${usedPrefix + command}* para convertirlo en una URL.`
        )
      }

      if (!/image\/(png|jpe?g|gif)|video\/mp4/.test(mime)) {
        return m.reply(`✎ El formato *${mime}* no es compatible`)
      }

      const buffer = await q.download()
      const ext = getExtensionFromMime(mime)
      const fileName = q.fileName || `file.${ext}`

      const [uguuResult, adoResult] = await Promise.allSettled([
        uploadToUguu(buffer, mime),
        uploadToAdoFiles(buffer, mime, fileName),
      ])

      const uguuUrl =
        uguuResult.status === 'fulfilled' ? uguuResult.value : null

      const adoUrl =
        adoResult.status === 'fulfilled' ? adoResult.value : null

      if (!uguuUrl && !adoUrl) {
        return m.reply('✎ No se pudo *subir* el archivo a ningún servidor.')
      }

      const userName = global.db.data.users[m.sender]?.name || 'Usuario'
      const peso = formatBytes(buffer.length)

      const msg = `✎ *Upload To URL*

> ✿ *Uguu ›* ${uguuUrl || 'Error al subir'}
> ✿ *AdoFiles ›* ${adoUrl || 'Error al subir'}
> ✿ *Peso ›* ${peso}
> ✿ *Solicitado por ›* ${userName}

${typeof dev !== 'undefined' ? dev : ''}`

      return m.reply(msg)
    } catch (err) {
      return m.reply(`《✧》 Fail: ${err.message}`)
    }
  },
}

async function uploadToUguu(buffer, mime) {
  const body = new FormData()
  body.append('files[]', buffer, `file.${mime.split('/')[1]}`)

  const res = await fetch('https://uguu.se/upload.php', {
    method: 'POST',
    body,
    headers: body.getHeaders(),
  })

  if (!res.ok) {
    throw new Error(`Uguu respondió con ${res.status}`)
  }

  const json = await res.json()
  return json.files?.[0]?.url || null
}

async function uploadToAdoFiles(buffer, mime, filename) {
  const payload = {
    filename,
    data: buffer.toString('base64'),
    mimetype: mime,
    expiration: 'never',
  }

  const res = await fetch('https://adofiles.i11.eu/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`AdoFiles respondió con ${res.status}`)
  }

  const json = await res.json()
  return json.url || null
}
