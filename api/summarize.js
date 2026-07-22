export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { input } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server API Key not configured' });
    }

    let rawText = input.trim();
    let isUrl = /^https?:\/\//i.test(rawText);

    // 如果使用者輸入的是網址，進行深度網頁文字解析
    if (isUrl) {
        try {
            const webRes = await fetch(rawText, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });

            if (webRes.ok) {
                const html = await webRes.text();
                
                // 1. 優先抓取 OpenGraph 元資料 (通常包含高準確度的標題與貼文摘要)
                const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
                const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
                
                let extractedTitle = ogTitleMatch ? ogTitleMatch[1] : '';
                let extractedDesc = ogDescMatch ? ogDescMatch[1] : '';

                // 2. 清除 script, style 等雜訊標籤
                let cleanBody = html
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 3000);

                rawText = `[網址]: ${input}\n[文章標題]: ${extractedTitle}\n[文章簡介]: ${extractedDesc}\n[頁面主要內文]: ${cleanBody}`;
            }
        } catch (e) {
            // 抓取失敗時仍保留網址讓 AI 嘗試依據 URL 結構推斷
            rawText = `[無法存取內容的網址]: ${input}`;
        }
    }

    // 嚴格 AI 解析 Prompt
    const systemPrompt = `
你是一位極度嚴謹且專業的 K-Pop 追星情報分析師。
請仔細分析以下【輸入內容】，提取最精準的資訊。

【嚴格遵守規則】：
1. 僅根據輸入內容中【真正提到】的事實進行摘要，嚴禁捏造事實。
2. 如果輸入的是無效資訊或無法讀取的頁面，請在 points 填寫："無法直接抓取此平台內容，建議複製貼文文字貼上"。
3. 原文若沒提到金額，expenseAmount 請填 0。
4. 輸出格式必須是【純 JSON】，禁止任何 \`\`\`json 標記。

【JSON 輸出格式】：
{
  "platform": "情報來源 (例如 IG / Weverse / 官方公告，5字內)",
  "points": [
    "精準重點 1 (繁體中文，摘要核心資訊)",
    "精準重點 2",
    "精準重點 3"
  ],
  "reminders": [
    {
      "label": "關鍵時間說明 (如: 搶票 / 開演 / 預購)",
      "time": "YYYY/MM/DD HH:MM (原文若未提到請填 '原文未提及')"
    }
  ],
  "expenseItem": "推測相關品項名稱 (無則填 '未提及')",
  "expenseCategory": "必須從 [門票, 專輯, 周邊, 應援] 選擇一個",
  "expenseAmount": 數字 (原文未提到金額請填 0)
}

【輸入內容】：
${rawText}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
