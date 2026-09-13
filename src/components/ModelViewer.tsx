import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { DownloadOutlined } from '@ant-design/icons'

type ModelViewerProps = {
  data: Uint8Array | null
}

function ModelViewer({ data }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportGlb = () => {
    if (!data) return

    setExporting(true)
    setExportError(null)
    try {
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      const geometry = new PLYLoader().parse(buffer)
      geometry.computeVertexNormals()
      geometry.center()
      const material = geometry.index
        ? new THREE.MeshStandardMaterial({ color: '#d9dee4', roughness: 0.68, metalness: 0.04 })
        : new THREE.PointsMaterial({ color: '#d9dee4', size: 0.008 })
      const model = geometry.index
        ? new THREE.Mesh(geometry, material)
        : new THREE.Points(geometry, material)
      const exporter = new GLTFExporter()

      exporter.parse(model, (result) => {
        if (!(result instanceof ArrayBuffer)) {
          geometry.dispose()
          material.dispose()
          setExportError('O exportador não retornou um GLB binário.')
          setExporting(false)
          return
        }
        const url = URL.createObjectURL(new Blob([result], { type: 'model/gltf-binary' }))
        const link = document.createElement('a')
        link.href = url
        link.download = 'reconstruction.glb'
        link.click()
        URL.revokeObjectURL(url)
        geometry.dispose()
        material.dispose()
        setExporting(false)
      }, (error) => {
        geometry.dispose()
        material.dispose()
        setExportError(error instanceof Error ? error.message : 'Falha ao exportar GLB.')
        setExporting(false)
      }, { binary: true })
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Falha ao exportar GLB.')
      setExporting(false)
    }
  }

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#17191c')

    const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.01, 1000)
    camera.position.set(2.4, 1.8, 2.4)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    scene.add(new THREE.HemisphereLight('#ffffff', '#38414e', 2.4))
    const keyLight = new THREE.DirectionalLight('#ffffff', 3)
    keyLight.position.set(3, 4, 4)
    scene.add(keyLight)

    const grid = new THREE.GridHelper(4, 24, '#3a4148', '#252a30')
    scene.add(grid)

    let model: THREE.Object3D | null = null
    if (data) {
      const loader = new PLYLoader()
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      const geometry = loader.parse(buffer)
      geometry.computeVertexNormals()
      geometry.center()
      geometry.computeBoundingSphere()

      const radius = geometry.boundingSphere?.radius || 1
      const material = geometry.index
        ? new THREE.MeshStandardMaterial({ color: '#d9dee4', roughness: 0.68, metalness: 0.04 })
        : new THREE.PointsMaterial({ color: '#d9dee4', size: Math.max(radius / 160, 0.002) })
      model = geometry.index
        ? new THREE.Mesh(geometry, material)
        : new THREE.Points(geometry, material)
      scene.add(model)

      camera.position.set(radius * 2.4, radius * 1.6, radius * 2.4)
      controls.target.set(0, 0, 0)
      controls.update()
    }

    const resizeObserver = new ResizeObserver(() => {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    })
    resizeObserver.observe(container)

    let animationFrame = 0
    const animate = () => {
      animationFrame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      if (model) {
        model.traverse((object) => {
          const mesh = object as THREE.Mesh
          mesh.geometry?.dispose()
          const material = mesh.material as THREE.Material | THREE.Material[] | undefined
          if (Array.isArray(material)) material.forEach((item) => item.dispose())
          else material?.dispose()
        })
      }
      renderer.domElement.remove()
      controlsRef.current = null
      cameraRef.current = null
    }
  }, [data])

  const resetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(2.4, 1.8, 2.4)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
  }

  return (
    <div className="viewer-wrapper">
      <div className="model-viewer" ref={containerRef} />
      <div className="viewer-actions">
        <button type="button" className="viewer-action" onClick={resetCamera}>
          Resetar câmera
        </button>
        <button type="button" className="viewer-action" onClick={exportGlb} disabled={exporting}>
          <DownloadOutlined /> {exporting ? 'Exportando...' : 'Exportar GLB'}
        </button>
      </div>
      {exportError && <span className="viewer-error">{exportError}</span>}
    </div>
  )
}

export default ModelViewer
