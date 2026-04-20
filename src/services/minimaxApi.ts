/**
 * 豆包 PDF 提取 API 服务
 * 使用豆包 LLM 智能提取 AQL 报告中的信息
 */

// 豆包 API 配置
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses'
const DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215'

// 您需要在环境变量中设置 API Key
// export VITE_DOUBAO_API_KEY=your_api_key_here
const getApiKey = () => {
  const key = import.meta.env.VITE_DOUBAO_API_KEY || import.meta.env.DOUBAO_API_KEY
  if (!key) {
    throw new Error('请设置环境变量 VITE_DOUBAO_API_KEY')
  }
  return key
}

// PDF 文本提取提示词
const PDF_EXTRACTION_PROMPT = `你是一个专业的AQL检验报告数据提取助手。请仔细分析以下PDF文本，根据字段位置关系提取信息，并以JSON格式返回。

## 字段提取规则（按位置关系）：

1. **poNo** (PO/Split No): 
   - 位置：在 "Ship Mode" 后面的一串数字
   - 示例：Ship Mode: SEA 后面跟着 113441

2. **styleNo** (Style No.):
   - 位置：在 "Style No." 标签**正下方**的值（表格第一列）
   - **重要**：在 Purchase Order Summary 表格中，Style No 是第一列，Item No 是第二列
   - **重要区分**：Style No 通常是纯数字或字母+数字组合（如 8442603003, MW3633）
   - **Season 格式不同**：Season 通常包含斜杠（如 153/SS26, SS26）
   - 如果看到 "Style No." 和 "Season" 两个标签，Style No 是前者，Season 是后者
   - 示例：Style No: 8442603003, Item No: 966901, Season: 153/SS26

3. **itemNo** (Item No.):
   - 位置：在 "Item No." 标签**正下方**的值（表格第二列，在 Style No 右边）
   - **重要**：Item No 在 Style No 的右边，不是同一个值
   - 示例：966901

4. **deliveredQty** (Delivered Quantity):
   - 位置：在 "Inspection Qty" 前面的那个数字
   - 这是实际交货数量

5. **shipDate** (Expected Ship Date):
   - 位置：在 "Expected Ship Date" 标签后面的日期
   - 格式：转换为 YYYY-MM-DD

6. **customer** (Customer / Dept):
   - 位置：在 "Customer / Dept" 后面，格式是 "英文名称 / 数字"
   - 示例：BON PRIX HANDELSGESELLSCHAFT MBH / 113441
   - 保留完整的英文名称和斜杠后的数字

7. **vendor** (Vendor / Vendor No):
   - 位置：在 "Vendor / Vendor No" 后面，格式是 "英文名称 / 数字"
   - 示例：GLOBALLION / 12345
   - 保留完整的英文名称和斜杠后的数字

8. **inspectionQty** (Total Inspection Qty):
   - 位置：在 "Sort out Qty" 前面的那个数字
   - 这是总检验数量，必须是数字

9. **pendingIssue** (Recommendation / Remarks):
   - 位置：在 "Recommendation / Remarks" 后面的那句话
   - 如果没有问题，可能是 "PASS" 或 "ACCEPTED"

10. **defectDetails** (疵点详情):
    - **提取逻辑**（非常重要）：
      1. 先从 pendingIssue 中提取**具体的缺陷关键词**（如 "small stains", "spots through the fabric at collar facing", "neck diameter plus 1.5-2.5cm"）
      2. 在 "Defect Summary" 表格中查找 Comments 列**匹配**这些关键词的缺陷记录
      3. **语义匹配规则（关键）**：
         - **数值范围等价**："1.5-2.5cm" = "1.5 to 2.5cm" = "1.5 ~ 2.5cm"
         - **数值范围拆分**：如果 pending 提到范围（如 "1.5-2.5cm"），而 Defect 中是该范围内的**多个具体值**（如 1.5cm, 2cm, 2.5cm），**这些都要匹配出来**
         - **关注核心概念**：匹配时关注部位（neck diameter / armhole）和数值范围，忽略连接词差异
      4. **关键规则**：
         - **只提取 Comments 列有内容的记录**，Comments 为空的记录**不要计入**
         - **疵点描述必须使用 Comments 列的内容**，不要用 Description 列
         - **不要合并**：每条匹配的记录都要单独列出，不要把多条记录的数量加总
      5. **匹配示例**：
         
         **示例 A**：普通匹配
         - Pending: "small stains and spots through the fabric at collar facing"
         - Defect: "small stains" (1个), "spot through the fabric at collar facing" (3个)
         - 结果：两条独立记录，不要合并
         
         **示例 B**：范围对范围
         - Pending: "neck diameter plus 1.5-2.5cm"
         - Defect: "neck diameter plus 1.5 to 2.5cm for all size" (32个)
         - 结果：一条记录
         
         **示例 C**：范围对多个具体值（**不要合并**）
         - Pending: "neck diameter plus 1.5-2.5cm"
         - Defect: 
           - "neck diameter plus 1.5cm" (10个)
           - "neck diameter plus 2cm" (15个)
           - "neck diameter plus 2.5cm" (7个)
         - 结果：三条独立记录，分别列出，不要加总
    - **疵点描述**：使用 Comments 列的原文（不是 Description 列）
    - **疵点数量**：该行的 "No. of Defects" 数量
    - **疵点比例**：疵点数量 / inspectionQty * 100%，保留1位小数
    - **重要**：返回格式为数组，每个匹配的记录都要单独一个对象，**不要合并**

## 重要规则：
1. 仔细分析文本的位置关系，不要只看标签
2. 返回格式为标准JSON，不要包含任何其他文字
3. 如果某字段无法提取，设置为 null
4. 日期格式统一为 YYYY-MM-DD
5. 保留 Customer 和 Vendor 中的斜杠和数字部分
6. defectDetails 必须是数组格式，每个元素包含 description, count, rate

请以JSON格式返回，示例：
{
  "poNo": "QCR2512-010868",
  "styleNo": "8442603003",
  "itemNo": "966901",
  "deliveredQty": "802",
  "shipDate": "2025-12-22",
  "customer": "BON PRIX HANDELSGESELLSCHAFT MBH / 84.4",
  "vendor": "E AND D / 647875",
  "inspectionQty": 32,
  "pendingIssue": "fty hope otto can accept defect 291(small foreign color yarn)/210(small stains and spots through the fabric at collar facing) 356(wrinkle around the embroidery ); so I sealed 5 samples for confirmation.",
  "defectDetails": [
    {
      "description": "small stains",
      "count": 1,
      "rate": "3.1%"
    },
    {
      "description": "spot through the fabric at collar facing",
      "count": 3,
      "rate": "9.4%"
    }
  ]
  
  注意：
  1. Comments 为空的记录不要计入
  2. 疵点描述必须用 Comments 列的内容，不要用 Description 列
  3. "small stains" 和 "spot through the fabric at collar facing" 是两个不同的缺陷，要分开统计
}

PDF文本内容：
`

