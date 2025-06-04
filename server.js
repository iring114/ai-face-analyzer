const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Modality } = require("@google/generative-ai");
const multer = require('multer');
const fs = require('fs');
// Google Cloud Storage
const { Storage } = require('@google-cloud/storage');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');
// 新增 PostgreSQL 客戶端
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuration ---
dotenv.config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// Google Cloud Storage 設定
const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: GOOGLE_APPLICATION_CREDENTIALS, // 服務帳戶金鑰檔案路徑
});
const bucket = storage.bucket(GCS_BUCKET_NAME);

// PostgreSQL 連接設定
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 檢查必要的環境變數
if (!GEMINI_API_KEY) {
    console.error("Error: Missing GEMINI_API_KEY environment variable.");
    process.exit(1);
}

if (!GCS_BUCKET_NAME) {
    console.error("Error: Missing GCS_BUCKET_NAME environment variable.");
    process.exit(1);
}

// 測試資料庫連接並創建表
pool.connect(async (err, client, release) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err);
        process.exit(1);
    } else {
        console.log('Connected to PostgreSQL database');
        
        // 創建或更新face_analyses表
        try {
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS face_analyses (
                    id SERIAL PRIMARY KEY,
                    image_data TEXT,
                    image_name VARCHAR(255),
                    mime_type VARCHAR(100),
                    gcs_url TEXT,
                    ai_comment TEXT,
                    style_prompt TEXT,
                    language VARCHAR(10) DEFAULT 'zh',
                    style VARCHAR(50) DEFAULT 'mild',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `;
            
            await client.query(createTableQuery);
            console.log('Face analyses table created or verified');
            
            // 檢查並添加新欄位（如果不存在）
            const alterTableQueries = [
                "ALTER TABLE face_analyses ADD COLUMN IF NOT EXISTS gcs_url TEXT",
                "ALTER TABLE face_analyses ADD COLUMN IF NOT EXISTS style VARCHAR(50) DEFAULT 'mild'",
                "ALTER TABLE face_analyses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
                "ALTER TABLE face_analyses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()"
            ];
            
            for (const query of alterTableQueries) {
                await client.query(query);
            }
            
            console.log('Database schema updated successfully');
        } catch (dbError) {
            console.error('Error setting up database schema:', dbError);
        }
        
        release();
    }
});

// 移除AWS S3設定
// const s3 = new AWS.S3({...});

// Multer設定保持不變
const multerStorage = multer.memoryStorage();
const upload = multer({
    storage: multerStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Error: File upload only supports JPEG, JPG, PNG format!'));
        }
    }
});

// --- Google Generative AI Setup ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash", 
});

// Remove the separate imageGenerationModel, we'll use the main genAI instance with specific model for image generation
// const imageGenerationModel = genAI.getGenerativeModel({
//     model: "gemini-pro-vision", 
// });

const generationConfig = {
    temperature: 0.8,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    // responseMimeType: "text/plain", // Removed as it causes an error
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// --- Helper Functions ---
function fileToGenerativePart(filePath, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
            mimeType
        },
    };
}



// --- Express Routes ---
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json()); // Parse JSON bodies
app.use(express.static(path.join(__dirname))); // Serve static files from root (for index.html)
// app.use('/uploads', express.static(UPLOADS_DIR)); // Serve uploaded images (if needed for direct access) - Removed as GCS is used

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
    const style = req.body.style || 'mild';
    const isReanalysis = req.body.isReanalysis === 'true';
    
    console.log(`[Upload] Image received: ${originalName}, MIME type: ${mimeType}`);
    console.log(`[Upload] Style: ${style}, Language: ${language}, IsReanalysis: ${isReanalysis}`);

    try {
        let gcsImageUrl = null;
        let imageBase64 = req.file.buffer.toString('base64');
        let analysisId = null;

        // 如果不是重新分析，則上傳圖片到GCS並存儲到資料庫
        if (!isReanalysis) {
            // 上傳圖片到 Google Cloud Storage
            const gcsFileName = `face-analysis/${uuidv4()}-${originalName}`;
            const file = bucket.file(gcsFileName);
            
            console.log(`[GCS Upload] Uploading to: ${gcsFileName}`);
            
            await file.save(req.file.buffer, {
                metadata: {
                    contentType: mimeType,
                },
                // 移除 public: true，因為統一存儲桶級訪問權限不允許設置ACL
            });
            
            gcsImageUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${gcsFileName}`;
            console.log(`[GCS Upload] Successfully uploaded: ${gcsImageUrl}`);

            // 首次上傳時存儲圖片資訊到資料庫（不包含AI分析）
            const insertImageQuery = `
                INSERT INTO face_analyses (image_data, image_name, mime_type, gcs_url, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING id
            `;
            
            const imageValues = [imageBase64, originalName, mimeType, gcsImageUrl];
            const imageResult = await pool.query(insertImageQuery, imageValues);
            analysisId = imageResult.rows[0].id;
            
            console.log(`[Database] Image saved with ID: ${analysisId}`);
        } else {
            // 重新分析時，從請求中獲取分析ID
            analysisId = req.body.analysisId;
            if (!analysisId) {
                return res.status(400).json({ error: 'Analysis ID is required for reanalysis.' });
            }
        }

        // 執行AI分析
        const imagePart = {
            inlineData: {
                data: imageBase64,
                mimeType
            },
        };
        
        // Check if this is a fortune prediction request
        const analysisType = req.body.analysisType || 'normal';
        
        let basePrompts, endPrompts;
        
        if (analysisType === 'fortune') {
            // Fortune prediction specific prompts
            basePrompts = {
                'zh': '你是一位資深的命理師和面相專家，擅長通過觀察面部特徵來預測運勢和未來發展。',
                'en': 'You are an experienced fortune teller and physiognomy expert who excels at predicting fortune and future development through facial features.',
                'ja': 'あなたは顔の特徴を通じて運勢や将来の発展を予測することに長けた経験豊富な占い師および人相専門家です。'
            };
            
            endPrompts = {
                'zh': '請用不超過 200 字進行運勢預測分析，包括：1.近期運勢概況 2.財運分析 3.感情運勢 4.事業發展 5.健康運勢 6.開運建議。語氣要神秘而專業，給予積極正面的預測。',
                'en': 'Please provide a fortune prediction analysis in no more than 200 words, including: 1.Recent fortune overview 2.Financial luck analysis 3.Love fortune 4.Career development 5.Health fortune 6.Lucky advice. Maintain a mysterious yet professional tone with positive predictions.',
                'ja': '200文字以内で運勢予測分析を提供してください。含める内容：1.近期運勢の概況 2.金運分析 3.恋愛運 4.事業発展 5.健康運 6.開運アドバイス。神秘的でありながら専門的な口調で、ポジティブな予測を行ってください。'
            };
        } else {
            // Normal face analysis prompts
            basePrompts = {
                'zh': '你是一位專業的面相分析師，擅長通過觀察人的面部特徵來分析性格特質和個人特色。',
                'en': 'You are a professional physiognomy analyst who excels at analyzing personality traits and personal characteristics through facial features.',
                'ja': 'あなたは顔の特徴を通じて性格特性や個人的特徴を分析することに長けた専門的な人相分析師です。'
            };
            
            endPrompts = {
                'zh': '請用不超過 150 字進行專業的面像分析，包括：1.面部特徵描述 2.可能的性格特質 3.個人魅力點 4.建議的發展方向。語氣要專業但親切，給予正面積極的分析。',
                'en': 'Please provide a professional physiognomy analysis in no more than 150 words, including: 1.Facial feature description 2.Possible personality traits 3.Personal charm points 4.Suggested development directions. Maintain a professional yet friendly tone with positive analysis.',
                'ja': '150文字以内で専門的な人相分析を提供してください。含める内容：1.顔の特徴の説明 2.可能性のある性格特性 3.個人的な魅力ポイント 4.推奨される発展方向。専門的でありながら親しみやすい口調で、ポジティブな分析を行ってください。'
            };
        }
        
        const basePrompt = basePrompts[language] || basePrompts['zh'];
        const endPrompt = endPrompts[language] || endPrompts['zh'];
        const prompt = `${basePrompt} ${stylePrompt} ${endPrompt}`;

        const chatSession = model.startChat({
            generationConfig,
            safetySettings,
            history: [],
        });

        const result = await chatSession.sendMessage([prompt, imagePart]);
        const aiComment = result.response.text();
        console.log("[AI Comment] Generated: ", aiComment);

        // 更新資料庫中的AI分析結果
        const updateQuery = `
            UPDATE face_analyses 
            SET ai_comment = $1, style_prompt = $2, language = $3, style = $4, analysis_type = $5, updated_at = NOW()
            WHERE id = $6
        `;
        
        const updateValues = [aiComment, stylePrompt, language, style, analysisType, analysisId];
        await pool.query(updateQuery, updateValues);
        
        console.log(`[Database] Analysis updated for ID: ${analysisId}`);

        res.json({ 
            message: isReanalysis ? 'Image reanalyzed successfully!' : 'Image processed successfully and uploaded to GCS!', 
            aiComment: aiComment,
            analysisId: analysisId,
            imageData: `data:${mimeType};base64,${imageBase64}`,
            gcsUrl: gcsImageUrl
        });

    } catch (error) {
        console.error("[Upload] Error processing image:", error);
        
        // 檢查是否為配額超限錯誤
        if (error.message && error.message.includes('quota')) {
            res.status(429).json({ 
                error: 'API配額已達上限，請稍後再試。建議：1. 等待一段時間後重試 2. 檢查您的Google Cloud配額設定', 
                quotaExceeded: true 
            });
        } else {
            res.status(500).json({ error: 'Failed to process image with AI or upload to GCS. ' + error.message });
        }
    }
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

module.exports = app; // For testing or other integrations