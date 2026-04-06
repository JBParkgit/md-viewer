const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'release', 'win-unpacked')
const dest = path.join(__dirname, '..', 'release', 'Docuflow')

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true })
  console.log('Removed existing:', dest)
}

if (fs.existsSync(src)) {
  try {
    fs.renameSync(src, dest)
    console.log('Renamed:', src, '->', dest)
  } catch (e) {
    console.log('Rename failed, falling back to copy:', e.message)
    fs.cpSync(src, dest, { recursive: true })
    console.log('Copied:', src, '->', dest)
  }
} else {
  console.log('Source not found:', src)
}
