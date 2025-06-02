# Google Cloud Storage 設置指南

## 1. 創建 Google Cloud Storage Bucket

### 步驟 1: 創建 Google Cloud 項目
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 創建新項目或選擇現有項目
3. 啟用 Cloud Storage API

### 步驟 2: 創建 Storage Bucket
1. 在 Google Cloud Console 中，前往 Cloud Storage
2. 點擊「創建 Bucket」
3. 選擇 Bucket 名稱（全球唯一）
4. 選擇地區（建議選擇離用戶最近的地區）
5. 設置存取控制為「統一」
6. 點擊「創建」

### 步驟 3: 設置 Bucket 權限
1. 選擇您的 Bucket
2. 前往「權限」標籤
3. 點擊「新增主體」
4. 添加 `allUsers` 並給予「Storage Object Viewer」角色（用於公開讀取圖片）

## 2. 創建服務帳戶

### 步驟 1: 創建服務帳戶
1. 前往 IAM & Admin > 服務帳戶
2. 點擊「創建服務帳戶」
3. 輸入服務帳戶名稱和描述
4. 點擊「創建並繼續」

### 步驟 2: 分配角色
1. 添加以下角色：
   - `Storage Admin`（用於上傳和管理文件）
   - `Storage Object Admin`（用於管理對象）
2. 點擊「繼續」然後「完成」

### 步驟 3: 創建金鑰
1. 點擊剛創建的服務帳戶
2. 前往「金鑰」標籤
3. 點擊「新增金鑰」> 「創建新金鑰」
4. 選擇 JSON 格式
5. 下載金鑰文件並保存到安全位置

## 3. 環境變數設置

創建 `.env` 文件並添加以下內容：

```env
# Google Generative AI API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Google Cloud Storage Configuration
GCS_BUCKET_NAME=your_bucket_name
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/service-account-key.json

# PostgreSQL Database Configuration
DATABASE_URL=your_postgresql_connection_string
```

## 4. 解決配額問題

### Gemini API 配額限制
1. **免費層限制**：
   - 每分鐘 15 個請求
   - 每天 1,500 個請求
   - 每分鐘 1 百萬個 tokens

2. **解決方案**：
   - **等待重試**：遇到配額錯誤時等待 1-2 分鐘再重試
   - **升級到付費方案**：前往 Google AI Studio 升級
   - **優化請求頻率**：避免短時間內多次分析同一張圖片

### 應用程式優化
本應用已實現以下優化：

1. **智能重新分析**：
   - 首次上傳時將圖片存儲到 GCS 和資料庫
   - 重新分析時不重複上傳圖片，只調用 AI API
   - 減少不必要的 API 調用

2. **錯誤處理**：
   - 專門處理配額超限錯誤（HTTP 429）
   - 顯示友好的錯誤訊息和建議
   - 自動重試機制

3. **使用建議**：
   - 首次分析：上傳圖片 → 選擇基礎風格 → 開始分析
   - 進階分析：點擊「進階設定」→ 選擇詳細風格 → 開始分析
   - 如遇配額錯誤，等待 1-2 分鐘後重試

## 5. 部署到 Render

### 環境變數設置
在 Render 控制台中設置以下環境變數：

1. `GEMINI_API_KEY`：您的 Gemini API 金鑰
2. `GCS_BUCKET_NAME`：您的 GCS Bucket 名稱
3. `GOOGLE_APPLICATION_CREDENTIALS`：設為 `/etc/secrets/gcs-key.json`
4. `DATABASE_URL`：Render 自動提供的 PostgreSQL 連接字符串

### 服務帳戶金鑰
1. 將服務帳戶 JSON 金鑰內容複製
2. 在 Render 中創建 Secret File：
   - 名稱：`gcs-key.json`
   - 內容：貼上 JSON 金鑰內容
   - 路徑：`/etc/secrets/gcs-key.json`

## 6. 故障排除

### 常見錯誤

1. **「配額已超出」錯誤**：
   - 等待 1-2 分鐘後重試
   - 檢查 Google AI Studio 中的配額使用情況
   - 考慮升級到付費方案

2. **GCS 上傳失敗**：
   - 檢查服務帳戶權限
   - 確認 Bucket 名稱正確
   - 驗證金鑰文件路徑

3. **圖片無法顯示**：
   - 確認 Bucket 設置為公開讀取
   - 檢查圖片 URL 格式
   - 驗證 CORS 設置

### 檢查配額使用情況
1. 前往 [Google AI Studio](https://aistudio.google.com/)
2. 查看 API 使用情況和限制
3. 監控每日和每分鐘的請求數量

## 7. 安全注意事項

1. **保護服務帳戶金鑰**：
   - 不要將金鑰文件提交到版本控制
   - 使用環境變數或 Secret 管理
   - 定期輪換金鑰

2. **Bucket 安全**：
   - 只給予必要的權限
   - 考慮設置生命週期政策自動刪除舊文件
   - 監控存儲使用量和成本

3. **API 金鑰安全**：
   - 限制 API 金鑰的使用範圍
   - 定期檢查和更新金鑰
   - 監控 API 使用情況