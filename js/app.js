// ============================================================
// 账单管家 - Full frontend with Supabase + Claude API
// ============================================================

// ======================== SUPABASE CONFIG ========================
const SB_URL = 'https://dpfdndvxhsbdngvypoie.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZmRuZHZ4aHNiZG5ndnlwb2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjg4NDIsImV4cCI6MjA5MzgwNDg0Mn0.Np3v76r6q9sfu0LsP82UqQmRQH8tVhaF0G2fzlqYoeQ';

// ======================== SUPABASE HELPERS ========================
async function sbGet(table, opts = '') {
  const r = await Promise.race([
    fetch(SB_URL + '/rest/v1/' + table + opts, {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Accept': 'application/json' }
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
  ]);
  if (!r.ok) throw new Error(table + ' GET failed: ' + r.status);
  return r.json();
}

async function sbPost(table, data, opts = '') {
  const r = await Promise.race([
    fetch(SB_URL + '/rest/v1/' + table + opts, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
  ]);
  if (!r.ok) { const t = await r.text(); throw new Error(table + ' POST failed: ' + r.status + ' ' + t); }
  return r.json();
}

async function sbPatch(table, data, opts) {
  const r = await Promise.race([
    fetch(SB_URL + '/rest/v1/' + table + opts, {
      method: 'PATCH',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
  ]);
  if (!r.ok) { const t = await r.text(); throw new Error(table + ' PATCH failed: ' + r.status + ' ' + t); }
  return r.json();
}

async function sbDelete(table, opts) {
  const r = await Promise.race([
    fetch(SB_URL + '/rest/v1/' + table + opts, {
      method: 'DELETE',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
  ]);
  if (!r.ok) throw new Error(table + ' DELETE failed: ' + r.status);
}

async function sbUploadImage(bucket, path, file) {
  const r = await Promise.race([
    fetch(SB_URL + '/storage/v1/object/' + bucket + '/' + path, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': file.type },
      body: file
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000))
  ]);
  if (!r.ok) { const t = await r.text(); throw new Error('Upload failed: ' + r.status + ' ' + t); }
  return SB_URL + '/storage/v1/object/public/' + bucket + '/' + path;
}

// ======================== STATE ========================
let currentTab = 'dashboard';
let currentPage = 'dashboard';
let charts = {};
let currentOcrImageFile = null;
let listPage = 1;
let editingReceiptId = null;

// ======================== INIT ========================
if (typeof Chart === 'undefined') {
  document.getElementById('pageTitle').textContent = '⚠️ Chart.js 加载失败，请刷新重试';
}
addManualItemRow();
addItemRow();
setDefaultDates();
refreshDashboard();

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  document.getElementById('manualDate').value = today;
  ['listStart', 'anaStart', 'exportStart'].forEach(id => {
    document.getElementById(id).value = firstDay;
  });
}

// ======================== TAB / PAGE NAV ========================
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === tab));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  document.getElementById('backBtn').classList.remove('show');
  document.getElementById('pageTitle').textContent = getTitle(tab);
  if (tab === 'dashboard') refreshDashboard();
  if (tab === 'list') searchReceipts();
  if (tab === 'analysis') refreshAnalysis();
  if (tab === 'settings') checkApiKeyStatus();
}

function navigateTo(page) {
  if (page === 'add' || page === 'manual') {
    document.getElementById('backBtn').classList.add('show');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.getElementById('pageTitle').textContent = page === 'add' ? '拍照记账' : '手动录入';
    currentPage = page;
  }
}

function goBack() {
  if (editingReceiptId) {
    const id = editingReceiptId;
    editingReceiptId = null;
    showReceiptDetail(id);
    return;
  }
  if (currentPage.startsWith('page-') && currentPage !== 'page-dashboard') {
    switchTab('dashboard');
    return;
  }
  switchTab(currentTab);
}

function getTitle(tab) {
  const t = { dashboard: '账单管家', add: '拍照记账', manual: '手动录入', list: '账单列表', detail: '账单详情', edit: '编辑账单', analysis: '统计分析', export: '导出数据', settings: '设置' };
  return t[tab] || '账单管家';
}

// ======================== TOAST ========================
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  requestAnimationFrame(() => el.classList.add('show'));
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

function hideModal(id) { document.getElementById(id).classList.remove('show'); }

// ======================== DASHBOARD ========================
async function refreshDashboard() {
  try {
    // Get all receipts for current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const allReceipts = await sbGet('receipts', '?select=*,receipt_items(*)&order=receipt_date.desc.nullslast');
    const monthlyReceipts = allReceipts.filter(r => r.receipt_date >= firstDay && r.receipt_date <= lastDay);

    const totalExpense = monthlyReceipts.reduce((s, r) => s + (r.total_amount || 0), 0);
    const avgPerReceipt = monthlyReceipts.length ? totalExpense / monthlyReceipts.length : 0;

    document.getElementById('statTotal').textContent = '¥' + totalExpense.toFixed(2);
    document.getElementById('statCount').textContent = monthlyReceipts.length;
    document.getElementById('statAvg').textContent = '¥' + avgPerReceipt.toFixed(2);

    // Monthly trend (last 12 months)
    const trendMap = {};
    const last12 = new Date();
    last12.setMonth(last12.getMonth() - 11);
    for (let d = new Date(last12); d <= now; d.setMonth(d.getMonth() + 1)) {
      const m = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      trendMap[m] = 0;
    }
    allReceipts.forEach(r => {
      if (r.receipt_date) {
        const m = r.receipt_date.substring(0, 7);
        if (m in trendMap) trendMap[m] += r.total_amount || 0;
      }
    });
    const trend = Object.entries(trendMap).map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));

    // Category breakdown
    const catMap = {};
    allReceipts.filter(r => r.receipt_date >= firstDay).forEach(r => {
      (r.receipt_items || []).forEach(item => {
        const cat = item.category_name || '未分类';
        catMap[cat] = (catMap[cat] || 0) + (item.total_price || 0);
      });
    });
    const categories = Object.entries(catMap).map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    // Today's date for "today" scope
    renderTrendChart(trend);
    renderCategoryChart(categories);
    renderRecentReceipts(allReceipts.slice(0, 5));
  } catch (e) {
    console.error('Dashboard error:', e);
  }
}

