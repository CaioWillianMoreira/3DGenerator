const { spawn } = require('node:child_process')
const { spawnSync } = require('node:child_process')

function detectCuda() {
  const result = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0 || !result.stdout.trim()) {
    return { available: false, name: null, memoryMb: null, driver: null }
  }

  const [name, memoryMb, driver] = result.stdout.trim().split(',').map((value) => value.trim())
  return { available: true, name, memoryMb: Number(memoryMb) || null, driver }
}

function runColmapCheck(command = process.env.COLMAP_PATH || 'colmap') {
  return new Promise((resolve) => {
    const child = spawn(command, ['-h'], { windowsHide: true })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: error.code === 'ENOENT'
          ? `COLMAP não foi encontrado: ${command}`
          : error.message,
      })
    })

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        error: code === 0 ? null : `COLMAP encerrou com código ${code}`,
      })
    })
  })
}

module.exports = { runColmapCheck, detectCuda }
