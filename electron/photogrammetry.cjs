const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { detectCuda } = require('./colmap.cjs')

const pipelineSteps = [
  ['feature_extractor', 'Extraindo características'],
  ['exhaustive_matcher', 'Encontrando correspondências'],
  ['mapper', 'Reconstruindo câmeras'],
  ['image_undistorter', 'Preparando reconstrução densa'],
  ['patch_match_stereo', 'Calculando profundidade'],
  ['stereo_fusion', 'Gerando point cloud'],
  ['poisson_mesher', 'Gerando mesh'],
]

function runCommand(command, args, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let output = ''

    const read = (chunk) => {
      const text = chunk.toString()
      output += text
      text.split(/\r?\n/).filter(Boolean).forEach(onLog)
    }

    child.stdout.on('data', read)
    child.stderr.on('data', read)
    let processError = null
    child.on('error', (error) => {
      processError = error
      reject(error)
    })
    child.on('close', (code, signal) => {
      if (processError) return
      if (code === 0) {
        resolve(output)
      } else {
        const reason = signal ? `sinal ${signal}` : `código ${code}`
        reject(new Error(`COLMAP ${args[0]} encerrou com ${reason}\n${output}`))
      }
    })
  })
}

async function runPhotogrammetry(files, onProgress = () => {}) {
  if (!files.length) throw new Error('Nenhuma imagem foi selecionada.')

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), '3d-generator-'))
  const imagePath = path.join(workspace, 'images')
  const databasePath = path.join(workspace, 'database.db')
  const sparsePath = path.join(workspace, 'sparse')
  const densePath = path.join(workspace, 'dense')
  const command = process.env.COLMAP_PATH || 'colmap'
  const cuda = detectCuda()
  const gpuIndex = process.env.COLMAP_GPU_INDEX || '0'
  const maxImageSize = process.env.COLMAP_MAX_IMAGE_SIZE || '2000'

  onProgress({
    type: 'hardware',
    message: cuda.available
      ? `CUDA ativo: ${cuda.name} (${cuda.memoryMb ?? '?'} MB VRAM)`
      : 'CUDA indisponível; o COLMAP será executado em CPU.',
  })

  await fs.mkdir(imagePath)
  await Promise.all(files.map(async (file) => {
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')
    await fs.writeFile(path.join(imagePath, safeName), Buffer.from(file.data))
  }))

  const commonLog = (line) => onProgress({ type: 'log', message: line })
  const runStep = async (index, args) => {
    const [name, label] = pipelineSteps[index]
    onProgress({ type: 'step', index, name, label })
    await runCommand(command, args, commonLog)
    onProgress({ type: 'step-complete', index, name, label })
  }

  await runStep(0, [
    'feature_extractor',
    '--database_path', databasePath,
    '--image_path', imagePath,
    '--ImageReader.single_camera', '1',
    '--SiftExtraction.use_gpu', cuda.available ? '1' : '0',
    '--SiftExtraction.gpu_index', gpuIndex,
  ])
  await runStep(1, [
    'exhaustive_matcher',
    '--database_path', databasePath,
    '--SiftMatching.use_gpu', cuda.available ? '1' : '0',
    '--SiftMatching.gpu_index', gpuIndex,
  ])

  await fs.mkdir(sparsePath)
  await runStep(2, [
    'mapper',
    '--database_path', databasePath,
    '--image_path', imagePath,
    '--output_path', sparsePath,
  ])

  if (process.platform === 'darwin') {
    throw new Error(
      'Reconstrução densa do COLMAP exige CUDA e não é compatível com este macOS. ' +
      'A rota OpenMVS/Metal ainda está sendo preparada; o COLMAP concluiu apenas a reconstrução esparsa.',
    )
  }

  await fs.mkdir(densePath)
  await runStep(3, [
    'image_undistorter',
    '--image_path', imagePath,
    '--input_path', path.join(sparsePath, '0'),
    '--output_path', densePath,
    '--output_type', 'COLMAP',
  ])
  await runStep(4, [
    'patch_match_stereo',
    '--workspace_path', densePath,
    '--workspace_format', 'COLMAP',
    '--PatchMatchStereo.geom_consistency', 'true',
    '--PatchMatchStereo.gpu_index', gpuIndex,
    '--PatchMatchStereo.max_image_size', maxImageSize,
  ])

  const fusedPath = path.join(densePath, 'fused.ply')
  await runStep(5, [
    'stereo_fusion',
    '--workspace_path', densePath,
    '--workspace_format', 'COLMAP',
    '--output_path', fusedPath,
  ])

  const meshPath = path.join(densePath, 'meshed-poisson.ply')
  await runStep(6, [
    'poisson_mesher',
    '--input_path', fusedPath,
    '--output_path', meshPath,
  ])

  onProgress({ type: 'complete', workspace, pointCloudPath: fusedPath, meshPath })
  return { workspace, pointCloudPath: fusedPath, meshPath }
}

module.exports = { runPhotogrammetry, pipelineSteps }