function renderRecentReceipts(receipts) {
  const container = document.getElementById('recentList');
  if (!receipts.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">还没有账单，开始记账吧</div></div>';
    return;
  }
  container.innerHTML = receipts.map(r => `
    <div class="receipt-card" onclick="showReceiptDetail(${r.id})">
      <div class="rc-header">
        <div class="rc-store">${esc(r.store_name) || '未知商家'}</div>
        <div class="rc-total">¥${Number(r.total_amount).toFixed(2)}</div>
      </div>
      <div class="rc-meta">
        <span>${r.receipt_date || ''}</span>
        <span>${(r.receipt_items || []).length} 件商品</span>
      </div>
    </div>
  `).join('');
}

// ======================== CHARTS ========================
function renderTrendChart(monthly) {
  const ctx = document.getElementById('chartTrend').getContext('2d');
  if (charts.trend) charts.trend.destroy();
  if (!monthly.length) {
    charts.trend = new Chart(ctx, { type: 'bar', data: { labels: ['暂无数据'], datasets: [{ data: [0] }] }, options: { responsive: true, maintainAspectRatio: false } });
    return;
  }
  charts.trend = new Chart(ctx, {
    type: 'bar', data: { labels: monthly.map(m => m.month), datasets: [{ label: '支出', data: monthly.map(m => m.total), backgroundColor: 'rgba(79,70,229,0.7)', borderColor: '#4F46E5', borderWidth: 1, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '¥' + v } }, x: { grid: { display: false } } } }
  });
}

function renderCategoryChart(categories) {
  const ctx = document.getElementById('chartCategory').getContext('2d');
  if (charts.category) charts.category.destroy();
  if (!categories.length) {
    charts.category = new Chart(ctx, { type: 'doughnut', data: { labels: ['暂无'], datasets: [{ data: [1], backgroundColor: ['#E5E7EB'] }] }, options: { responsive: true, maintainAspectRatio: false } });
    return;
  }
  const colors = ['#4F46E5', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#EC4899', '#3B82F6', '#14B8A6', '#6366F1', '#F97316', '#22C55E', '#9CA3AF'];
  charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: categories.map(c => c.name), datasets: [{ data: categories.map(c => c.total), backgroundColor: colors.slice(0, categories.length), borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 11 }, padding: 8 } } } }
  });
}

function renderAnaCategoryChart(categories) {
  const ctx = document.getElementById('chartAnaCategory').getContext('2d');
  if (charts.anaCategory) charts.anaCategory.destroy();
  if (!categories.length) {
    charts.anaCategory = new Chart(ctx, { type: 'doughnut', data: { labels: ['暂无'], datasets: [{ data: [1], backgroundColor: ['#E5E7EB'] }] }, options: { responsive: true, maintainAspectRatio: false } });
    return;
  }
  const colors = ['#4F46E5', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#EC4899', '#3B82F6', '#14B8A6', '#6366F1', '#F97316', '#22C55E', '#9CA3AF'];
  charts.anaCategory = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: categories.map(c => c.name), datasets: [{ data: categories.map(c => c.total), backgroundColor: colors.slice(0, categories.length), borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 11 }, padding: 8 } } } }
  });
}

function renderAnaDailyChart(daily) {
  const ctx = document.getElementById('chartAnaDaily').getContext('2d');
  if (charts.anaDaily) charts.anaDaily.destroy();
  if (!daily.length) {
    charts.anaDaily = new Chart(ctx, { type: 'line', data: { labels: ['暂无'], datasets: [{ data: [0] }] }, options: { responsive: true, maintainAspectRatio: false } });
    return;
  }
  charts.anaDaily = new Chart(ctx, {
    type: 'line',
    data: { labels: daily.map(d => d.date), datasets: [{ label: '每日支出', data: daily.map(d => d.total), borderColor: '#4F46E5', backgroundColor: 'rgba(79,70,229,0.1)', fill: true, tension: 0.3, pointRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '¥' + v } }, x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } } } }
  });
}

// ======================== OCR UPLOAD ========================
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  currentOcrImageFile = file;

  // Show preview + start button
  const reader = new FileReader();
  reader.onload = function (e) {
    const area = document.getElementById('uploadArea');
    area.innerHTML = `
      <img src="${e.target.result}" alt="preview">
      <button class="btn btn-primary btn-lg" style="margin-top:12px;" onclick="event.stopPropagation();startOcr()">🚀 开始 AI 识别</button>
    `;
    area.classList.add('has-image');
  };
  reader.readAsDataURL(file);
}

async function startOcr() {
  const file = currentOcrImageFile;
  if (!file) return;

  const apiKey = localStorage.getItem('claude_api_key');
  if (!apiKey) {
    showToast('请先在设置中配置 Claude API Key', 'error');
    // Highlight the settings tab
    document.querySelector('.tab[data-page="settings"]').style.animation = 'pulse-warning 0.5s ease-in-out 3';
    setTimeout(() => {
      document.querySelector('.tab[data-page="settings"]').style.animation = '';
    }, 1500);
    return;
  }

  // OCR via Claude API
  document.getElementById('ocrLoading').style.display = 'block';
  document.getElementById('ocrResult').style.display = 'none';

  try {
    const base64 = await fileToBase64(file);
    const ext = file.name.split('.').pop().toLowerCase();
    const mediaType = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
    const dataUrl = base64.split(',')[1];

    // 通过代理调用 Claude API（浏览器不能直接调用 Anthropic API）
    const PROXY_URL = localStorage.getItem('ocr_proxy_url') || 'https://receipt-tracker-api-kohl.vercel.app/api/anthropic';
    const resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        body: {
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: dataUrl } },
              { type: 'text', text: getOcrPrompt() }
            ]
          }]
        }
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      let msg;
      if (resp.status === 401 || resp.status === 403) msg = 'API Key 无效，请去设置页面检查并重新配置';
      else if (resp.status === 400) msg = '请求参数有误，请重试或联系开发者';
      else if (resp.status === 502 || resp.status === 504) msg = '代理服务器连接超时，请稍后重试';
      else if (resp.status === 500) msg = '代理服务器内部错误，请稍后重试';
      else msg = 'API错误(' + resp.status + ')，请稍后重试';
      throw new Error(msg);
    }

    const result = await resp.json();
    const text = result.content[0].text;

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let receipt;
    if (jsonMatch) {
      receipt = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('无法解析识别结果');
    }

    document.getElementById('ocrLoading').style.display = 'none';
    fillOcrResult(receipt);
    document.getElementById('ocrResult').style.display = 'block';
    showToast('识别完成，请确认信息', 'success');
  } catch (e) {
    document.getElementById('ocrLoading').style.display = 'none';
    // Network errors (fetch itself failed)
    if (e.message === 'Failed to fetch' || e.message.includes('NetworkError') || e.message.includes('network')) {
      showToast('网络连接失败，请检查网络后重试', 'error');
    } else {
      showToast('识别失败: ' + e.message, 'error');
    }
  }
}

