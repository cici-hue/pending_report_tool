/**
 * 本地 PDF 字段提取服务
 * 使用正则表达式从 PDF 文本中提取字段，无需调用 API
 */

export interface ExtractedReportData {
  poNo: string | null
  styleNo: string | null
  itemNo: string | null
  deliveredQty: string | null
  shipDate: string | null
  customer: string | null
  vendor: string | null
  inspectionQty: number
  pendingIssue: string | null
}

/**
 * 检查提取结果是否完整
 */
export function isExtractionComplete(data: ExtractedReportData): boolean {
  // 关键字段：PO、Style、Item、Inspection Qty 必须有值
  const hasCriticalFields = 
    data.poNo && 
    data.styleNo && 
    data.itemNo && 
    data.inspectionQty > 0
  
  // 至少要有 6 个字段有值
  const fieldCount = [
    data.poNo,
    data.styleNo,
    data.itemNo,
    data.deliveredQty,
    data.shipDate,
    data.customer,
    data.vendor
  ].filter(Boolean).length
  
  return !!hasCriticalFields && fieldCount >= 5
}

/**
 * 从 PDF 文本中提取所有字段
 */
export function extractPdfWithLocal(pdfText: string): ExtractedReportData {
  // 保留原始文本
  const rawText = pdfText
  const cleanText = pdfText.replace(/\s+/g, ' ').trim()
  
  console.log('=== PDF 文本提取调试 ===')
  console.log('原始文本:\n', rawText.substring(0, 5000))
  
  const result: ExtractedReportData = {
    poNo: extractPoNo(rawText, cleanText),
    styleNo: extractStyleNo(rawText, cleanText),
    itemNo: extractItemNo(rawText, cleanText),
    deliveredQty: extractDeliveredQty(rawText, cleanText),
    shipDate: null, // Ship Date 用 AI 提取
    customer: extractCustomer(rawText, cleanText),
    vendor: extractVendor(rawText, cleanText),
    inspectionQty: extractInspectionQty(rawText, cleanText),
    pendingIssue: extractPendingIssue(rawText, cleanText)
  }
  
  console.log('提取结果:', result)
  console.log('是否完整:', isExtractionComplete(result))
  
  return result
}

/**
 * 提取 PO 号码
 * PO/Split No 在 Ship Mode 后面
 */
function extractPoNo(rawText: string, cleanText: string): string | null {
  // Ship Mode 后面跟着的数字
  const patterns = [
    /Ship\s*Mode\s*[:\s]*\S*\s*(\d{6,15})/i,
    /Ship\s*Mode[^\n]*\n[^\n]*(\d{6,15})/i,
    /Ship\s*Mode[\s\S]{0,100}?(\d{6,15})/i
  ]
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = match[1].trim()
      console.log('PO/Split No 匹配成功:', value)
      return value
    }
  }
  
  return null
}

/**
 * 提取 Style 号码
 * Style No. 在 Item Description 后面
 */
function extractStyleNo(rawText: string, cleanText: string): string | null {
  // Item Description 后面第一串数字/字母
  const patterns = [
    /Item\s*Description\s*[:\s]*([A-Z0-9-]{3,20})/i,
    /Item\s*Description[^\n]*\n\s*([A-Z0-9-]{3,20})/i,
    /Item\s*Description[\s\S]{0,50}?([A-Z0-9-]{5,20})/i
  ]
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = match[1].trim()
      console.log('Style No 匹配成功:', value)
      return value
    }
  }
  
  return null
}

/**
 * 提取 Item 号码
 * Item No. 是 Item Description 后面的第二串数字
 */
function extractItemNo(rawText: string, cleanText: string): string | null {
  // Item Description 后面两串数字，取第二个
  const patterns = [
    /Item\s*Description\s*[:\s]*[A-Z0-9-]+\s+([A-Z0-9-]{3,20})/i,
    /Item\s*Description[^\n]*\n[^\n]*?([A-Z0-9-]{3,20})[^\n]*?([A-Z0-9-]{3,20})/i,
    /Item\s*Description[\s\S]{0,100}?[A-Z0-9-]+\s+([A-Z0-9-]{5,20})/i
  ]
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      // 如果有两个捕获组，取第二个（Item No）
      const value = match[2] ? match[2].trim() : match[1].trim()
      console.log('Item No 匹配成功:', value)
      return value
    }
  }
  
  return null
}

/**
 * 提取交货数量
 * Delivered Quantity 是 Inspection Qty 前面的数字
 */
function extractDeliveredQty(rawText: string, cleanText: string): string | null {
  // Inspection Qty 前面的数字
  const patterns = [
    /(\d{1,6})\s*\n?\s*Inspection\s*Qty/i,
    /(\d{1,6})\s+Inspection\s*Qty/i,
    /Delivered\s*Quantity\s*[:\s]*(\d{1,6})/i,
    /(\d{3,6})\s*\n\s*Inspection/i
  ]
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = match[1].trim()
      console.log('Delivered Quantity 匹配成功:', value)
      return value
    }
  }
  
  return null
}