export interface DefectDetail {
  description: string
  count: number
  rate: string
}

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
  defectDetails: DefectDetail[]
}

/**
 * 使用豆包 API 提取 PDF 文本中的信息
 */
export async function extractPdfWithDoubao(pdfText: string): Promise<ExtractedReportData> {
  try {
    const apiKey = getApiKey()

    const response = await fetch(DOUBAO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: PDF_EXTRACTION_PROMPT + pdfText
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API请求失败: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    
    // 调试：打印完整响应
    console.log('豆包 API 完整响应:', JSON.stringify(result, null, 2))

    // Responses API 返回格式不同，需要适配
    // 尝试多种可能的响应结构
    let content: string | null = null
    
    if (result.output && Array.isArray(result.output) && result.output.length > 0) {
      // 豆包 Responses API 格式 - 找 type 为 "message" 的输出
      const messageOutput = result.output.find((item: any) => item.type === 'message')
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
        const textItem = messageOutput.content.find((c: any) => c.type === 'output_text')
        if (textItem && textItem.text) {
          content = textItem.text
        }
      }
      
      // 备用：尝试第一个 output 项
      if (!content) {
        const outputItem = result.output[0]
        if (typeof outputItem.content === 'string') {
          content = outputItem.content
        } else if (outputItem.content && outputItem.content[0] && outputItem.content[0].text) {
          content = outputItem.content[0].text
        }
      }
    } else if (result.choices && result.choices[0] && result.choices[0].message) {
      // Chat Completions API 格式
      content = result.choices[0].message.content
    } else if (result.content) {
      // 直接 content 字段
      content = result.content
    } else if (result.text) {
      // 直接 text 字段
      content = result.text
    }
    
    if (!content) {
      console.error('无法从响应中提取内容，响应结构:', result)
      throw new Error('API返回格式异常：无法提取内容')
    }
    
    // 处理 markdown 代码块，提取其中的 JSON
    let jsonContent = content
    const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonBlockMatch) {
      jsonContent = jsonBlockMatch[1].trim()
    }
    
    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(jsonContent)
      return {
        poNo: parsed.poNo || null,
        styleNo: parsed.styleNo || null,
        itemNo: parsed.itemNo || null,
        deliveredQty: parsed.deliveredQty || null,
        shipDate: parsed.shipDate || null,
        customer: parsed.customer || null,
        vendor: parsed.vendor || null,
        inspectionQty: parseInt(parsed.inspectionQty) || 0,
        pendingIssue: parsed.pendingIssue || null,
        defectDetails: parsed.defectDetails || []
      }
    } catch (parseError) {
      console.error('JSON解析失败，原始内容:', content)
      console.error('清理后的内容:', jsonContent)
      console.error('解析错误:', parseError)
      throw new Error('API返回内容不是有效的JSON格式')
    }
  } catch (error: any) {
    console.error('豆包 API 调用失败:', error)
    throw error
  }
}