function getOcrPrompt() {
  return `你是一个专业的小票/收据识别助手。请仔细分析这张图片中的小票信息，并以严格的JSON格式返回。

请提取以下字段：
- store_name: 商家/店铺名称
- store_address: 地址（如有）
- receipt_date: 日期（格式 YYYY-MM-DD）
- receipt_time: 时间（格式 HH:MM）
- items: 商品列表，每项包含：
  - name: 商品名称
  - quantity: 数量（数字，默认为1）
  - unit_price: 单价（数字，如果没有单价则和total_price相同）
  - total_price: 该商品总价
  - category_name: 根据商品名称判断类别（餐饮美食/超市购物/交通出行/日用百货/数码电子/医疗健康/其他）
- subtotal: 小计金额
- discount_amount: 折扣金额（没有则为0）
- tax_amount: 税费金额（没有则为0）
- total_amount: 总计/实付金额
- payment_method: 支付方式
- receipt_number: 小票号码/订单号

关键要求：
1. 金额字段统一为数字类型，不要带货币符号
2. 如果某些字段不存在，使用空字符串或0
3. 商品名称保持原文
4. 所有字段都必须出现在JSON中
5. 只返回JSON，不要有额外的说明文字
6. **非常重要**：如果你对某个字段的值不确定（比如图片模糊、遮挡、不清晰），不要胡乱猜测。请将该字段的值设为空字符串或0，并在下面的 uncertain_fields 中列出该字段路径，同时用中文描述为什么不确定。

除了上面的数据字段外，请在JSON根部额外包含：
- "uncertain_fields": 一个数组，列出你不确定的字段路径，例如 ["store_name", "items[1].name", "total_amount"]
- "uncertain_questions": 一个对象，key为字段路径，value为你想问用户的中文问题，例如：
  {
    "store_name": "商家名称看不清楚，请问是哪家店？",
    "items[2].name": "第3个商品名称模糊，请问是什么商品？",
    "items[1].total_price": "第2个商品价格看不清，请问是多少钱？",
    "total_amount": "总计金额模糊，请问实际付了多少？"
  }

返回格式示例：
{
  "store_name": "沃尔玛",
  "store_address": "",
  "receipt_date": "2024-01-15",
  "receipt_time": "14:30",
  "items": [
    {"name": "可口可乐", "quantity": 2, "unit_price": 3.5, "total_price": 7.0, "category_name": "餐饮美食"}
  ],
  "subtotal": 100.0,
  "discount_amount": -5.0,
  "tax_amount": 0,
  "total_amount": 95.0,
  "payment_method": "微信支付",
  "receipt_number": "",
  "uncertain_fields": [],
  "uncertain_questions": {}
}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fillOcrResult(receipt) {
  const uncertain = new Set(receipt.uncertain_fields || []);
  const questions = receipt.uncertain_questions || {};

  function isUncertain(path) { return uncertain.has(path); }
  function getQ(path) { return questions[path] || ''; }

  // Show uncertain questions summary at top
  const qList = Object.entries(questions);
  const qHtml = qList.length ? `
    <div style="background:#FEF3C7;border-radius:8px;padding:12px;margin-bottom:16px;">
      <div style="font-weight:600;color:#92400E;margin-bottom:6px;">⚠️ 以下内容没太看清，需要你确认：</div>
      ${qList.map(([path, q]) => `<div style="font-size:13px;color:#92400E;padding:2px 0;">• ${q}</div>`).join('')}
    </div>
  ` : '';

  // More specific: if many items were detected but some are uncertain, show targeted prompts
  const uncertainItemNames = (receipt.items || []).map((item, i) => {
    if (isUncertain('items[' + i + '].name')) return i;
    return -1;
  }).filter(i => i >= 0);
  const uncertainItemPrices = (receipt.items || []).map((item, i) => {
    if (isUncertain('items[' + i + '].total_price')) return i;
    return -1;
  }).filter(i => i >= 0);

  // Prepend the questions banner to the review area
  const reviewHeader = document.querySelector('.receipt-review .review-header');
  if (reviewHeader && qHtml) {
    // Insert after review-header
    let next = reviewHeader.nextElementSibling;
    // Check if already inserted
    const existingBanner = document.querySelector('.uncertain-banner');
    if (!existingBanner) {
      const bannerDiv = document.createElement('div');
      bannerDiv.className = 'uncertain-banner';
      bannerDiv.innerHTML = qHtml;
      reviewHeader.after(bannerDiv);
    }
  }

  // Fill form fields, marking uncertain ones
  setFieldWithUncertainty('ocrStore', receipt.store_name || '', isUncertain('store_name'), getQ('store_name'));
  setFieldWithUncertainty('ocrDate', receipt.receipt_date || '', isUncertain('receipt_date'), getQ('receipt_date'));
  setFieldWithUncertainty('ocrTime', receipt.receipt_time || '', isUncertain('receipt_time'), getQ('receipt_time'));
  setFieldWithUncertainty('ocrSubtotal', receipt.subtotal || 0, isUncertain('subtotal'), getQ('subtotal'));
  setFieldWithUncertainty('ocrDiscount', receipt.discount_amount || 0, isUncertain('discount_amount'), getQ('discount_amount'));
  setFieldWithUncertainty('ocrTax', receipt.tax_amount || 0, isUncertain('tax_amount'), getQ('tax_amount'));
  setFieldWithUncertainty('ocrPayment', receipt.payment_method || '', isUncertain('payment_method'), getQ('payment_method'));
  document.getElementById('ocrNotes').value = '';

  const container = document.getElementById('ocrItems');
  container.innerHTML = '';
  const items = (receipt.items && receipt.items.length) ? receipt.items : [{ name: '', quantity: 1, unit_price: 0, total_price: 0, category_name: '其他' }];
  items.forEach((item, i) => {
    addItemRow(item, {
      nameUncertain: isUncertain('items[' + i + '].name'),
      priceUncertain: isUncertain('items[' + i + '].total_price'),
      nameQ: getQ('items[' + i + '].name'),
      priceQ: getQ('items[' + i + '].total_price'),
    });
  });
  recalcTotal();
}

function setFieldWithUncertainty(id, value, uncertain, question) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.style.borderColor = uncertain ? '#F59E0B' : '';
  el.style.background = uncertain ? '#FFFBEB' : '';
  el.title = uncertain && question ? question : '';
  // Add a visual marker after the field
  const parent = el.parentElement;
  let marker = parent.querySelector('.uncertain-marker');
  if (uncertain) {
    if (!marker) {
      marker = document.createElement('span');
      marker.className = 'uncertain-marker';
      marker.style.cssText = 'display:inline-block;margin-left:6px;color:#D97706;font-size:12px;cursor:help;';
      el.style.width = 'calc(100% - 20px)';
      el.after(marker);
    }
    marker.textContent = '⚠️';
    marker.title = question || '此项不确定，请核实';
  } else if (marker) {
    marker.remove();
  }
}

function addItemRow(item, opts) {
  const container = document.getElementById('ocrItems');
  const name = item ? item.name || '' : '';
  const qty = item ? item.quantity || 1 : 1;
  const price = item ? item.total_price || 0 : 0;
  const cat = item ? item.category_name || '其他' : '其他';
  const nameUncertain = opts && opts.nameUncertain;
  const priceUncertain = opts && opts.priceUncertain;
  const nameQ = (opts && opts.nameQ) || '';
  const priceQ = (opts && opts.priceQ) || '';

  const nameStyle = nameUncertain ? 'border-color:#F59E0B;background:#FFFBEB;' : '';
  const priceStyle = priceUncertain ? 'border-color:#F59E0B;background:#FFFBEB;' : '';
  const nameTitle = nameUncertain && nameQ ? `title="${esc(nameQ)}"` : '';
  const priceTitle = priceUncertain && priceQ ? `title="${esc(priceQ)}"` : '';

  const nameMarker = nameUncertain ? `<span style="color:#D97706;font-size:12px;cursor:help;" ${nameTitle}>⚠️</span>` : '';
  const priceMarker = priceUncertain ? `<span style="color:#D97706;font-size:12px;cursor:help;" ${priceTitle}>⚠️</span>` : '';

  const div = document.createElement('div');
  div.className = 'item-editor-row';
  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:4px;">
      <input type="text" placeholder="商品名称" value="${esc(name)}" onchange="recalcTotal()" class="ie-name" style="${nameStyle}flex:1;">
      ${nameMarker}
    </div>
    <input type="number" placeholder="数量" value="${qty}" min="1" step="1" onchange="recalcTotal()" class="ie-qty" style="width:50px">
    <div style="display:flex;align-items:center;gap:4px;">
      <input type="number" placeholder="金额" value="${price}" step="0.01" onchange="recalcTotal()" class="ie-price" style="${priceStyle}width:60px;">
      ${priceMarker}
    </div>
    <select class="ie-cat" onchange="recalcTotal()">
      <option value="餐饮美食" ${cat === '餐饮美食' ? 'selected' : ''}>餐饮美食</option>
      <option value="超市购物" ${cat === '超市购物' ? 'selected' : ''}>超市购物</option>
      <option value="交通出行" ${cat === '交通出行' ? 'selected' : ''}>交通出行</option>
      <option value="日用百货" ${cat === '日用百货' ? 'selected' : ''}>日用百货</option>
      <option value="数码电子" ${cat === '数码电子' ? 'selected' : ''}>数码电子</option>
      <option value="服饰美妆" ${cat === '服饰美妆' ? 'selected' : ''}>服饰美妆</option>
      <option value="医疗健康" ${cat === '医疗健康' ? 'selected' : ''}>医疗健康</option>
      <option value="休闲娱乐" ${cat === '休闲娱乐' ? 'selected' : ''}>休闲娱乐</option>
      <option value="其他" ${cat === '其他' || !cat ? 'selected' : ''}>其他</option>
    </select>
    <button class="remove-item" onclick="this.parentElement.remove();recalcTotal()">×</button>
  `;
  container.appendChild(div);
}

