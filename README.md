# APCS Code Judge — Serverless Edition

> 一個專案、四種語言、300 道題目、71 章互動式基礎教學，即時瀏覽器評分、附解題思路。
>
> One project, four languages, 300 problems, 71 interactive tutorial chapters, in-browser instant grading, with solution hints.

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase)](https://firebase.google.com/)
[![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-black?logo=github)](https://pages.github.com/)

---

## 📖 目錄

- [專案簡介](#-專案簡介)
- [功能特色](#-功能特色)
- [技術架構](#️-技術架構)
- [快速開始](#-快速開始)
- [專案結構](#-專案結構)
- [部署指南](#-部署指南)
- [致謝](#-致謝)

---

## 📌 專案簡介

本專案是基於 [Yu-0312/apcs-judge](https://github.com/Yu-0312/apcs-judge) 進行深度改造的 APCS 線上評測系統。核心目標是在**保留原專案完整功能**的前提下，將資料層全面升級為 **Firebase Firestore**，讓系統達到真正的「無伺服器 (Serverless)」架構，老師可以直接在線上即時管理題庫，無需任何後端部署。

支援語言：**Python · C++ · C · Java**

---

## ✨ 功能特色

### 學生端

| 功能 | 說明 |
|------|------|
| 📝 題庫練習 | 支援 Python / C++ / C / Java 四種語言，按難度與分類篩選 |
| ⚡ 即時評測 | Python 使用 Pyodide (WebAssembly)，其餘語言使用 Judge0 CE 雲端評測 |
| 📚 互動教學 | 71 章系統化基礎教學，含範例程式碼、小測驗與程式碼挑戰 |
| 💡 解題思路 | 每題提供思路提示，避免直接看答案 |
| 📋 一鍵複製 | 編輯器工具列支援一鍵複製程式碼 |
| 🔡 字體縮放 | 題目內容與程式碼編輯器可獨立調整字體大小 |
| 💾 自動存檔 | 程式碼透過 Debounced 機制自動快取至 LocalStorage，意外關閉也不遺失 |
| 🔗 URL 跳轉 | 支援 Hash 路由直達指定題目，並記憶上次練習進度 |

### 教師後台（`admin.html`）

| 功能 | 說明 |
|------|------|
| 🔒 身分驗證 | Firebase Authentication 保護後台，防止未授權存取 |
| ✏️ 題目管理 | 線上新增、編輯、刪除題目，即時同步至 Firestore |
| 📂 分類管理 | 自訂主分類 > 子分類的多層樹狀結構 |
| 📊 解答管理 | 為各語言版本分別管理參考解答 |

---

## 🛠️ 技術架構

```
前端 (Vanilla HTML / CSS / ES Modules)
├── 程式碼編輯器  — CodeMirror 5 (含語法高亮、自動補全)
├── Markdown 渲染 — marked.js
├── Python 執行   — Pyodide 0.26.4 (WebAssembly)
└── C/C++/Java 執行 — Judge0 CE (雲端 API)

後端 / 資料層 (Serverless)
├── 資料庫       — Firebase Firestore
└── 身分驗證     — Firebase Authentication (Email/Password)
```

### 資料讀取最佳化

採用 **Meta 總表 + Details 詳情** 分離設計：

- 載入題庫列表：**1 次 Read**（無論題庫有幾百題）
- 點開題目才拉取詳情：**按需讀取**
- 已讀過的題目與解答：**LocalStorage 快取，二次訪問零 Read**

---

## 🚀 快速開始

### 本地開發

```bash
# 安裝依賴
npm install

# 啟動本地伺服器（nodemon，含自動重載）
npm run dev
```

伺服器啟動後開啟 `http://localhost:3000`。

### 前提條件

- Node.js 18+（僅用於本地開發，部署至靜態平台不需要）
- Firebase 專案（Firestore + Authentication）

---

## 📁 專案結構

```
apcs-judge/
├── index.html          # 學生前台（題庫 + 評測）
├── tutorial.html       # 互動式基礎教學（71 章）
├── admin.html          # 教師後台（題庫管理）
├── migrate.html        # 資料遷移工具
├── css/
│   └── style.css       # 全域樣式
├── js/
│   ├── app.js          # 前台核心邏輯
│   ├── db.js           # Firebase 資料存取層
│   └── firebase-config.js  # Firebase 設定（需替換為自己的金鑰）
├── data/               # 靜態題庫資料（歷史備份）
└── server.js           # 本地開發伺服器（Express）
```

---

## 📦 部署指南

本專案完全 Serverless，可部署至任何靜態平台（GitHub Pages、Vercel、Netlify）。

### 步驟一：建立 Firebase 專案

1. 前往 [Firebase Console](https://console.firebase.google.com/) 建立新專案。
2. 啟用 **Firestore Database**（生產模式）。
3. 啟用 **Authentication**，並選擇「電子郵件/密碼」登入方式。
4. 在 Authentication 面板手動建立一組管理員帳號。

### 步驟二：填入金鑰

將 `js/firebase-config.js` 中的 `firebaseConfig` 替換為您自己的專案設定：

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  // ...
};
```

### 步驟三：設定 Firestore 安全性規則

前往 Firestore > Rules，貼上以下規則：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;                    // 所有人可讀（公開題庫）
      allow write: if request.auth != null;   // 僅登入管理員可寫
    }
  }
}
```

### 步驟四：部署

將整個專案推送至 GitHub，並在 Repository Settings 中開啟 **GitHub Pages**。

| 頁面 | 網址 |
|------|------|
| 學生前台 | `https://<帳號>.github.io/<專案名>/` |
| 互動教學 | `https://<帳號>.github.io/<專案名>/tutorial.html` |
| 教師後台 | `https://<帳號>.github.io/<專案名>/admin.html` |

---

## 🙏 致謝

本專案的核心介面、程式碼評測架構與豐富題庫，皆源自 **[Yu-0312](https://github.com/Yu-0312)** 所開發的開源專案：

> **[Yu-0312/apcs-judge](https://github.com/Yu-0312/apcs-judge)**

原專案將 Pyodide、Judge0 與 CodeMirror 整合得十分完美，為前端的程式碼線上評測提供了極佳的體驗。本專案站在這個優秀基底上，補足了雲端動態資料管理的最後一哩路。

如果你喜歡這個專案，請也去原作者的 Repository 點個 ⭐ Star！