/**
 * 提取检验数量
 * Total Inspection Qty 是 Sort out Qty 前面的数字
 */
function extractInspectionQty(rawText: string, cleanText: string): number {
  // Sort out Qty 前面的数字
  const patterns = [
    /(\d{1,5})\s*\n?\s*Sort\s*out\s*Qty/i,
    /(\d{1,5})\s+Sort\s*out\s*Qty/i,
    /Total\s*Inspection\s*Qty\s*[:\s]*(\d{1,5})/i,
    /(\d{1,5})\s*\n\s*Sort\s*out/i
  ]
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = parseInt(match[1].trim(), 10)
      console.log('Total Inspection Qty 匹配成功:', value)
      return value
    }
  }
  
  // 备用：尝试其他常见格式
  const backupPatterns = [
    /Sampling\s*Size\s*[:\s]*(\d{1,5})/i,
    /Inspection\s*Qty\s*[:\s]*(\d{1,5})/i
  ]
  
  for (const pattern of backupPatterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = parseInt(match[1].trim(), 10)
      console.log('Inspection Qty (备用) 匹配成功:', value)
      return value
    }
  }
  
  return 0
}

/**
 * 提取客户名称
 * Customer / Dept 后的一串英文 + / + 数字
 */
function extractCustomer(rawText: string, cleanText: string): string | null {
  const patterns = [
    /Customer\s*\/\s*Dept\s*[:\s]*([A-Z][A-Z\s]+\/\s*\d+)/i,
    /Customer\s*\/\s*Dept[^\n]*\n\s*([A-Z][A-Z\s]+\/\s*\d+)/i,
    /Customer\s*\/\s*Dept[\s\S]{0,100}?([A-Z]{2,20}\s*\/\s*\d{1,10})/i
  ]
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = match[1].trim().replace(/\s+/g, ' ')
      console.log('Customer/Dept 匹配成功:', value)
      return value
    }
  }
  
  // 备用：只匹配英文
  const backupPatterns = [
    /Customer\s*\/\s*Dept\s*[:\s]*([A-Z][A-Z\s]{2,30})/i,
    /Customer\s*[:\s]*([A-Z][A-Z\s]{2,30})/i
  ]
  
  for (const pattern of backupPatterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = match[1].trim()
      console.log('Customer (备用) 匹配成功:', value)
      return value
    }
  }
  
  return null
}

/**
 * 提取供应商名称
 * Vendor / Vendor No 后的一串英文 + / + 数字
 */
function extractVendor(rawText: string, cleanText: string): string | null {
  const patterns = [
    /Vendor\s*\/\s*Vendor\s*No\s*[:\s]*([A-Z][A-Z\s]+\/\s*\d+)/i,
    /Vendor\s*\/\s*Vendor\s*No[^\n]*\n\s*([A-Z][A-Z\s]+\/\s*\d+)/i,
    /Vendor\s*\/\s*Vendor\s*No[\s\S]{0,100}?([A-Z]{2,20}\s*\/\s*\d{1,10})/i
  ]
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = match[1].trim().replace(/\s+/g, ' ')
      console.log('Vendor/Vendor No 匹配成功:', value)
      return value
    }
  }
  
  // 备用：只匹配英文
  const backupPatterns = [
    /Vendor\s*\/\s*Vendor\s*No\s*[:\s]*([A-Z][A-Z\s]{2,30})/i,
    /Vendor\s*[:\s]*([A-Z][A-Z\s]{2,30})/i
  ]
  
  for (const pattern of backupPatterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = match[1].trim()
      console.log('Vendor (备用) 匹配成功:', value)
      return value
    }
  }
  
  return null
}

/**
 * 提取 PENDING 问题
 * Recommendation / Remarks 后面的话
 */
function extractPendingIssue(rawText: string, cleanText: string): string | null {
  const patterns = [
    // Recommendation / Remarks 后面的内容
    /Recommendation\s*\/\s*Remarks\s*[:\s]*([^\n]{5,500})/i,
    /Recommendation\s*\/\s*Remarks[^\n]*\n\s*([^\n]{5,500})/i,
    /Recommendation\s*\/\s*Remarks[\s\S]{0,200}?([A-Z][^\n]{10,500})/i,
    // PENDING 相关
    /PENDING\s*[:\s]*([^\n]{5,500})/i,
    /Pending\s*Issue\s*[:\s]*([^\n]{5,500})/i
  ]
  
  for (const pattern of patterns) {
    const match = rawText.match(pattern) || cleanText.match(pattern)
    if (match) {
      const value = match[1].trim().replace(/\s+/g, ' ')
      if (value.length >= 5 && !value.match(/^(N\/A|None|No|Pass)$/i)) {
        console.log('Pending Issue 匹配成功:', value.substring(0, 100))
        return value.substring(0, 500)
      }
    }
  }
  
  return null
}
