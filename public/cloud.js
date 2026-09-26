// 跨裝置存檔：把這台裝置上的遊戲進度存到伺服器，用暱稱＋4 碼密碼保護
(function () {
  const $ = (id) => document.getElementById(id);
  const C = () => window.MJClient;
  const REMEMBER = 'mj16_cloud';
  const SKIP = ['mj16_pid', REMEMBER];
  const online = () => !window.NO_SOCKET;

  function collect() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('mj16_') && !SKIP.includes(k)) data[k] = localStorage.getItem(k);
      }
    } catch (e) { }
    return { v: 1, savedAt: new Date().toISOString(), keys: data };
  }
  function restore(d) {
    try {
      const keep = {}; for (const k of SKIP) { const v = localStorage.getItem(k); if (v != null) keep[k] = v; }
      const rm = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('mj16_') && !SKIP.includes(k)) rm.push(k); }
      rm.forEach(k => localStorage.removeItem(k));
      for (const [k, v] of Object.entries(d.keys || {})) localStorage.setItem(k, v);
      return true;
    } catch (e) { return false; }
  }
  async function call(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json().catch(() => ({ ok: false, msg: '伺服器沒有回應' }));
  }
  function remembered() { try { return JSON.parse(localStorage.getItem(REMEMBER) || 'null'); } catch (e) { return null; } }

  function open() {
    if (!online()) { C().notice('單機試玩版沒有伺服器，不能跨裝置存檔。請用連線版的網址開遊戲再存檔。'); return; }
    const rem = remembered();
    const name = (rem && rem.name) || ($('nameInput').value.trim());
    const box = document.createElement('div');
    box.className = 'overlay dlg';
    box.innerHTML = `<div class="res cloud">
      <h3>存檔／讀取進度</h3>
      <p class="sub">存檔會把這台裝置上的所有進度（天賦、裝備、卡牌、冒險、人物、設定）存到伺服器。換手機或電腦時，用同一個暱稱和密碼就能讀回來。</p>
      <label>暱稱<input id="clName" maxlength="10" value="${C().esc(name)}" placeholder="你的暱稱"></label>
      <label>密碼（4 位數字）<input id="clPin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="例如生日 9 月 23 日：0923" value="${rem && rem.pin ? rem.pin : ''}"></label>
      <p class="cl-hint">建議用自己的生日（月＋日 4 碼）當密碼。第一次存檔時設定的密碼，之後存檔和讀取都要輸入同一組。</p>
      <label class="cl-rem"><input type="checkbox" id="clRem" ${rem ? 'checked' : ''}>記住這台裝置，冒險結束和離開養成畫面時自動存檔</label>
      <p class="cl-msg" id="clMsg"></p>
      <div class="cl-btns"><button class="btn gold" id="clSave">存檔</button><button class="btn" id="clLoad">讀取進度</button><button class="btn ghost" id="clX">關閉</button></div>
    </div>`;
    document.getElementById('app').appendChild(box);
    const msg = (t, ok) => { const m = box.querySelector('#clMsg'); m.textContent = t; m.className = 'cl-msg ' + (ok ? 'ok' : 'bad'); };
    const get = () => ({ name: box.querySelector('#clName').value.trim(), pin: box.querySelector('#clPin').value.trim() });
    const valid = (v) => { if (!v.name) { msg('請輸入暱稱'); return false; } if (!/^\d{4}$/.test(v.pin)) { msg('密碼要是 4 位數字'); return false; } return true; };
    const rememberIf = (v) => { try { if (box.querySelector('#clRem').checked) localStorage.setItem(REMEMBER, JSON.stringify(v)); else localStorage.removeItem(REMEMBER); } catch (e) { } };
    box.querySelector('#clX').onclick = () => box.remove();
    box.querySelector('#clSave').onclick = async () => {
      const v = get(); if (!valid(v)) return;
      msg('存檔中…', true);
      const r = await call('api/save', Object.assign({}, v, { data: collect() }));
      if (!r.ok) return msg(r.msg || '存檔失敗');
      rememberIf(v);
      try { localStorage.setItem('mj16_name', v.name); } catch (e) { }
      msg(r.created ? '存檔成功！已建立新的存檔。請記住暱稱和密碼。' : '存檔成功！', true);
      C().playSound('bell');
    };
    box.querySelector('#clLoad').onclick = async () => {
      const v = get(); if (!valid(v)) return;
      msg('讀取中…', true);
      const r = await call('api/load', v);
      if (!r.ok) return msg(r.msg || '讀取失敗');
      const when = r.data && r.data.savedAt ? new Date(r.data.savedAt).toLocaleString('zh-TW') : '';
      C().dialog(`找到 ${C().esc(v.name)} 的存檔${when ? `（存於 ${when}）` : ''}。讀取後，這台裝置目前的進度會被取代，確定嗎？`, [
        ['讀取並進入遊戲', () => { if (restore(r.data)) { rememberIf(v); location.reload(); } else msg('這台裝置無法寫入進度'); }],
        ['取消', null],
      ]);
    };
  }

  // 自動存檔（有勾「記住這台裝置」才會）
  let timer = null;
  function autoSave() {
    const rem = remembered();
    if (!rem || !online()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { call('api/save', Object.assign({}, rem, { data: collect() })).then(r => { if (r && r.ok && C()) C().toastSmall('已自動存檔'); }); }, 800);
  }

  window.MJCloud = { open, autoSave };
})();
