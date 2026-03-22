const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'release', 'win-unpacked')
const dest = path.join(__dirname, '..', 'release', 'Docuflow')

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true })
  console.log('Removed existing:', dest)
}

if (fs.existsSync(src)) {
  fs.renameSync(src, dest)
  console.log('Renamed:', src, '->', dest)
} else {
  console.log('Source not found:', src)
}
