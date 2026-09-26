// 養成畫面：天賦樹、裝備
(function () {
  const M = window.MJMeta;
  const $ = (id) => document.getElementById(id);
  const C = () => window.MJClient;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let tab = 'tree', selNode = null, selItem = null, invFilter = 'all';

  function open(t) { tab = t || tab; $('metaScreen').classList.remove('hidden'); render(); }
  function close() { $('metaScreen').classList.add('hidden'); if (window.MJCloud) MJCloud.autoSave(); if (window.MJClient && C().refreshAdvBtn) C().refreshAdvBtn(); }

  function header(m) {
    const pts = M.earned(m), used = M.spent(m);
    return `<div class="mt-head">
      <div class="mt-tabs"><button class="${tab === 'tree' ? 'on' : ''}" data-tab="tree">天賦樹</button><button class="${tab === 'gear' ? 'on' : ''}" data-tab="gear">裝備</button><button class="${tab === 'cards' ? 'on' : ''}" data-tab="cards">卡牌</button></div>
      <div class="mt-res">
        <span title="冒險結束時依表現得到">死亡積分 <b>${m.soulTotal}</b></span>
        <span title="每 ${M.SOUL_PER_POINT} 死亡積分換 1 點，上限 ${M.TALENT_CAP}">天賦點 <b>${pts - used}</b>／${pts}</span>
        <span>錢包 <b>${m.wallet}</b></span><span>強化石 <b>${m.stones}</b></span><span>洗練石 <b>${m.refine}</b></span><span>護符 <b>${m.charms}</b></span>
      </div>
      <button class="btn small ghost" id="mtClose">關閉</button></div>`;
  }

  function render() {
    const m = M.load();
    const el = $('metaScreen');
    el.innerHTML = `<div class="mt-in">${header(m)}<div class="mt-body">${tab === 'tree' ? treeHTML(m) : tab === 'gear' ? gearHTML(m) : cardsHTML(m)}</div></div>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    $('mtClose').onclick = close;
    if (tab === 'tree') bindTree(m); else if (tab === 'gear') bindGear(m); else bindCards(m);
  }

  // ================= 天賦樹 =================
  function nodeState(m, n) {
    if (m.talents[n.id]) return 'done';
    if (M.reqStatus(m, n).ok) return M.earned(m) - M.spent(m) >= n.cost ? 'can' : 'nopt';
    return 'lock';
  }
  const STATE_TXT = { done: '已點亮', can: '可以點', nopt: '點數不夠', lock: '還沒解鎖' };
  function treeHTML(m) {
    const total = M.NODES.length, doneN = M.NODES.filter(n => m.talents[n.id]).length;
    const maxPts = M.NODES.reduce((s, n) => s + n.cost, 0);
    const pct = Math.round(M.spent(m) / maxPts * 100);
    const ring = (p, c) => `<svg viewBox="0 0 36 36" class="ring" role="img" aria-label="完成度 ${p}%"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4"/>
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="${p * 0.974} 100" stroke-linecap="round" transform="rotate(-90 18 18)"/><text x="18" y="21.5" text-anchor="middle">${p}%</text></svg>`;
    let html = `<div class="tt-top">${ring(pct, '#f0c35a')}<div><div class="tt-title">天賦完成度 ${pct}%</div>
      <div class="tt-sub">已點亮 ${doneN}／${total} 個節點・投入 ${M.spent(m)}／${maxPts} 點・天賦點上限 ${M.TALENT_CAP}（全部點滿需要 ${maxPts} 點，所以要取捨）</div></div></div>
      <details class="tt-help"><summary>天賦樹怎麼用？（點開看說明）</summary><ul>
        <li><b>天賦點怎麼來</b>：冒險模式結束時（破關或倒下都算）會依表現得到「死亡積分」，每累積 ${M.SOUL_PER_POINT} 分換 1 點天賦點，最多 ${M.TALENT_CAP} 點。</li>
        <li><b>怎麼點</b>：點一個節點看詳細說明，條件符合就按「點亮」。第 1～3 層每個 1 點，第 4 層終極節點 3 點。</li>
        <li><b>前置條件</b>：實線箭頭代表一定要先點；虛線代表兩個只要點過其中一個。</li>
        <li><b>終極門檻</b>：第 4 層要同時點過兩個前置，而且這一系已經投入滿 6 點。</li>
        <li><b>在哪裡生效</b>：單人模式和冒險模式。連線對戰為了公平，不會生效。</li>
        <li><b>重新分配</b>：花 200 錢包金幣，可以把天賦點全部退回重點。</li>
      </ul></details><div class="tt-branches">`;
    for (const [b, info] of Object.entries(M.BRANCH)) {
      const nodes = M.NODES.filter(n => n.b === b);
      const bs = M.branchSpent(m, b), bd = nodes.filter(n => m.talents[n.id]).length;
      const bpct = Math.round(bs / 9 * 100);
      html += `<section class="tb" style="--bc:${info.color}"><div class="tb-h"><b>${info.name}</b><em>${info.role}</em></div>
        <p class="tb-d">${info.desc}</p>
        <div class="tb-prog"><i style="width:${bpct}%"></i></div><div class="tb-pt">完成度 ${bpct}%・節點 ${bd}／7・投入 ${bs}／9 點${bs >= 6 ? '・終極門檻已達成' : `・還差 ${6 - bs} 點開終極`}</div>
        <div class="tb-grid" data-b="${b}"><svg class="tb-lines"></svg>`;
      for (const n of nodes) {
        const s = nodeState(m, n);
        html += `<button class="tn st-${s} ${selNode === n.id ? 'sel' : ''} ${n.tier === 4 ? 'ult' : ''}" data-id="${n.id}" style="grid-row:${n.tier};grid-column:${n.side === 'L' ? 1 : n.side === 'R' ? 2 : '1 / span 2'}">
          <span class="tn-id">${n.id}・${n.cost}點</span><b>${n.name}</b><span class="tn-s">${n.short}</span><span class="tn-st">${STATE_TXT[s]}</span></button>`;
      }
      html += `</div></section>`;
    }
    html += `</div><div class="tt-detail" id="ttDetail">${detailHTML(m)}</div>
      <button class="btn small ghost" id="ttReset">重新分配天賦（200 錢包金幣）</button>`;
    return html;
  }
  function detailHTML(m) {
    if (!selNode) return '<p class="hint">點一個天賦節點，這裡會顯示詳細功能說明和前置條件。</p>';
    const n = M.NODE[selNode], s = nodeState(m, n), rs = M.reqStatus(m, n);
    const reqs = rs.parts.map(p => `<li class="${p.ok ? 'ok' : ''}">${p.ok ? '✔' : '✘'} ${p.alts.map(a => `${a} ${M.NODE[a].name}`).join(' 或 ')}</li>`).join('');
    const gate = n.tier === 4 ? `<li class="${rs.gate ? 'ok' : ''}">${rs.gate ? '✔' : '✘'} ${M.BRANCH[n.b].name}系已投入 6 點（目前 ${M.branchSpent(m, n.b)} 點）</li>` : '';
    return `<div class="td-h" style="--bc:${M.BRANCH[n.b].color}"><b>${n.name}</b><em>${M.BRANCH[n.b].name}系・第 ${n.tier} 層・${n.cost} 點</em></div>
      <p class="td-desc">${n.desc}</p>
      <div class="td-req"><b>前置條件</b><ul>${reqs || '<li class="ok">✔ 沒有前置，直接可以點</li>'}${gate}</ul></div>
      ${s === 'done' ? '<p class="td-ok">已點亮，正在生效中</p>' : `<button class="btn gold" id="ttLearn" ${s === 'can' ? '' : 'disabled'}>${s === 'can' ? `點亮（花 ${n.cost} 點）` : s === 'nopt' ? `天賦點不夠（要 ${n.cost} 點）` : '前置條件還沒達成'}</button>`}`;
  }
  function bindTree(m) {
    document.querySelectorAll('.tn').forEach(b => b.onclick = () => { selNode = b.dataset.id; C().playSound('tick'); render(); });
    const L = $('ttLearn'); if (L) L.onclick = () => { if (M.ops.learn(selNode)) { C().playSound('stamp'); C().toastSmall(`點亮了「${M.NODE[selNode].name}」`); } render(); };
    $('ttReset').onclick = () => C().dialog('花 200 錢包金幣，把所有天賦點退回來重新分配？', [['重新分配', () => { if (!M.ops.resetTalents()) C().notice('錢包金幣不夠 200'); render(); }], ['取消', null]]);
    requestAnimationFrame(drawLines);
  }
  function drawLines() {
    document.querySelectorAll('.tb-grid').forEach(grid => {
      const svg = grid.querySelector('.tb-lines');
      const gr = grid.getBoundingClientRect();
      let out = '';
      for (const n of M.NODES.filter(x => x.b === grid.dataset.b)) {
        const to = grid.querySelector(`[data-id="${n.id}"]`).getBoundingClientRect();
        for (const r of n.req) {
          const alts = r.split('|');
          for (const a of alts) {
            const fr = grid.querySelector(`[data-id="${a}"]`).getBoundingClientRect();
            const lit = M.data.talents[a] ? ' lit' : '';
            out += `<line class="${alts.length > 1 ? 'or' : ''}${lit}" x1="${fr.left + fr.width / 2 - gr.left}" y1="${fr.bottom - gr.top}" x2="${to.left + to.width / 2 - gr.left}" y2="${to.top - gr.top}"/>`;
          }
        }
      }
      svg.setAttribute('width', gr.width); svg.setAttribute('height', gr.height);
      svg.innerHTML = out;
    });
  }
  window.addEventListener('resize', () => { if (!$('metaScreen').classList.contains('hidden') && tab === 'tree') drawLines(); });

  // ================= 裝備 =================
  const itemName = (it) => `<span style="color:${M.RARITY[it.r].color}">${esc(it.name)}${it.lv ? ` +${it.lv}` : ''}</span>`;
  function itemCard(it, m, small) {
    const main = M.MAIN[M.SLOT[it.slot].main];
    const eq = Object.values(m.eq).includes(it.uid);
    return `<button class="gi ${selItem === it.uid ? 'sel' : ''}" data-uid="${it.uid}" style="--rc:${M.RARITY[it.r].color}">
      <b>${itemName(it)}</b><span>${M.SLOT[it.slot].name}・${M.RARITY[it.r].name}${it.set ? `・${M.SETS[it.set].name}套` : ''}${eq ? '・裝備中' : ''}</span>
      ${small ? '' : `<small>${main.name} ${main.fmt(M.mainVal(it))}</small>`}</button>`;
  }
  function gearHTML(m) {
    const eqItems = M.equipped(m);
    const sc = M.setCounts(m);
    const b = M.bonus(m);
    let html = `<details class="tt-help"><summary>裝備怎麼用？（點開看說明）</summary><ul>
      <li><b>取得</b>：冒險模式過關會掉裝備；精英關必掉、魔王掉兩件。倉庫最多 60 件，滿了會自動分解成強化石。</li>
      <li><b>六個格子</b>：每格有自己的主屬性，強化等級越高主屬性越強。稀有度越高，副詞條越多。</li>
      <li><b>套裝</b>：史詩、傳說裝備屬於某個套裝，同一套穿 2、4、6 件會觸發效果。傳說裝備另有專屬特效。</li>
      <li><b>強化</b>：花錢包金幣和強化石，+1 到 +10。+6 以前失敗不掉級；+7 以後失敗會掉一級，勾選護符就不掉。+5、+10 各多一條副詞條。</li>
      <li><b>洗練</b>：花洗練石重骰副詞條，可以鎖住想留的；洗完兩組並排讓你選，不怕洗壞。</li>
      <li><b>分解</b>：不要的裝備換成強化石。</li>
      <li><b>在哪裡生效</b>：單人模式和冒險模式。連線對戰不生效。</li></ul></details>
      <div class="g-top"><div class="g-slots">`;
    for (const s of M.SLOTS) {
      const it = eqItems.find(i => i.slot === s.id);
      html += `<div class="gs"><em>${s.name}</em>${it ? itemCard(it, m, true) : '<span class="empty">空</span>'}</div>`;
    }
    html += `</div><div class="g-sum"><b>目前加成</b><ul>
      ${Object.entries(M.MAIN).map(([k, v]) => b[k] ? `<li>${v.name} ${v.fmt(b[k])}</li>` : '').join('')}
      ${b.startQi ? `<li>開局氣 +${b.startQi}</li>` : ''}${b.zimo ? `<li>自摸 +${b.zimo} 台</li>` : ''}${b.flower ? `<li>花牌每張 +${b.flower} 台</li>` : ''}
      ${b.skill ? `<li>技能 -${b.skill} 氣</li>` : ''}${b.swap ? `<li>局前免費換牌 +${b.swap}</li>` : ''}${b.gold ? `<li>冒險金幣 +${b.gold}%</li>` : ''}${b.shield ? `<li>開局防護罩 ${b.shield}%</li>` : ''}
      </ul><b>套裝</b><ul>${Object.keys(M.SETS).map(id => { const n = sc[id] || 0; if (!n) return ''; const S = M.SETS[id];
        return `<li><b>${S.name}套 ${n}／6</b><span class="${n >= 2 ? 'on' : ''}">2件：${S.b2}</span><span class="${n >= 4 ? 'on' : ''}">4件：${S.b4}</span><span class="${n >= 6 ? 'on' : ''}">6件：${S.b6}</span></li>`; }).join('') || '<li>還沒有穿套裝</li>'}</ul></div></div>
      <div class="g-inv"><div class="g-filter"><button data-f="all" class="${invFilter === 'all' ? 'on' : ''}">全部 ${m.inv.length}</button>${M.SLOTS.map(s => `<button data-f="${s.id}" class="${invFilter === s.id ? 'on' : ''}">${s.name}</button>`).join('')}</div>
      <div class="g-list">${m.inv.filter(i => invFilter === 'all' || i.slot === invFilter).sort((a, c) => c.r - a.r || c.lv - a.lv).map(it => itemCard(it, m)).join('') || '<p class="hint">倉庫是空的，去冒險模式打裝備吧！</p>'}</div></div>
      <div class="g-detail" id="gDetail">${itemDetail(m)}</div>`;
    return html;
  }
  function itemDetail(m) {
    const it = m.inv.find(i => i.uid === selItem);
    if (!it) return '<p class="hint">點一件裝備看詳細資料、強化、洗練。</p>';
    const main = M.MAIN[M.SLOT[it.slot].main];
    const eq = m.eq[it.slot] === it.uid;
    const nxt = it.lv < 10 ? M.ENH[it.lv + 1] : null;
    const S = it.set ? M.SETS[it.set] : null;
    return `<div class="gd-h" style="--rc:${M.RARITY[it.r].color}"><b>${itemName(it)}</b><em>${M.SLOT[it.slot].name}・${M.RARITY[it.r].name}</em></div>
      <p>主屬性：${main.name} <b>${main.fmt(M.mainVal(it))}</b>${nxt ? `（強化到 +${it.lv + 1} 變成 ${main.fmt(M.MAIN[M.SLOT[it.slot].main].base * (1 + 0.1 * (it.lv + 1)) * (1 + it.r * 0.25))}）` : ''}</p>
      <p>副詞條：</p><ul class="gd-subs">${it.subs.map(s => `<li>${M.SUBS[s].name}</li>`).join('')}</ul>
      ${S ? `<p>套裝：<b>${S.name}</b>（2件：${S.b2}；4件：${S.b4}；6件：${S.b6}）</p>` : ''}
      ${it.legend && it.set ? `<p class="gd-leg">${M.LEGEND_FX[it.set]}</p>` : ''}
      <div class="gd-act">
        ${eq ? `<button class="btn small" id="gUnequip">卸下</button>` : `<button class="btn small gold" id="gEquip">裝備</button>`}
        <button class="btn small" id="gEnh" ${nxt ? '' : 'disabled'}>強化${nxt ? `（成功率 ${nxt[0]}%・${nxt[1]} 金・${M.ENH_STONES(it.lv)} 石）` : '（已滿）'}</button>
        <button class="btn small" id="gRef">洗練</button>
        <button class="btn small ghost" id="gSal" ${eq ? 'disabled' : ''}>分解（得 ${M.RARITY[it.r].salvage + Math.floor(it.lv / 2)} 顆強化石）</button>
      </div>
      ${nxt && it.lv >= 6 ? `<label class="gd-charm"><input type="checkbox" id="gCharm">用護符（失敗不掉級，剩 ${m.charms} 個）</label>` : ''}`;
  }
  function bindGear(m) {
    document.querySelectorAll('.gi').forEach(b => b.onclick = () => { selItem = b.dataset.uid; render(); });
    document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { invFilter = b.dataset.f; render(); });
    const it = m.inv.find(i => i.uid === selItem);
    if (!it) return;
    const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
    on('gEquip', () => { M.ops.equip(it.uid); C().playSound('pop'); render(); });
    on('gUnequip', () => { M.ops.unequip(it.slot); render(); });
    on('gEnh', () => {
      const charm = $('gCharm') && $('gCharm').checked;
      const r = M.ops.enhance(it.uid, charm);
      if (!r.ok) { C().notice(r.msg); return; }
      const msg = { up: `強化成功！變成 +${r.lv}`, fail: '強化失敗，等級沒變', down: `強化失敗，掉到 +${r.lv}`, kept: '強化失敗，護符保住了等級' }[r.result];
      C().playSound(r.result === 'up' ? 'stamp' : 'xiang'); C().toastSmall(msg); render();
    });
    on('gSal', () => C().dialog(`分解「${it.name}」？`, [['分解', () => { const n = M.ops.salvage(it.uid); selItem = null; C().toastSmall(`得到 ${n} 顆強化石`); render(); }], ['取消', null]]));
    on('gRef', () => refineDlg(it));
  }
  function refineDlg(it) {
    const locks = [];
    const box = document.createElement('div');
    box.className = 'overlay dlg';
    const draw = (next) => {
      const cost = 1 + M.LOCK_COST[locks.length];
      box.innerHTML = `<div class="res rf-box"><h3>洗練・${esc(it.name)}</h3>
        ${next ? `<div class="rf-cmp"><div><b>原本</b><ul>${it.subs.map(s => `<li>${M.SUBS[s].name}</li>`).join('')}</ul></div><div><b>新的</b><ul>${next.map((s, i) => `<li class="${s !== it.subs[i] ? 'chg' : ''}">${M.SUBS[s].name}</li>`).join('')}</ul></div></div>
          <button class="btn gold" id="rfNew">保留新的</button><button class="btn ghost" id="rfOld">保留原本的</button>`
        : `<p class="sub">勾選要鎖住（不會變）的詞條。鎖越多，洗練石花越多。</p>
          <ul class="rf-list">${it.subs.map((s, i) => `<li><label><input type="checkbox" data-i="${i}" ${locks.includes(i) ? 'checked' : ''} ${!locks.includes(i) && locks.length >= 3 ? 'disabled' : ''}>${M.SUBS[s].name}</label></li>`).join('')}</ul>
          <p>花費：洗練石 ${cost} 顆（你有 ${M.data.refine} 顆）</p>
          <button class="btn gold" id="rfGo">洗練</button><button class="btn ghost" id="rfX">取消</button>`}</div>`;
      box.querySelectorAll('[data-i]').forEach(c => c.onchange = () => { const i = Number(c.dataset.i); const k = locks.indexOf(i); if (k >= 0) locks.splice(k, 1); else locks.push(i); draw(); });
      const on = (id, fn) => { const e = box.querySelector('#' + id); if (e) e.onclick = fn; };
      on('rfGo', () => { const r = M.ops.refineRoll(it.uid, locks); if (r.err) { C().notice(r.err); return; } C().playSound('bell'); draw(r.next); });
      on('rfX', () => box.remove());
      on('rfNew', () => { M.ops.refineApply(it.uid, next); box.remove(); render(); });
      on('rfOld', () => { box.remove(); render(); });
    };
    document.getElementById('app').appendChild(box);
    draw();
  }

  // ================= 卡牌 =================
  let cardFilter = 'all';
  function cardHTML(c, extra) {
    const T = MJCards.TYPES[c.type];
    return `<div class="dc" style="--tc:${T.color}"><i class="gtype">${T.name}</i><b>${c.name}</b><em>${c.cost} 氣</em><span>${c.desc}</span>${extra || ''}</div>`;
  }
  function cardsHTML(m) {
    const CDS = MJCards;
    const ok = M.deckOK(m);
    const counts = {}; for (const id of m.deck) counts[id] = (counts[id] || 0) + 1;
    const rare = ['普通', '稀有', '傳說'];
    let html = `<details class="tt-help"><summary>卡牌怎麼用？（點開看說明）</summary><ul>
      <li><b>只在冒險模式使用</b>：冒險模式裡，原本的技能改成用卡牌打出，專屬技能照樣可以用。</li>
      <li><b>抽牌</b>：每局開局抽 3 張，你每摸 4 張牌再抽 1 張，手上最多 5 張。用過的卡牌進棄牌堆，牌堆抽完會洗回來。</li>
      <li><b>五種卡牌</b>：技能卡（原本的技能）、法術卡（新效果）、陷阱卡（蓋著，條件成立自動發動，最多同時 2 張）、結界卡（這一局所有人都受規則影響，包含你自己）、勝利卡（這局達成條件就直接算你自摸）。</li>
      <li><b>組牌</b>：卡牌組要 ${CDS.DECK_MIN}～${CDS.DECK_MAX} 張，同一張最多放 ${CDS.COPY_MAX} 張。不合規定時，冒險會先用起始卡牌組。</li>
      <li><b>取得</b>：冒險過關後可以從 3 張裡挑 1 張，柑仔店也有賣。拿到的卡牌永久保存。</li></ul></details>
      <div class="deck-head ${ok ? 'ok' : 'bad'}"><b>我的卡牌組 ${m.deck.length}／${CDS.DECK_MAX}</b><span>${ok ? '可以出戰' : `要 ${CDS.DECK_MIN}～${CDS.DECK_MAX} 張才能出戰`}</span></div>
      <div class="deck-list">${Object.keys(counts).sort((a, b) => CDS.LIST.indexOf(a) - CDS.LIST.indexOf(b)).map(id => cardHTML(CDS.CARDS[id], `<small>×${counts[id]}</small><button class="dc-btn" data-rm="${id}">移出</button>`)).join('') || '<p class="hint">卡牌組是空的</p>'}</div>
      <h3 class="coll-h">收藏（已擁有 ${Object.keys(m.cards).length}／${CDS.LIST.length} 種）</h3>
      <div class="g-filter">${[['all', '全部'], ...Object.entries(CDS.TYPES).map(([k, v]) => [k, v.name])].map(([k, n]) => `<button data-cf="${k}" class="${cardFilter === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="coll">${CDS.LIST.filter(id => cardFilter === 'all' || CDS.CARDS[id].type === cardFilter).map(id => {
        const c = CDS.CARDS[id]; const own = m.cards[id] || 0; const used = counts[id] || 0;
        const can = own > used && used < CDS.COPY_MAX && m.deck.length < CDS.DECK_MAX;
        return own ? cardHTML(c, `<small>${rare[c.rare]}・擁有 ${own}・組裡 ${used}</small><button class="dc-btn" data-add="${id}" ${can ? '' : 'disabled'}>放進卡牌組</button>`)
          : `<div class="dc locked"><b>？？？</b><span>${MJCards.TYPES[c.type].name}・${rare[c.rare]}・還沒取得</span></div>`; }).join('')}</div>`;
    return html;
  }
  function bindCards() {
    document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { M.ops.deckAdd(b.dataset.add); C().playSound('tick'); render(); });
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { M.ops.deckRemove(b.dataset.rm); render(); });
    document.querySelectorAll('[data-cf]').forEach(b => b.onclick = () => { cardFilter = b.dataset.cf; render(); });
  }

  window.MJMetaUI = { open, close };
})();
