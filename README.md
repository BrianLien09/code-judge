# Code Judge (Serverless Edition)

> 基於 Firebase Firestore 重構的線上解題與管理系統，完美支援 GitHub Pages 部署。
> **特別感謝原作者 [Yu-0312](https://github.com/Yu-0312) 開發的 [apcs-judge](https://github.com/Yu-0312/apcs-judge) 專案！本專案的核心介面、編譯架構與豐富的題庫皆來自於原作者的無私開源。**

---

## 🌟 專案特色與魔改亮點

本專案由原始的靜態 JSON/JS 資料結構進行了深度重構，加入了完整的**無伺服器 (Serverless)** 資料庫與權限管理，讓老師或管理者能夠直接在線上安全地新增、修改題目，且完全無需維護後端伺服器。

### 與原專案的差異功能：
1. ☁️ **Firebase Firestore 雲端資料庫**
   - 捨棄了原本寫死在 `data/*.js` 裡面的靜態題目庫，改為即時連線的 Firestore。
   - **極限省錢架構**：採用 `Meta 總表` 與 `Details 詳情` 分離的設計。學生進入網站時，無論題庫有幾百題，都只需消耗 **1 次資料庫讀取 (Read)** 來載入目錄。
2. ⚡ **智慧快取與記憶機制**
   - **零浪費題庫快取**：點開過的題目與解答，會自動緩存於瀏覽器 LocalStorage。二次訪問時達到零延遲、零流量浪費。
   - **程式碼即時防護**：加入防抖 (Debounced) 的程式碼自動快取，即使意外關閉網頁也能無縫接軌。
   - **跳轉與狀態記憶**：支援 URL Hash 跳轉直達題目，且重新載入時會自動開啟最後練習的題目。
3. 🔒 **Firebase Authentication 登入鎖定**
   - 後台管理介面 (`admin.html`) 加上了嚴密的 Email/Password 身分驗證。
   - 結合 Firestore Security Rules，只有登入的管理員能修改題目，阻絕外人惡意竄改，讓後台可以直接暴露在公網上。
4. 📂 **多層次樹狀分類系統**
   - 打破了原本只能用「難度」分類的限制，新增了自訂的**主分類 > 子分類**系統。
   - 您可以自由建立「資料結構」、「演算法」等章節，並將題目歸入特定的子分類中，原有的「難度（⭐）」屬性依然獨立保留。
5. 🎨 **使用者體驗 (UX) 大幅升級**
   - **精準 Diff 對照**：在評測結果加入逐行高亮對照與「隱藏空白可視化 (·)」，幫助學生一眼抓出 WA (Wrong Answer) 的元兇。
   - **完整的編輯體驗**：整合 CodeMirror 的 Auto-complete 與程式碼自動提示，並修復 onclick 綁定問題。
   - **靈活排版**：可調整字體大小，且評測結果面板可一鍵展開收合，讓程式碼編輯區域最大化。
   - **一鍵複製程式碼**：在編輯器工具列加入一鍵複製按鈕，方便快速複製撰寫的程式碼。

---

## 🚀 部署與使用方式

因為本專案已經完全 Serverless 化，您**不需要 Node.js** 就可以將它部署到任何靜態網站代管平台（例如 GitHub Pages、Vercel、Netlify）。

### 1. 建立您的 Firebase 專案
1. 到 Firebase Console 建立一個專案。
2. 啟用 **Firestore Database** 與 **Authentication (Email/Password)**。
3. 在 Authentication 面板手動為自己建立一組管理員帳號。

### 2. 設定專案金鑰
打開原始碼中的 `js/firebase-config.js`，將 `firebaseConfig` 替換為您自己專案的設定。

### 3. 設定安全性規則 (Security Rules)
前往 Firestore 的 Rules 標籤，貼上以下規則以確保您的題庫安全：
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true; // 所有人都能看題目
      allow write: if request.auth != null; // 只有登入的管理員能改題目
    }
  }
}
```

### 4. 部署
將整個專案資料夾 Push 到 GitHub 並開啟 GitHub Pages 功能。
- **學生前台**：`https://您的帳號.github.io/專案名稱/`
- **教師後台**：`https://您的帳號.github.io/專案名稱/admin.html`

---

## 🛠️ 技術架構

- **前端框架**：Vanilla HTML / CSS / JS (ES Modules)
- **資料庫**：Firebase Firestore (Cloud NoSQL)
- **身分驗證**：Firebase Authentication
- **程式碼執行**：Pyodide (WebAssembly 執行 Python) / Judge0 CE (雲端執行 C/C++/Java)

---

## 🙏 致謝

再次感謝 [Yu-0312/apcs-judge](https://github.com/Yu-0312/apcs-judge) 提供如此優秀的開源基底。原專案將 Pyodide、Judge0 與 CodeMirror 整合得十分完美，為前端的程式碼線上評測帶來了極佳的體驗。本專案站在巨人的肩膀上，補足了「動態資料管理」與「線上編輯題目」的最後一哩路。

如果您喜歡這個架構，請不要忘記去原作者的專案點個 ⭐ Star！