function recalcTotal() {
  const rows = document.querySelectorAll('#ocrItems .item-editor-row');
  let total = 0;
  rows.forEach(row => { total += parseFloat(row.querySelector('.ie-price').value) || 0; });
  const subtotal = parseFloat(document.getElementById('ocrSubtotal').value) || 0;
  const discount = parseFloat(document.getElementById('ocrDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('ocrTax').value) || 0;
  document.getElementById('ocrTotalDisplay').textContent = Math.max(0, (subtotal || total) + discount + tax).toFixed(2);
}

async function saveOcrReceipt() {
  const rows = document.querySelectorAll('#ocrItems .item-editor-row');
  const items = [];
  rows.forEach(row => {
    const name = row.querySelector('.ie-name').value.trim();
    if (!name) return;
    items.push({ name, quantity: parseFloat(row.querySelector('.ie-qty').value) || 1, unit_price: parseFloat(row.querySelector('.ie-price').value) || 0, total_price: parseFloat(row.querySelector('.ie-price').value) || 0, category_name: row.querySelector('.ie-cat').value || '其他' });
  });

  if (!items.length) { showToast('请至少添加一个商品', 'error'); return; }

  const discount = parseFloat(document.getElementById('ocrDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('ocrTax').value) || 0;
  const subtotal = parseFloat(document.getElementById('ocrSubtotal').value) || 0;
  const itemTotal = items.reduce((s, i) => s + i.total_price, 0);

  try {
    // Upload image to Supabase Storage first
    let imageUrl = '';
    if (currentOcrImageFile) {
      try {
        const ext = currentOcrImageFile.name.split('.').pop();
        const path = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        imageUrl = await sbUploadImage('receipt_images', path, currentOcrImageFile);
      } catch (e) {
        console.warn('Image upload failed (non-fatal):', e);
      }
    }

    // Save receipt
    const receiptData = {
      store_name: document.getElementById('ocrStore').value.trim(),
      receipt_date: document.getElementById('ocrDate').value,
      receipt_time: document.getElementById('ocrTime').value,
      total_amount: (subtotal || itemTotal) + discount + tax,
      subtotal: subtotal || itemTotal,
      discount_amount: discount,
      tax_amount: tax,
      payment_method: document.getElementById('ocrPayment').value.trim(),
      notes: document.getElementById('ocrNotes').value.trim(),
      image_url: imageUrl,
    };

    const receipts = await sbPost('receipts', receiptData);
    const receiptId = receipts[0].id;

    // Save items
    const itemRows = items.map((item, idx) => ({
      receipt_id: receiptId,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      category_name: item.category_name,
      sort_order: idx,
    }));
    await sbPost('receipt_items', itemRows);

    showToast('✓ 账单已保存', 'success');
    retakePhoto();
    switchTab('list');
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

function retakePhoto() {
  document.getElementById('ocrResult').style.display = 'none';
  document.getElementById('ocrLoading').style.display = 'none';
  const area = document.getElementById('uploadArea');
  area.innerHTML = `<div class="upload-icon">📸</div><div class="upload-text">点击拍照或选择图片</div><div class="upload-hint">支持 JPG / PNG 格式</div>`;
  area.classList.remove('has-image');
  document.getElementById('fileInput').value = '';
  currentOcrImageFile = null;
}

// ======================== MANUAL ENTRY ========================
function addManualItemRow() {
  const container = document.getElementById('manualItems');
  const div = document.createElement('div');
  div.className = 'item-editor-row';
  div.innerHTML = `
    <input type="text" placeholder="商品名称" onchange="calcManualTotal()" class="ie-name">
    <input type="number" placeholder="数量" value="1" min="1" step="1" onchange="calcManualTotal()" class="ie-qty" style="width:50px">
    <input type="number" placeholder="金额" step="0.01" onchange="calcManualTotal()" class="ie-price" style="width:70px">
    <select class="ie-cat" onchange="calcManualTotal()">
      <option value="">分类</option>
      <option value="餐饮美食">餐饮美食</option>
      <option value="超市购物">超市购物</option>
      <option value="交通出行">交通出行</option>
      <option value="日用百货">日用百货</option>
      <option value="数码电子">数码电子</option>
      <option value="服饰美妆">服饰美妆</option>
      <option value="医疗健康">医疗健康</option>
      <option value="休闲娱乐">休闲娱乐</option>
      <option value="其他" selected>其他</option>
    </select>
    <button class="remove-item" onclick="this.parentElement.remove();calcManualTotal()">×</button>
  `;
  container.appendChild(div);
}

function calcManualTotal() {
  const rows = document.querySelectorAll('#manualItems .item-editor-row');
  let total = 0;
  rows.forEach(row => { total += parseFloat(row.querySelector('.ie-price').value) || 0; });
  const subtotal = parseFloat(document.getElementById('manualSubtotal').value) || 0;
  const discount = parseFloat(document.getElementById('manualDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('manualTax').value) || 0;
  document.getElementById('manualTotalDisplay').textContent = Math.max(0, (subtotal || total) + discount + tax).toFixed(2);
}

async function saveManualReceipt() {
  const rows = document.querySelectorAll('#manualItems .item-editor-row');
  const items = [];
  rows.forEach(row => {
    const name = row.querySelector('.ie-name').value.trim();
    if (!name) return;
    items.push({ name, quantity: parseFloat(row.querySelector('.ie-qty').value) || 1, total_price: parseFloat(row.querySelector('.ie-price').value) || 0, category_name: row.querySelector('.ie-cat').value || '其他' });
  });

  if (!items.length) { showToast('请至少添加一个商品', 'error'); return; }

  const discount = parseFloat(document.getElementById('manualDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('manualTax').value) || 0;
  const subtotal = parseFloat(document.getElementById('manualSubtotal').value) || 0;
  const itemTotal = items.reduce((s, i) => s + i.total_price, 0);

  try {
    const receiptData = {
      store_name: document.getElementById('manualStore').value.trim(),
      receipt_date: document.getElementById('manualDate').value,
      receipt_time: document.getElementById('manualTime').value,
      total_amount: (subtotal || itemTotal) + discount + tax,
      subtotal: subtotal || itemTotal,
      discount_amount: discount,
      tax_amount: tax,
      payment_method: document.getElementById('manualPayment').value.trim(),
      notes: document.getElementById('manualNotes').value.trim(),
    };

    const receipts = await sbPost('receipts', receiptData);
    const receiptId = receipts[0].id;

    const itemRows = items.map((item, idx) => ({
      receipt_id: receiptId, name: item.name, quantity: item.quantity,
      unit_price: item.total_price, total_price: item.total_price,
      category_name: item.category_name, sort_order: idx
    }));
    await sbPost('receipt_items', itemRows);

    showToast('✓ 账单已保存', 'success');
    document.getElementById('manualStore').value = '';
    document.getElementById('manualTime').value = '';
    document.getElementById('manualSubtotal').value = '';
    document.getElementById('manualDiscount').value = '';
    document.getElementById('manualTax').value = '';
    document.getElementById('manualPayment').value = '';
    document.getElementById('manualNotes').value = '';
    document.getElementById('manualItems').innerHTML = '';
    addManualItemRow();
    calcManualTotal();
    switchTab('list');
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

// ======================== RECEIPT LIST ========================
function searchReceipts() { listPage = 1; loadReceiptList(); }

async function loadReceiptList(page) {
  if (page) listPage = page;
  const kw = document.getElementById('listKeyword').value.trim();
  const start = document.getElementById('listStart').value;
  const end = document.getElementById('listEnd').value;
  const cat = document.getElementById('listCategory').value;

  try {
    let allData = await sbGet('receipts', '?select=*,receipt_items(*)&order=receipt_date.desc.nullslast,id.desc');

    // Client-side filtering
    if (start) allData = allData.filter(r => r.receipt_date >= start);
    if (end) allData = allData.filter(r => r.receipt_date <= end);
    if (kw) {
      const kwl = kw.toLowerCase();
      allData = allData.filter(r =>
        (r.store_name || '').toLowerCase().includes(kwl) ||
        (r.notes || '').toLowerCase().includes(kwl) ||
        (r.receipt_items || []).some(i => (i.name || '').toLowerCase().includes(kwl))
      );
    }
    if (cat) allData = allData.filter(r => (r.receipt_items || []).some(i => i.category_name === cat));

    const totalPages = Math.max(1, Math.ceil(allData.length / 20));
    const pageData = allData.slice((listPage - 1) * 20, listPage * 20);

    const container = document.getElementById('listContent');
    if (!pageData.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">暂无账单</div></div>';
      document.getElementById('listPagination').innerHTML = '';
      return;
    }

    container.innerHTML = pageData.map(r => `
      <div class="receipt-card" onclick="showReceiptDetail(${r.id})">
        <div class="rc-header">
          <div class="rc-store">${esc(r.store_name || '未知商家')}</div>
          <div class="rc-total">¥${Number(r.total_amount).toFixed(2)}</div>
        </div>
        <div class="rc-meta">
          <span>${r.receipt_date || ''}</span>
          <span>${(r.receipt_items || []).length} 件商品</span>
          ${r.payment_method ? `<span>${esc(r.payment_method)}</span>` : ''}
        </div>
      </div>
    `).join('');

    let pagesHtml = '';
    if (totalPages > 1) {
      if (listPage > 1) pagesHtml += `<button class="btn btn-sm btn-outline" onclick="loadReceiptList(${listPage - 1})">上一页</button>`;
      pagesHtml += `<span style="font-size:13px;padding:6px;color:var(--gray-500);">${listPage}/${totalPages}</span>`;
      if (listPage < totalPages) pagesHtml += `<button class="btn btn-sm btn-outline" onclick="loadReceiptList(${listPage + 1})">下一页</button>`;
    }
    document.getElementById('listPagination').innerHTML = pagesHtml;
  } catch (e) {
    console.error('List error:', e);
  }
}

// ======================== RECEIPT DETAIL ========================
async function showReceiptDetail(id) {
  try {
    const data = await sbGet('receipts', '?select=*,receipt_items(*)&id=eq.' + id);
    if (!data.length) { showToast('账单不存在', 'error'); return; }
    const r = data[0];

    const container = document.getElementById('detailContent');
    const imgHtml = r.image_url ? `<img src="${r.image_url}" style="max-width:100%;border-radius:8px;margin-bottom:12px;" alt="receipt">` : '';
    container.innerHTML = `
      ${imgHtml}
      <div class="detail-header">
        <div class="store-name">${esc(r.store_name || '未知商家')}</div>
        <div class="store-date">${r.receipt_date || ''} ${r.receipt_time || ''}</div>
        <div class="total-amount">¥${Number(r.total_amount).toFixed(2)}</div>
      </div>
      <div class="card">
        <div class="detail-section">
          <h3>🛒 商品明细</h3>
          <ul class="item-list">
            ${(r.receipt_items || []).map(i => `
              <li><span class="item-name">${esc(i.name)}</span><span class="item-qty">×${i.quantity}</span><span class="item-price">¥${Number(i.total_price).toFixed(2)}</span></li>
            `).join('')}
          </ul>
        </div>
      </div>
      <div class="card">
        <div class="detail-section">
          <h3>📄 详细信息</h3>
          <div class="detail-grid">
            <div class="dg-item"><div class="dg-label">小计</div><div class="dg-value">¥${Number(r.subtotal || 0).toFixed(2)}</div></div>
            <div class="dg-item"><div class="dg-label">折扣</div><div class="dg-value">${r.discount_amount ? '¥' + Number(r.discount_amount).toFixed(2) : '-'}</div></div>
            <div class="dg-item"><div class="dg-label">税费</div><div class="dg-value">${r.tax_amount ? '¥' + Number(r.tax_amount).toFixed(2) : '-'}</div></div>
            <div class="dg-item"><div class="dg-label">支付方式</div><div class="dg-value">${esc(r.payment_method) || '-'}</div></div>
          </div>
          ${r.notes ? `<div style="margin-top:8px;"><div class="dg-label">备注</div><div class="dg-value">${esc(r.notes)}</div></div>` : ''}
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-outline" style="flex:1;" onclick="editReceipt(${r.id})">✏️ 编辑</button>
        <button class="btn btn-danger" style="flex:1;" onclick="deleteReceipt(${r.id})">🗑️ 删除</button>
      </div>
    `;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-detail').classList.add('active');
    document.getElementById('pageTitle').textContent = '账单详情';
    document.getElementById('backBtn').classList.add('show');
    editingReceiptId = r.id;
  } catch (e) {
    showToast('加载失败: ' + e.message, 'error');
  }
}

async function deleteReceipt(id) {
  if (!confirm('确定要删除这个账单吗？')) return;
  try {
    // Get image_url first
    const data = await sbGet('receipts', '?select=image_url&id=eq.' + id);
    await sbDelete('receipt_items', '?receipt_id=eq.' + id);
    await sbDelete('receipts', '?id=eq.' + id);
    showToast('已删除', 'success');
    goBack();
    switchTab('list');
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error');
  }
}

// ======================== EDIT ========================
async function editReceipt(id) {
  try {
    const data = await sbGet('receipts', '?select=*,receipt_items(*)&id=eq.' + id);
    if (!data.length) return;
    const r = data[0];

    const container = document.getElementById('editContent');
    container.innerHTML = `
      <h3 style="margin-bottom:16px;">✏️ 编辑账单</h3>
      <div class="form-group"><label>商家名称</label><input id="editStore" value="${esc(r.store_name || '')}"></div>
      <div class="form-row">
        <div class="form-group"><label>日期</label><input type="date" id="editDate" value="${r.receipt_date || ''}"></div>
        <div class="form-group"><label>时间</label><input type="time" id="editTime" value="${r.receipt_time || ''}"></div>
      </div>
      <div class="card-title">🛒 商品明细</div>
      <div id="editItems"></div>
      <button class="btn btn-sm btn-outline btn-block" onclick="addEditItemRow()" style="margin-bottom:12px;">+ 添加商品</button>
      <div class="form-row">
        <div class="form-group"><label>小计</label><input type="number" id="editSubtotal" step="0.01" value="${r.subtotal || 0}" onchange="calcEditTotal()"></div>
        <div class="form-group"><label>折扣</label><input type="number" id="editDiscount" step="0.01" value="${r.discount_amount || 0}" onchange="calcEditTotal()"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>税费</label><input type="number" id="editTax" step="0.01" value="${r.tax_amount || 0}" onchange="calcEditTotal()"></div>
        <div class="form-group"><label>支付方式</label><input id="editPayment" value="${esc(r.payment_method || '')}"></div>
      </div>
      <div class="form-group"><label>备注</label><input id="editNotes" value="${esc(r.notes || '')}"></div>
      <button class="btn btn-success btn-lg btn-block" onclick="saveEditReceipt(${r.id})">✓ 保存修改</button>
    `;

    const itemsContainer = document.getElementById('editItems');
    itemsContainer.innerHTML = '';
    (r.receipt_items || []).forEach(item => addEditItemRow(item));

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-edit').classList.add('active');
    document.getElementById('pageTitle').textContent = '编辑账单';
    document.getElementById('backBtn').classList.add('show');
    editingReceiptId = r.id;
  } catch (e) {
    showToast('加载失败', 'error');
  }
}

function addEditItemRow(item) {
  const container = document.getElementById('editItems');
  const name = item ? item.name || '' : '';
  const qty = item ? item.quantity || 1 : 1;
  const price = item ? item.total_price || 0 : 0;
  const cat = item ? item.category_name || '其他' : '其他';
  const div = document.createElement('div');
  div.className = 'item-editor-row';
  div.innerHTML = `
    <input type="text" placeholder="商品名称" value="${esc(name)}" onchange="calcEditTotal()" class="ie-name">
    <input type="number" placeholder="数量" value="${qty}" min="1" step="1" onchange="calcEditTotal()" class="ie-qty" style="width:50px">
    <input type="number" placeholder="金额" value="${price}" step="0.01" onchange="calcEditTotal()" class="ie-price" style="width:70px">
    <select class="ie-cat" onchange="calcEditTotal()">
      <option value="餐饮美食" ${cat === '餐饮美食' ? 'selected' : ''}>餐饮美食</option>
      <option value="超市购物" ${cat === '超市购物' ? 'selected' : ''}>超市购物</option>
      <option value="交通出行" ${cat === '交通出行' ? 'selected' : ''}>交通出行</option>
      <option value="日用百货" ${cat === '日用百货' ? 'selected' : ''}>日用百货</option>
      <option value="数码电子" ${cat === '数码电子' ? 'selected' : ''}>数码电子</option>
      <option value="服饰美妆" ${cat === '服饰美妆' ? 'selected' : ''}>服饰美妆</option>
      <option value="医疗健康" ${cat === '医疗健康' ? 'selected' : ''}>医疗健康</option>
      <option value="休闲娱乐" ${cat === '休闲娱乐' ? 'selected' : ''}>休闲娱乐</option>
      <option value="其他" ${cat === '其他' || !cat ? 'selected' : ''}>其他</option>
    </select>
    <button class="remove-item" onclick="this.parentElement.remove();calcEditTotal()">×</button>
  `;
  container.appendChild(div);
}

function calcEditTotal() {
  const rows = document.querySelectorAll('#editItems .item-editor-row');
  let total = 0;
  rows.forEach(row => { total += parseFloat(row.querySelector('.ie-price').value) || 0; });
  const subtotal = parseFloat(document.getElementById('editSubtotal').value) || 0;
  const discount = parseFloat(document.getElementById('editDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('editTax').value) || 0;
  document.getElementById('editTotalDisplay').textContent = ((subtotal || total) + discount + tax).toFixed(2);
}

async function saveEditReceipt(id) {
  const rows = document.querySelectorAll('#editItems .item-editor-row');
  const items = [];
  rows.forEach(row => {
    const name = row.querySelector('.ie-name').value.trim();
    if (!name) return;
    items.push({ name, quantity: parseFloat(row.querySelector('.ie-qty').value) || 1, total_price: parseFloat(row.querySelector('.ie-price').value) || 0, category_name: row.querySelector('.ie-cat').value || '其他' });
  });

  const discount = parseFloat(document.getElementById('editDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('editTax').value) || 0;
  const subtotal = parseFloat(document.getElementById('editSubtotal').value) || 0;
  const itemTotal = items.reduce((s, i) => s + i.total_price, 0);

  try {
    await sbPatch('receipts', {
      store_name: document.getElementById('editStore').value.trim(),
      receipt_date: document.getElementById('editDate').value,
      receipt_time: document.getElementById('editTime').value,
      total_amount: (subtotal || itemTotal) + discount + tax,
      subtotal: subtotal || itemTotal,
      discount_amount: discount,
      tax_amount: tax,
      payment_method: document.getElementById('editPayment').value.trim(),
      notes: document.getElementById('editNotes').value.trim(),
    }, '?id=eq.' + id);

    // Replace items
    await sbDelete('receipt_items', '?receipt_id=eq.' + id);
    const itemRows = items.map((item, idx) => ({
      receipt_id: id, name: item.name, quantity: item.quantity,
      unit_price: item.total_price, total_price: item.total_price,
      category_name: item.category_name, sort_order: idx
    }));
    if (itemRows.length) await sbPost('receipt_items', itemRows);

    showToast('✓ 已更新', 'success');
    showReceiptDetail(id);
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

// ======================== ANALYSIS ========================
async function refreshAnalysis() {
  const start = document.getElementById('anaStart').value;
  const end = document.getElementById('anaEnd').value;

  try {
    let allData = await sbGet('receipts', '?select=*,receipt_items(*)&order=receipt_date.asc');
    if (start) allData = allData.filter(r => r.receipt_date >= start);
    if (end) allData = allData.filter(r => r.receipt_date <= end);

    const totalExpense = allData.reduce((s, r) => s + (r.total_amount || 0), 0);
    const receiptCount = allData.length;
    document.getElementById('anaTotal').textContent = '¥' + totalExpense.toFixed(2);
    document.getElementById('anaCount').textContent = receiptCount;
    document.getElementById('anaAvg').textContent = '¥' + (receiptCount ? (totalExpense / receiptCount).toFixed(2) : '0');

    // Category breakdown
    const catMap = {};
    allData.forEach(r => (r.receipt_items || []).forEach(item => {
      const cat = item.category_name || '未分类';
      catMap[cat] = (catMap[cat] || 0) + (item.total_price || 0);
    }));
    const categories = Object.entries(catMap).map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 })).sort((a, b) => b.total - a.total);
    renderAnaCategoryChart(categories);

    // Daily trend
    const dayMap = {};
    allData.forEach(r => {
      if (r.receipt_date) dayMap[r.receipt_date] = (dayMap[r.receipt_date] || 0) + (r.total_amount || 0);
    });
    const daily = Object.entries(dayMap).sort(([a], [b]) => a < b ? -1 : 1).map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 }));
    renderAnaDailyChart(daily);

    // Store ranking
    const storeMap = {};
    allData.forEach(r => {
      if (r.store_name) storeMap[r.store_name] = (storeMap[r.store_name] || 0) + (r.total_amount || 0);
    });
    const stores = Object.entries(storeMap).map(([name, total]) => ({ store_name: name, total: Math.round(total * 100) / 100, count: allData.filter(r => r.store_name === name).length })).sort((a, b) => b.total - a.total);

    const storeContainer = document.getElementById('storeRanking');
    if (!stores.length) {
      storeContainer.innerHTML = '<div style="text-align:center;color:var(--gray-400);padding:20px;">暂无数据</div>';
    } else {
      const maxTotal = stores[0].total;
      storeContainer.innerHTML = stores.map((s, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100);">
          <span style="font-weight:600;color:${i < 3 ? 'var(--primary)' : 'var(--gray-400)'};width:20px;">${i + 1}</span>
          <span style="flex:1;font-size:14px;">${esc(s.store_name)}</span>
          <div style="flex:2;height:20px;background:var(--gray-100);border-radius:10px;overflow:hidden;">
            <div style="height:100%;width:${(s.total / maxTotal * 100).toFixed(1)}%;background:var(--primary);border-radius:10px;"></div>
          </div>
          <span style="font-weight:600;font-size:14px;min-width:70px;text-align:right;">¥${Number(s.total).toFixed(2)}</span>
          <span style="font-size:12px;color:var(--gray-400);min-width:30px;text-align:right;">${s.count}笔</span>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error('Analysis error:', e);
  }
}

// ======================== EXPORT ========================
async function doExport(type) {
  const start = document.getElementById('exportStart').value;
  const end = document.getElementById('exportEnd').value;
  const store = document.getElementById('exportStore').value.trim();

  try {
    let allData = await sbGet('receipts', '?select=*,receipt_items(*)&order=receipt_date.desc.nullslast');
    if (start) allData = allData.filter(r => r.receipt_date >= start);
    if (end) allData = allData.filter(r => r.receipt_date <= end);
    if (store) allData = allData.filter(r => (r.store_name || '').toLowerCase().includes(store.toLowerCase()));

    // Build CSV
    const headers = ['日期', '时间', '商家', '商品名称', '数量', '单价', '金额', '分类', '折扣', '小计', '税费', '总计', '支付方式', '备注'];

    // Flatten items
    const rows = [];
    allData.forEach(r => {
      const items = r.receipt_items || [{ name: '', quantity: '', unit_price: '', total_price: '', category_name: '' }];
      items.forEach(item => {
        rows.push([
          r.receipt_date || '', r.receipt_time || '', r.store_name || '',
          item.name || '', item.quantity || '', item.unit_price || '', item.total_price || '',
          item.category_name || '', r.discount_amount || '', r.subtotal || '',
          r.tax_amount || '', r.total_amount || '', r.payment_method || '', r.notes || ''
        ]);
      });
    });

    let csv = '﻿' + headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(v => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `消费记录_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('下载成功', 'success');
  } catch (e) {
    showToast('导出失败: ' + e.message, 'error');
  }
}

// ======================== SETTINGS ========================
function checkApiKeyStatus() {
  const key = localStorage.getItem('claude_api_key');
  const el = document.getElementById('apiKeyStatus');
  el.textContent = key ? '已配置' : '未配置';
  el.className = 'si-status ' + (key ? 'configured' : 'not-configured');
}

function showApiKeyModal() {
  document.getElementById('apiKeyModal').classList.add('show');
  const existing = localStorage.getItem('claude_api_key');
  if (existing) document.getElementById('apiKeyInput').placeholder = '已配置，输入新值覆盖';
}

function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { showToast('请输入 API Key', 'error'); return; }
  localStorage.setItem('claude_api_key', key);
  showToast('✓ API Key 已保存', 'success');
  hideModal('apiKeyModal');
  checkApiKeyStatus();
}

// ======================== UTILITY ========================
function esc(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ======================== EXPORT (Excel with SheetJS if available) ========================
// Note: For Excel export, we can optionally load SheetJS dynamically