/**
 * 发送邮件（使用 mailto 协议）
 */
export function generateEmail(report: any): { to: string; subject: string; body: string } {
  const subject = `Pending report- ${report.customer || ''} / ${report.vendor || ''}-${report.styleNo || ''}/${report.poNo || ''}/${report.itemNo || ''}`

  const body = `Customer/Vendor: ${report.customer || ''} / ${report.vendor || ''}

Style#: ${report.styleNo || ''}
PO#: ${report.poNo || ''}
Item#: ${report.itemNo || ''}
Delivered Qty: ${report.deliveredQty || ''}
Expected Ship Date: ${report.shipDate || ''}
Total Inspection Qty: ${report.inspectionQty || ''}

PENDING 问题:
${report.pendingIssue || '无'}

疵点详情:
${report.defectDetails && report.defectDetails.length > 0 
  ? report.defectDetails.map((d: any) => `- ${d.description}: ${d.count}个 (${d.rate})`).join('\n')
  : '无'}`

  return {
    // to: 'lin.feng@ottoint.com',
    to: 'cici.duan@ottoint.com',
    subject,
    body
  }
}

// AI 分析提示词
const AI_ANALYSIS_PROMPT = `你是一位专业的质量检验分析师。请对以下AQL检验报告进行深入分析，并生成一份详细的分析报告。

请从以下几个方面进行分析：

1. **报告概览**
   - 检验基本信息（PO号、Style号、Item号等）
   - 检验日期和发货日期
   - 供应商和客户信息

2. **数量分析**
   - 订单数量 vs 实际交货数量
   - 检验数量占比
   - 数量差异分析

3. **质量评估**
   - 整体质量等级判断（A/B/C级）
   - 发现的缺陷类型和严重程度
   - 缺陷率计算和趋势

4. **风险识别**
   - 潜在的质量风险
   - 交付风险
   - 客户满意度风险

5. **改进建议**
   - 针对发现的问题提出具体改进建议
   - 预防措施
   - 后续跟踪建议

6. **结论**
   - 是否建议放行
   - 需要关注的重点事项

请用中文生成详细的分析报告，格式清晰，包含具体的数字和分析依据。

AQL检验报告内容：
`

/**
 * 使用 AI 分析验货报告
 */
export async function analyzeReportWithAI(pdfText: string): Promise<string> {
  try {
    const apiKey = getApiKey()

    const response = await fetch(DOUBAO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: AI_ANALYSIS_PROMPT + pdfText
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API请求失败: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    
    console.log('AI 分析 API 响应:', JSON.stringify(result, null, 2))

    // 提取分析内容
    let content: string | null = null
    
    if (result.output && Array.isArray(result.output) && result.output.length > 0) {
      const messageOutput = result.output.find((item: any) => item.type === 'message')
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
        const textItem = messageOutput.content.find((c: any) => c.type === 'output_text')
        if (textItem && textItem.text) {
          content = textItem.text
        }
      }
      
      if (!content) {
        const outputItem = result.output[0]
        if (typeof outputItem.content === 'string') {
          content = outputItem.content
        } else if (outputItem.content && outputItem.content[0] && outputItem.content[0].text) {
          content = outputItem.content[0].text
        }
      }
    } else if (result.choices && result.choices[0] && result.choices[0].message) {
      content = result.choices[0].message.content
    } else if (result.content) {
      content = result.content
    } else if (result.text) {
      content = result.text
    }
    
    if (!content) {
      console.error('无法从响应中提取内容，响应结构:', result)
      throw new Error('API返回格式异常：无法提取内容')
    }
    
    return content
  } catch (error: any) {
    console.error('AI 分析失败:', error)
    throw error
  }
}
