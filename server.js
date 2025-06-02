// server.js (或你的主檔案)

const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const multer = require('multer');
const fs = require('fs').promises; // 使用 promise 版本的 fs
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuration ---
dotenv.config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RENDER_DISK_UPLOADS_PATH = process.env.RENDER_DISK_UPLOADS_PATH; // 新增：Render Disk 掛載路徑

if (!GEMINI_API_KEY || !RENDER_DISK_UPLOADS_PATH) {
    console.error("Error: Missing required environment variables (GEMINI_API_KEY, RENDER_DISK_UPLOADS_PATH).");
    process.exit(1);
}

// --- Multer Setup (保持 memoryStorage) ---
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => { /* ... 你的檔案過濾邏輯 ... */ }
});

// --- Google Generative AI Setup (不變) ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// ... (model, generationConfig, safetySettings 設定不變)

// --- Express Middlewares and Static Serving ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname))); // For index.html etc.

// 確保 Render Disk 掛載的目錄存在
(async () => {
    try {
        await fs.access(RENDER_DISK_UPLOADS_PATH);
        console.log(`Upload directory ${RENDER_DISK_UPLOADS_PATH} already exists.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Upload directory ${RENDER_DISK_UPLOADS_PATH} does not exist. Creating it...`);
            try {
                await fs.mkdir(RENDER_DISK_UPLOADS_PATH, { recursive: true });
                console.log(`Successfully created upload directory: ${RENDER_DISK_UPLOADS_PATH}`);
            } catch (mkdirError) {
                console.error(`Error creating upload directory ${RENDER_DISK_UPLOADS_PATH}:`, mkdirError);
                process.exit(1); // 如果無法建立儲存目錄，則無法繼續
            }
        } else {
            console.error(`Error accessing upload directory ${RENDER_DISK_UPLOADS_PATH}:`, error);
            process.exit(1);
        }
    }
})();


// 新增：服務儲存在 Render Disk 上的圖片
app.use('/render-uploads', express.static(RENDER_DISK_UPLOADS_PATH));

// --- Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const mimeType = req.file.mimetype;
    const originalName = req.file.originalname;
    const stylePrompt = req.body.stylePrompt || "請專業分析這張人像照片的面部特徵與可能的性格特質";
    const language = req.body.language || 'zh';

    const uniqueFileName = `${uuidv4()}-${path.parse(originalName).name}${path.extname(originalName)}`; // 保留原副檔名
    const diskFilePath = path.join(RENDER_DISK_UPLOADS_PATH, uniqueFileName);

    console.log(`[Upload] Image received: ${originalName}, MIME: ${mimeType}`);
    console.log(`[Disk Upload] Attempting to save to: ${diskFilePath}`);

    try {
        // 1. 儲存到 Render Disk
        await fs.writeFile(diskFilePath, req.file.buffer);
        console.log(`[Disk Upload] Successfully saved: ${diskFilePath}`);

        // 2. Gemini API 處理 (與之前相同)
        const imagePart = { inlineData: { data: req.file.buffer.toString("base64"), mimeType } };
        // ... (Gemini prompt 和 API 呼叫邏輯)
        const generationConfig = { /* ... */ };
        const safetySettings = [ /* ... */ ];
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // 確保 model 正確初始化

        const basePrompts = {
            'zh': '你是一位專業的面相分析師，擅長通過觀察人的面部特徵來分析性格特質和個人特色。',
            'en': 'You are a professional physiognomy analyst who excels at analyzing personality traits and personal characteristics through facial features.',
            'ja': 'あなたは顔の特徴を通じて性格特性や個人的特徴を分析することに長けた専門的な人相分析師です。'
        };
        
        const endPrompts = {
            'zh': '請用不超過 150 字進行專業的面像分析，包括：1.面部特徵描述 2.可能的性格特質 3.個人魅力點 4.建議的發展方向。語氣要專業但親切，給予正面積極的分析。',
            'en': 'Please provide a professional physiognomy analysis in no more than 150 words, including: 1.Facial feature description 2.Possible personality traits 3.Personal charm points 4.Suggested development directions. Maintain a professional yet friendly tone with positive analysis.',
            'ja': '150文字以内で専門的な人相分析を提供してください。含める内容：1.顔の特徴の説明 2.可能性のある性格特性 3.個人的な魅力ポイント 4.推奨される発展方向。専門的でありながら親しみやすい口調で、ポジティブな分析を行ってください。'
        };
        
        const basePrompt = basePrompts[language] || basePrompts['zh'];
        const endPrompt = endPrompts[language] || endPrompts['zh'];
        const fullPrompt = `${basePrompt} ${stylePrompt} ${endPrompt}`; // 注意變數名稱 prompt 已被使用，改為 fullPrompt 或其他

        const chatSession = model.startChat({
            generationConfig,
            safetySettings,
            history: [],
        });

        const result = await chatSession.sendMessage([fullPrompt, imagePart]); // 使用 fullPrompt
        const aiComment = result.response.text();
        console.log("[AI Comment] Generated: ", aiComment);


        // 3. 回傳結果
        const uploadedFileUrl = `/render-uploads/${uniqueFileName}`;
        res.json({
            message: 'Image processed and saved to Render Disk!',
            aiComment: aiComment,
            uploadedImageUrl: uploadedFileUrl
        });

    } catch (error) {
        console.error("[Upload] Error:", error);
        res.status(500).json({ error: 'Failed to process image or save to disk. ' + error.message });
    }
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    if (RENDER_DISK_UPLOADS_PATH) {
        console.log(`Serving uploads from: ${RENDER_DISK_UPLOADS_PATH}`);
        console.log(`Uploaded images accessible via /render-uploads route.`);
    }
});

module.exports = app;