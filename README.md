# AI 面像分析器 🔍

這是一個使用 Google Gemini Vision API 的專業面相分析網站，可以讓使用者上傳人像照片，然後由 AI 進行專業的面部特徵分析和性格特質解讀。

## ✨ 功能特色

*   **人像照片上傳**：使用者可以上傳 JPG, JPEG, PNG 格式的人像照片。
*   **AI 面相分析**：使用 Google Gemini Vision API 對上傳的人像進行專業的面部特徵分析。
*   **性格特質解讀**：根據面部特徵分析可能的性格特質和個人特色。
*   **即時預覽**：上傳照片後可立即預覽。
*   **專業分析報告**：清晰展示 AI 的面相分析結果和建議。
*   **現代化 UI/UX**：專業、清新且響應式的介面設計。
*   **雲端儲存**：上傳的照片會安全儲存在 AWS S3 雲端服務中。

## 🛠️ 技術棧

*   **後端**：Node.js, Express.js
*   **前端**：HTML, CSS, JavaScript (Vanilla JS)
*   **圖片處理**：Multer (用於上傳)
*   **AI 模型**：Google Gemini API (gemini-2.0-flash 或更新模型用於視覺理解與面相分析)
*   **雲端儲存**：AWS S3 用於安全儲存上傳的人像照片
*   **環境變數管理**：dotenv
*   **套件管理**：npm

## 🚀 安裝與啟動

1.  **複製專案**：
    ```bash
    git clone <your-repository-url>
    cd <project-directory>
    ```

2.  **安裝依賴**：
    ```bash
    npm install
    ```

3.  **設定環境變數**：
    *   複製 `.env.example` 並重新命名為 `.env`。
        ```bash
        # Windows
        copy .env.example .env
        # macOS / Linux
        cp .env.example .env
        ```
    *   在 `.env` 檔案中填入您的 Google Gemini API Key 和 AWS 相關設定：
        ```env
        GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"
        AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID"
        AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_ACCESS_KEY"
        AWS_S3_BUCKET_NAME="YOUR_S3_BUCKET_NAME"
        AWS_S3_REGION="YOUR_AWS_REGION"
        ```
        ```env
        # TEXT_TO_IMAGE_API_KEY="YOUR_TEXT_TO_IMAGE_API_KEY_HERE"
        ```

4.  **啟動伺服器**：
    ```bash
    npm start
    ```

5.  在瀏覽器中開啟 `http://localhost:3000` (或您設定的 PORT)。

## 🤖 AI 面相分析 Prompt 參考 (Gemini Vision)

```text
請用不超過 150 字進行專業的面像分析，包括：1.面部特徵描述 2.可能的性格特質 3.個人魅力點 4.建議的發展方向。語氣要專業但親切，給予正面積極的分析。
```

## 📝 注意事項

*   本專案僅為娛樂和學習目的，面相分析結果僅供參考，不應作為任何重要決策的依據。
*   AI 生成的分析內容基於面部特徵的統計學習，可能存在偏差，請以開放心態看待。

## 💡 未來可擴展方向

*   支援更多圖片格式和批量分析。
*   允許使用者自訂分析的詳細程度或專業領域。
*   整合更多面相學理論和心理學模型。
*   加入使用者帳號系統，保存分析歷史紀錄。
*   提供更詳細的面部特徵測量和比例分析。
*   將圖片儲存到雲端儲存服務 (如 AWS S3, Google Cloud Storage)。

希望您玩得開心！🎉
