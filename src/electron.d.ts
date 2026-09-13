declare global {
  type ColmapCheckResult = {
    ok: boolean
    code: number | null
    stdout: string
    stderr: string
    error: string | null
  }

  type GpuCheckResult = {
    available: boolean
    name: string | null
    memoryMb: number | null
    driver: string | null
  }

  type PhotogrammetryProgress = {
    type: 'step' | 'step-complete' | 'log' | 'hardware' | 'complete'
    index?: number
    name?: string
    label?: string
    message?: string
    workspace?: string
    pointCloudPath?: string
    meshPath?: string
  }

  type PhotogrammetryResult = {
    ok: boolean
    error?: string
    workspace?: string
    pointCloudPath?: string
    meshPath?: string
  }

  interface Window {
    desktop?: {
      isElectron: boolean
      checkColmap: () => Promise<ColmapCheckResult>
      checkGpu: () => Promise<GpuCheckResult>
      runPhotogrammetry: (files: { name: string; data: Uint8Array }[]) => Promise<PhotogrammetryResult>
      onPhotogrammetryProgress: (listener: (progress: PhotogrammetryProgress) => void) => () => void
      readModel: (modelPath: string) => Promise<Uint8Array>
    }
  }
}

export {}
