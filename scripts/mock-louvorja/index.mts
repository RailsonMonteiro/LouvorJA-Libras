// Run with: npm run mock:louvorja [-- --port 7070] [--interval 4] [--token ABC12] [--dialect v1]
// Starts a fake LouvorJA "Transmitir" server that plays a sample song (then a Bible verse) in a
// loop, for trying the app without the real program.
import { startMockServer } from './server.mts'

const args = process.argv.slice(2)
const option = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}

const port = Number(option('port') ?? 7070)
const intervalMs = Number(option('interval') ?? 4) * 1000
const token = option('token')
const dialect = option('dialect') === 'v1' ? 'v1' : 'v2'

// LouvorJA sends the text in upper case, one line break per line of the slide.
const song = [
  'HINO DE EXEMPLO\nHINÁRIO DE TESTE',
  'PRIMEIRA ESTROFE\nDO HINO DE EXEMPLO',
  'SEGUNDA ESTROFE\nDO HINO DE EXEMPLO',
  'CORO\nDEUS É AMOR'
]
const verse = { text: 'O Senhor é o meu pastor; nada me faltará.', reference: 'Salmos 23:1 (ARA)' }

const server = await startMockServer({ host: '0.0.0.0', port, token, dialect })
console.log(
  `Mock LouvorJA (${dialect}) at http://0.0.0.0:${server.port}${token ? ` (token: ${token})` : ' (no token)'}`
)

let step = 0
const advance = (): void => {
  const position = step % (song.length + 2)
  if (position === 0) {
    server.clearVerse()
    server.playSong(song)
    console.log('song started')
  } else if (position < song.length) {
    server.nextSlide()
    console.log(`slide ${position + 1}/${song.length}`)
  } else if (position === song.length) {
    server.stopSong()
    server.showVerse(verse)
    console.log('Bible verse')
  } else {
    server.clearVerse()
    console.log('nothing on screen')
  }
  step += 1
}
advance()
const timer = setInterval(advance, intervalMs)

process.on('SIGINT', async () => {
  clearInterval(timer)
  await server.close()
  process.exit(0)
})
