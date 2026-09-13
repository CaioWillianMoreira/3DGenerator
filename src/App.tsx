import { useEffect, useState } from 'react'
import { Button, Card, Layout, Tag, Typography, Upload } from 'antd'
import type { UploadFile, UploadProps } from 'antd'
import { DeleteOutlined, InboxOutlined, PlayCircleOutlined } from '@ant-design/icons'
import ModelViewer from './components/ModelViewer'
import './App.css'

const acceptedFormats = '.jpg,.jpeg,.png,.webp'
const pipelineSteps = [
  'Extraindo características',
  'Encontrando correspondências',
  'Reconstruindo câmeras',
  'Preparando reconstrução densa',
  'Calculando profundidade',
  'Gerando point cloud',
  'Gerando mesh',
]

function App() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [colmapStatus, setColmapStatus] = useState<string | null>(null)
  const [checkingColmap, setCheckingColmap] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [activeStep, setActiveStep] = useState(-1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [pipelineResult, setPipelineResult] = useState<PhotogrammetryResult | null>(null)
  const [modelData, setModelData] = useState<Uint8Array | null>(null)

  useEffect(() => {
    if (!window.desktop) return
    return window.desktop.onPhotogrammetryProgress((progress) => {
      if (progress.type === 'step' && progress.index !== undefined) {
        setActiveStep(progress.index)
      }
      if (progress.type === 'step-complete' && progress.index !== undefined) {
        setCompletedSteps((current) => [...new Set([...current, progress.index!])])
      }
      if (progress.type === 'log' && progress.message) {
        setLogs((current) => [...current.slice(-99), progress.message!])
      }
    })
  }, [])

  useEffect(() => {
    const nextPreviews: Record<string, string> = {}
    files.forEach((file) => {
      if (file.originFileObj) {
        nextPreviews[file.uid] = URL.createObjectURL(file.originFileObj)
      }
    })

    setPreviews(nextPreviews)

    return () => {
      Object.values(nextPreviews).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [files])

  const uploadProps: UploadProps = {
    accept: acceptedFormats,
    multiple: true,
    showUploadList: false,
    beforeUpload: () => false,
    onChange: ({ fileList }) => setFiles(fileList),
  }

  const removeFile = (uid: string) => {
    setFiles((currentFiles) => currentFiles.filter((file) => file.uid !== uid))
  }

  const checkColmap = async () => {
    if (!window.desktop) {
      setColmapStatus('Disponível somente no aplicativo desktop.')
      return
    }

    setCheckingColmap(true)
    const result = await window.desktop.checkColmap()
    setColmapStatus(result.ok ? 'COLMAP disponível.' : result.error ?? 'Falha ao executar COLMAP.')
    setCheckingColmap(false)
  }

  const runPipeline = async () => {
    if (!window.desktop || files.length === 0) return

    setProcessing(true)
    setActiveStep(-1)
    setCompletedSteps([])
    setLogs([])
    setPipelineError(null)
    setPipelineResult(null)

    try {
      const serializedFiles = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          data: new Uint8Array(await file.originFileObj!.arrayBuffer()),
        })),
      )
      const result = await window.desktop.runPhotogrammetry(serializedFiles)
      setPipelineResult(result)
      if (!result.ok) {
        setPipelineError(result.error ?? 'Falha no pipeline COLMAP.')
      } else if (result.meshPath) {
        setModelData(await window.desktop.readModel(result.meshPath))
      }
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : String(error))
    } finally {
      setProcessing(false)
    }
  }

  if (pipelineResult?.ok && modelData) {
    return (
      <Layout className="app-shell">
        <Layout.Content className="app-content">
          <Card className="upload-card viewer-card" bordered>
            <div className="window-heading">
              <div>
                <Typography.Title level={2}>Modelo 3D</Typography.Title>
                <Typography.Paragraph>Reconstrução gerada pelo COLMAP.</Typography.Paragraph>
              </div>
              <span className="step-indicator">03 / 03</span>
            </div>
            <ModelViewer data={modelData} />
          </Card>
        </Layout.Content>
      </Layout>
    )
  }

  if (processing || pipelineError) {
    return (
      <Layout className="app-shell">
        <Layout.Content className="app-content">
          <Card className="upload-card processing-card" bordered>
            <div className="window-heading">
              <div>
                <Typography.Title level={2}>Gerando modelo 3D</Typography.Title>
                <Typography.Paragraph>
                  O COLMAP está processando as imagens localmente.
                </Typography.Paragraph>
              </div>
              <span className="step-indicator">02 / 03</span>
            </div>

            <div className="pipeline-list">
              {pipelineSteps.map((label, index) => (
                <div className="pipeline-step" key={label}>
                  <span className={`pipeline-marker ${completedSteps.includes(index) ? 'complete' : ''} ${activeStep === index && !completedSteps.includes(index) ? 'active' : ''}`}>
                    {completedSteps.includes(index) ? '✓' : activeStep === index ? '●' : '○'}
                  </span>
                  <Typography.Text>{label}</Typography.Text>
                </div>
              ))}
            </div>

            <div className="log-panel">
              {logs.length > 0 ? logs.map((log, index) => <div key={`${log}-${index}`}>{log}</div>) : 'Aguardando saída do COLMAP...'}
            </div>

            {pipelineError && <Typography.Text type="danger">{pipelineError}</Typography.Text>}
            {pipelineResult?.ok && <Tag color="green">Reconstrução concluída</Tag>}
          </Card>
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout className="app-shell">
      <Layout.Content className="app-content">
        <Card className="upload-card" bordered>
          <div className="window-heading">
            <div>
              <Typography.Title level={2}>3D Photogrammetry</Typography.Title>
              <Typography.Paragraph>
                Por favor, adicione fotos do tênis para iniciar a reconstrução.
              </Typography.Paragraph>
              <Typography.Text className="heading-note">
                Recomendado: 30 imagens de ângulos variados
              </Typography.Text>
            </div>
            <span className="step-indicator">01 / 03</span>
          </div>

          <Upload.Dragger {...uploadProps} className="dropzone">
            <InboxOutlined className="upload-icon" />
            <Typography.Text className="dropzone-title">
              Arraste e solte as imagens do tênis aqui
            </Typography.Text>
            <Typography.Text className="dropzone-caption">
              JPG, JPEG, PNG ou WEBP
            </Typography.Text>
            <Button type="primary">Adicionar imagens</Button>
          </Upload.Dragger>

          <div className="upload-summary">
            <Typography.Text>
              {files.length === 0
                ? 'Nenhuma imagem selecionada'
                : `${files.length} ${files.length === 1 ? 'imagem selecionada' : 'imagens selecionadas'}`}
            </Typography.Text>
            <Typography.Text type="secondary">Máximo recomendado: 50 imagens</Typography.Text>
          </div>

          {files.length > 0 && (
            <div className="thumbnail-grid">
              {files.map((file) => (
                <div className="thumbnail-item" key={file.uid}>
                  {previews[file.uid] ? (
                    <img src={previews[file.uid]} alt={file.name} />
                  ) : (
                    <div className="thumbnail-fallback">IMG</div>
                  )}
                  <button
                    type="button"
                    className="remove-image"
                    aria-label={`Remover ${file.name}`}
                    onClick={() => removeFile(file.uid)}
                  >
                    <DeleteOutlined />
                  </button>
                  <span>{file.name}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card-footer">
            <div className="footer-info">
              <Typography.Text type="secondary">
                Use fotos do mesmo objeto, com boa iluminação e sobreposição entre os ângulos.
              </Typography.Text>
              <div className="colmap-status">
                <Tag color={colmapStatus?.startsWith('COLMAP disponível') ? 'green' : 'default'}>
                  {colmapStatus ?? 'COLMAP não verificado'}
                </Tag>
                <Button type="link" size="small" loading={checkingColmap} onClick={checkColmap}>
                  Verificar COLMAP
                </Button>
              </div>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              disabled={files.length === 0}
              onClick={runPipeline}
            >
              Gerar modelo 3D
            </Button>
          </div>
        </Card>
      </Layout.Content>
    </Layout>
  )
}

export default App
