export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { input } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server API Key not configured' });
    }

    let contentToAnalyze = input;

    // 檢查使用者輸入是否為網址 (URL)
    const urlRegex = /^https?:\/\//i;
    if (urlRegex.test(input.trim())) {
        try {
            const webResponse = await fetch(input.trim(), {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const htmlText = await webResponse.text();
            contentToAnalyze = `使用者提供的目標網址: ${input}\n網頁提取內容摘要: ${htmlText.replace(/<[^>]*>?/gm, ' ').substring(0, 8000)}`;
        } catch (err) {
            contentToAnalyze = `使用者提供的網址 (無法直接讀取詳細內容): ${input}`;
        }
    }

    const systemPrompt = `
你是一個專業的 K-pop 追星情報分析小幫手。
請分析以下粉絲提供的內容，提取重點，並**嚴格依照以下 JSON 格式輸出**，絕對不要包含任何其他文字、Markdown 標記或反引號 (例如 \`\`\`json 或 \`\`\也不要)。

格式要求：
{
  "platform": "判斷情報來源，限制 6 個字以內",
  "points": ["繁體中文重點1，不超過25字", "重點2", "重點3"],
  "reminders": [
    {"label": "擷取事件名稱", "time": "YYYY/MM/DD HH:MM (若無請寫 未定)"}
  ],
  "expenseItem": "推測可能會花錢的品項名稱",
  "expenseCategory": "必須從 [門票, 專輯, 周邊, 應援] 之中選擇一個最符合的類別",
  "expenseAmount": 數字 (例如 850，若沒寫請隨便猜一個合理數字，不要填 0)
}

分析內容：
${contentToAnalyze}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }]
            })
        });

        const data = await response.json();
        
        // 如果 Google API 回傳錯誤，直接把錯誤拋出來
        if (data.error) {
            return res.status(500).json({ error: data.error.message || 'Gemini API 發生錯誤' });
        }

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
