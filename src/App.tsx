import { useState, useCallback, useRef } from 'react'
import { generateEmail as generateEmailContent, extractPdfWithDoubao } from './services/minimaxApi'
import { Upload, FileText, Mail, X, Save, Edit3, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

// PDF.js  worker 配置
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

export interface DefectDetail {
  description: string
  count: number
  rate: string
}

export interface ReportData {
  id: string
  fileName: string
  styleNo: string
  poNo: string
  itemNo: string
  deliveredQty: string
  shipDate: string
  inspectionQty: number
  pendingIssue: string
  defectDetails: DefectDetail[]
  customer: string
  vendor: string
  timestamp: number
  emailSent?: boolean
}

const HISTORY_KEY = 'pending_report_history'

function loadHistory(): ReportData[] {
  try {
    const data = localStorage.getItem(HISTORY_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveHistory(history: ReportData[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

// 提取 PDF 文本内容
async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const strings = content.items.map((item: any) => item.str)
    fullText += strings.join(' ') + '\n'
  }
  return fullText
}

export default function App() {
  const [history, setHistory] = useState<ReportData[]>(loadHistory)
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  
  // 编辑相关状态
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  
  // 疵点编辑状态
  const [editingDefectIndex, setEditingDefectIndex] = useState<number | null>(null)
  const [editingDefectField, setEditingDefectField] = useState<'description' | 'count' | null>(null)
  const [editDefectValue, setEditDefectValue] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    setIsExtracting(true)
    setExtractionError(null)
    
    try {
      for (const file of files) {
        // 1. 提取 PDF 文本
        const pdfText = await extractPdfText(file)
        
        // 2. 使用 AI API 提取信息
        const extracted = await extractPdfWithDoubao(pdfText)
        
        // 3. 创建报告数据
        const report: ReportData = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          fileName: file.name,
          styleNo: extracted.styleNo || 'N/A',
          poNo: extracted.poNo || 'N/A',
          itemNo: extracted.itemNo || 'N/A',
          deliveredQty: extracted.deliveredQty || 'N/A',
          shipDate: extracted.shipDate || 'N/A',
          inspectionQty: extracted.inspectionQty || 0,
          pendingIssue: extracted.pendingIssue || '',
          defectDetails: extracted.defectDetails || [],
          customer: extracted.customer || '',
          vendor: extracted.vendor || '',
          timestamp: Date.now(),
          emailSent: false
        }
        
        // 4. 保存到历史记录
        const newHistory = [report, ...history]
        setHistory(newHistory)
        saveHistory(newHistory)
        
        // 5. 显示当前报告
        setCurrentReport(report)
      }
    } catch (error: any) {
      console.error('提取失败:', error)
      setExtractionError(error.message || '提取失败，请检查 API Key 和网络连接')
    } finally {
      setIsExtracting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [history])

  const startEdit = (field: string) => {
    if (currentReport) {
      setEditingField(field)
      setEditValue(String(currentReport[field as keyof ReportData] || ''))
    }
  }

  const saveEdit = () => {
    if (currentReport && editingField) {
      const updated = { ...currentReport, [editingField]: editValue }
      
      setCurrentReport(updated)
      const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
      setHistory(updatedHistory)
      saveHistory(updatedHistory)
    }
    setEditingField(null)
    setEditValue('')
  }

  // 疵点编辑保存
  const saveDefectEdit = () => {
    if (currentReport && editingDefectIndex !== null && editingDefectField) {
      const updatedDefects = [...currentReport.defectDetails]
      const defect = updatedDefects[editingDefectIndex]
      
      if (editingDefectField === 'description') {
        defect.description = editDefectValue
      } else if (editingDefectField === 'count') {
        const count = parseInt(editDefectValue) || 0
        defect.count = count
        // 自动重新计算比例
        const rate = ((count / (currentReport.inspectionQty || 1)) * 100).toFixed(1)
        defect.rate = `${rate}%`
      }
      
      const updated = { ...currentReport, defectDetails: updatedDefects }
      setCurrentReport(updated)
      const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
      setHistory(updatedHistory)
      saveHistory(updatedHistory)
    }
    setEditingDefectIndex(null)
    setEditingDefectField(null)
    setEditDefectValue('')
  }

  // 开始编辑疵点
  const startEditDefect = (index: number, field: 'description' | 'count', value: string | number) => {
    setEditingDefectIndex(index)
    setEditingDefectField(field)
    setEditDefectValue(String(value))
  }

  // 新增疵点记录
  const addDefect = () => {
    if (!currentReport) return
    
    const newDefect: DefectDetail = {
      description: '新疵点描述',
      count: 0,
      rate: '0.0%'
    }
    
    const updatedDefects = [...currentReport.defectDetails, newDefect]
    const updated = { ...currentReport, defectDetails: updatedDefects }
    setCurrentReport(updated)
    const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
    setHistory(updatedHistory)
    saveHistory(updatedHistory)
  }

  // 删除疵点记录
  const deleteDefect = (index: number) => {
    if (!currentReport) return
    
    const updatedDefects = currentReport.defectDetails.filter((_, i) => i !== index)
    const updated = { ...currentReport, defectDetails: updatedDefects }
    setCurrentReport(updated)
    const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
    setHistory(updatedHistory)
    saveHistory(updatedHistory)
  }

  const handleGenerateEmail = () => {
    if (!currentReport) return
    
    const { subject, body } = generateEmailContent(currentReport)
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    
    window.location.href = mailtoLink
    
    // 更新发送状态
    const updated = { ...currentReport, emailSent: true }
    setCurrentReport(updated)
    const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
    setHistory(updatedHistory)
    saveHistory(updatedHistory)
    setEmailStatus('success')
    setTimeout(() => setEmailStatus('idle'), 3000)
  }

  const selectReport = (report: ReportData) => {
    setCurrentReport(report)
    setEmailStatus('idle')
  }

  const clearCurrent = () => {
    setCurrentReport(null)
    setEmailStatus('idle')
  }

  const deleteReport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newHistory = history.filter(item => item.id !== id)
    setHistory(newHistory)
    saveHistory(newHistory)
    if (currentReport?.id === id) {
      setCurrentReport(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-400" />
            <h1 className="text-xl font-bold">AQL 检验报告工具</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtracting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
            >
              {isExtracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              {isExtracting ? '提取中...' : '上传 PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {extractionError && (
        <div className="max-w-6xl mx-auto px-6 mt-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{extractionError}</span>
            <button onClick={() => setExtractionError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 历史记录列表 */}
          <div className="lg:col-span-1 bg-slate-800 rounded-xl p-4">
            <h2 className="text-lg font-medium mb-4">历史记录 ({history.length})</h2>
            {history.length === 0 ? (
              <p className="text-slate-400 text-sm">暂无历史记录</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {history.map(report => (
                  <div
                    key={report.id}
                    onClick={() => selectReport(report)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      currentReport?.id === report.id ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{report.fileName}</p>
                        <p className="text-xs text-slate-400 truncate">PO#: {report.poNo}</p>
                        <p className="text-xs text-slate-400 truncate">Style#: {report.styleNo}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {report.emailSent && <CheckCircle className="w-4 h-4 text-green-400" />}
                        <button
                          onClick={(e) => deleteReport(report.id, e)}
                          className="p-1 hover:bg-slate-500 rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 当前报告详情 */}
          <div className="lg:col-span-2">
            {currentReport ? (
              <div className="bg-slate-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-blue-400" />
                    <span className="text-lg font-medium">{currentReport.fileName}</span>
                  </div>
                  <button onClick={clearCurrent} className="p-2 hover:bg-slate-700 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 基本信息 */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">PO# / Split No.</p>
                    {editingField === 'poNo' ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    ) : (
                      <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('poNo')}>{currentReport.poNo}</p>
                    )}
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Expected Ship Date</p>
                    {editingField === 'shipDate' ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    ) : (
                      <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('shipDate')}>{currentReport.shipDate}</p>
                    )}
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Style#</p>
                    {editingField === 'styleNo' ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    ) : (
                      <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('styleNo')}>{currentReport.styleNo}</p>
                    )}
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Item#</p>
                    {editingField === 'itemNo' ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    ) : (
                      <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('itemNo')}>{currentReport.itemNo}</p>
                    )}
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Delivered Qty</p>
                    {editingField === 'deliveredQty' ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    ) : (
                      <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('deliveredQty')}>{currentReport.deliveredQty}</p>
                    )}
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Total Inspection Qty</p>
                    <p className="text-lg font-bold text-green-400">{currentReport.inspectionQty || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Customer / Dept</p>
                    {editingField === 'customer' ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    ) : (
                      <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('customer')}>{currentReport.customer}</p>
                    )}
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 col-span-2 md:col-span-1">
                    <p className="text-xs text-slate-400 mb-1">Vendor / Vendor No</p>
                    {editingField === 'vendor' ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    ) : (
                      <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('vendor')}>{currentReport.vendor}</p>
                    )}
                  </div>
                </div>

                {/* PENDING 问题 */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-400 font-medium">PENDING 问题</span>
                  </div>
                  {editingField === 'pendingIssue' ? (
                    <div className="flex gap-2">
                      <textarea
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="flex-1 bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm"
                        rows={2}
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <button onClick={saveEdit} className="p-1 bg-green-600 rounded"><Save className="w-3 h-3" /></button>
                        <button onClick={() => setEditingField(null)} className="p-1 bg-slate-600 rounded"><X className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 group">
                      <p className="text-sm flex-1">{currentReport.pendingIssue || '无'}</p>
                      <button onClick={() => startEdit('pendingIssue')} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded">
                        <Edit3 className="w-3 h-3 text-slate-400" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 疵点详情 */}
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <span className="text-purple-400 font-medium">疵点详情</span>
                      <span className="text-xs bg-slate-600 px-2 py-0.5 rounded">Total Inspection Qty: {currentReport.inspectionQty || 'N/A'}</span>
                    </div>
                    <button
                      onClick={addDefect}
                      className="flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs transition-colors"
                    >
                      <span>+</span> 新增疵点
                    </button>
                  </div>
                  
                  {currentReport.defectDetails && currentReport.defectDetails.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-slate-600">
                      {/* 表头 */}
                      <div className="grid grid-cols-12 gap-2 bg-slate-700 px-3 py-2 text-xs font-medium text-slate-300">
                        <div className="col-span-5">疵点描述</div>
                        <div className="col-span-2 text-center">疵点数量</div>
                        <div className="col-span-3 text-center">疵点比例</div>
                        <div className="col-span-2 text-center">操作</div>
                      </div>
                      {/* 数据行 */}
                      {currentReport.defectDetails.map((defect, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm border-t border-slate-600/50 bg-slate-800/50 items-center">
                          {/* 疵点描述 - 可编辑 */}
                          <div className="col-span-5">
                            {editingDefectIndex === index && editingDefectField === 'description' ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editDefectValue}
                                  onChange={e => setEditDefectValue(e.target.value)}
                                  className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-xs"
                                  autoFocus
                                  onKeyDown={e => e.key === 'Enter' && saveDefectEdit()}
                                />
                                <button onClick={saveDefectEdit} className="p-1 bg-green-600 rounded"><Save className="w-3 h-3" /></button>
                                <button onClick={() => {setEditingDefectIndex(null); setEditingDefectField(null)}} className="p-1 bg-slate-600 rounded"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <div 
                                className="text-white truncate cursor-pointer hover:text-blue-400 hover:bg-slate-700/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                                title={defect.description}
                                onClick={() => startEditDefect(index, 'description', defect.description)}
                              >
                                {defect.description}
                              </div>
                            )}
                          </div>
                          
                          {/* 疵点数量 - 可编辑 */}
                          <div className="col-span-2 text-center">
                            {editingDefectIndex === index && editingDefectField === 'count' ? (
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  value={editDefectValue}
                                  onChange={e => setEditDefectValue(e.target.value)}
                                  className="w-16 bg-slate-600 border border-slate-500 rounded px-2 py-1 text-xs text-center"
                                  autoFocus
                                  onKeyDown={e => e.key === 'Enter' && saveDefectEdit()}
                                />
                                <button onClick={saveDefectEdit} className="p-1 bg-green-600 rounded"><Save className="w-3 h-3" /></button>
                                <button onClick={() => {setEditingDefectIndex(null); setEditingDefectField(null)}} className="p-1 bg-slate-600 rounded"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <span 
                                className="text-slate-300 cursor-pointer hover:text-blue-400 hover:bg-slate-700/50 rounded px-2 py-0.5 transition-colors inline-block"
                                onClick={() => startEditDefect(index, 'count', defect.count)}
                              >
                                {defect.count}
                              </span>
                            )}
                          </div>
                          
                          {/* 疵点比例 - 自动计算，不可编辑 */}
                          <div className="col-span-3 text-center font-medium text-purple-400">
                            {defect.rate}
                          </div>
                          
                          {/* 删除操作 */}
                          <div className="col-span-2 text-center">
                            <button
                              onClick={() => deleteDefect(index)}
                              className="p-1 bg-red-600/80 hover:bg-red-600 rounded text-xs transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">暂无疵点信息</div>
                  )}
                </div>

                {/* 生成邮件按钮 */}
                <button
                  onClick={handleGenerateEmail}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-medium flex items-center justify-center gap-2 hover:from-blue-500 hover:to-purple-500"
                >
                  <Mail className="w-5 h-5" />
                  生成邮件
                </button>
                
                {emailStatus === 'success' && (
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 text-sm">邮件已打开！请添加PDF附件后发送</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center">
                <Upload className="w-16 h-16 text-slate-600 mb-4" />
                <p className="text-slate-400 text-lg mb-2">上传 PDF 文件开始提取</p>
                <p className="text-slate-500 text-sm">支持批量上传，一次处理多个文件</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
