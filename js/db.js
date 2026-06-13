import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const CACHE_PREFIX = 'apcs_judge_';

// 快取小幫手
function getCache(key) {
  try {
    const data = localStorage.getItem(CACHE_PREFIX + key);
    return data ? JSON.parse(data) : null;
  } catch(e) { return null; }
}

function setCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch(e) {}
}

export const dbService = {
  /** 監聽登入狀態 */
  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  },

  /** 登入 */
  async login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  },

  /** 登出 */
  async logout() {
    return signOut(auth);
  },

  /**
   * 取得總表 (Meta)
   * 每次網頁重新載入時抓取 1 次，更新 LocalStorage，之後可供快速渲染。
   * (消耗 1 次 Read)
   */
  async getMeta(forceRefresh = true) {
    if (!forceRefresh) {
      const cached = getCache('meta');
      if (cached) return cached;
    }
    
    try {
      const docRef = doc(db, 'system', 'meta');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCache('meta', data);
        return data;
      }
      return { categories: [], problemsList: [] };
    } catch(err) {
      console.error("Error fetching meta:", err);
      // 網路不通時退回快取
      return getCache('meta') || { categories: [], problemsList: [] };
    }
  },

  /** 儲存總表 */
  async saveMeta(categories, problemsList) {
    const data = { categories, problemsList, lastUpdated: Date.now() };
    const docRef = doc(db, 'system', 'meta');
    await setDoc(docRef, data);
    setCache('meta', data);
  },

  /** 取得系統設定 (如解答密碼) */
  async getConfig(forceRefresh = true) {
    if (!forceRefresh) {
      const cached = getCache('config');
      if (cached) return cached;
    }
    try {
      const docRef = doc(db, 'system', 'config');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCache('config', data);
        return data;
      }
      return {};
    } catch(err) {
      return getCache('config') || {};
    }
  },

  /** 儲存系統設定 */
  async saveConfig(data) {
    const docRef = doc(db, 'system', 'config');
    await setDoc(docRef, data, { merge: true });
    const current = await this.getConfig(false);
    setCache('config', { ...current, ...data });
  },

  /** 
   * 取得題目詳細資料
   * 優先讀快取，快取沒有才去抓遠端 (極大節省 Reads)
   */
  async getProblemDetails(id, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCache('prob_' + id);
      if (cached) return cached;
    }
    
    try {
      const docRef = doc(db, 'problems', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCache('prob_' + id, data);
        return data;
      }
      return null;
    } catch(err) {
      console.error("Error fetching problem details:", err);
      return getCache('prob_' + id);
    }
  },

  /** 儲存題目詳細資料 */
  async saveProblemDetails(id, details) {
    const docRef = doc(db, 'problems', id);
    await setDoc(docRef, details);
    setCache('prob_' + id, details);
  },

  /** 取得解答 (快取優先) */
  async getSolutions(id, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCache('sol_' + id);
      if (cached) return cached;
    }
    try {
      const docRef = doc(db, 'solutions', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCache('sol_' + id, data);
        return data;
      }
      return null;
    } catch(err) {
      console.error("Error fetching solutions:", err);
      return getCache('sol_' + id);
    }
  },

  /** 儲存解答 */
  async saveSolutions(id, solutions) {
    const docRef = doc(db, 'solutions', id);
    await setDoc(docRef, solutions);
    setCache('sol_' + id, solutions);
  },
  
  /** 刪除題目 */
  async deleteProblem(id) {
    await deleteDoc(doc(db, 'problems', id));
    await deleteDoc(doc(db, 'solutions', id));
    localStorage.removeItem(CACHE_PREFIX + 'prob_' + id);
    localStorage.removeItem(CACHE_PREFIX + 'sol_' + id);
  }
};
