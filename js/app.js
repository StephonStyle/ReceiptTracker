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
let currentOcrFiles = [];
let listPage = 1;
let editingReceiptId = null;

var unitOptions = ['个','件','只','盒','瓶','包','双','条','箱','份','杯','袋','罐','箱','打','板'];
var currencyMap = { EUR:'€', USD:'$', GBP:'£', CNY:'¥', other:'¤' };

function getCurrencySymbol() {
  var c = document.getElementById('ocrCurrency');
  return c ? (currencyMap[c.value] || '€') : '€';
}

var itemTranslations = {
  'coca cola':'可口可乐','pepsi':'百事可乐','sprite':'雪碧','fanta':'芬达',
  'water':'矿泉水','water bottle':'瓶装水','milk':'牛奶','soy milk':'豆浆',
  'juice':'果汁','orange juice':'橙汁','apple juice':'苹果汁',
  'coffee':'咖啡','latte':'拿铁','cappuccino':'卡布奇诺','espresso':'浓缩咖啡','americano':'美式咖啡',
  'tea':'茶','green tea':'绿茶','black tea':'红茶','milk tea':'奶茶',
  'beer':'啤酒','wine':'葡萄酒','red wine':'红酒','white wine':'白酒',
  'bread':'面包','croissant':'牛角包','baguette':'法棍','toast':'吐司',
  'rice':'米饭','noodle':'面条','pasta':'意面','spaghetti':'意大利面',
  'chicken':'鸡肉','beef':'牛肉','pork':'猪肉','fish':'鱼','shrimp':'虾','egg':'鸡蛋',
  'cheese':'奶酪','butter':'黄油','yogurt':'酸奶','cream':'奶油',
  'apple':'苹果','banana':'香蕉','orange':'橙子','grape':'葡萄','strawberry':'草莓',
  'potato':'土豆','tomato':'番茄','onion':'洋葱','lettuce':'生菜','cucumber':'黄瓜',
  'chocolate':'巧克力','candy':'糖果','cookie':'饼干','cake':'蛋糕','ice cream':'冰淇淋',
  'ketchup':'番茄酱','salt':'盐','sugar':'糖','oil':'油','vinegar':'醋','soy sauce':'酱油',
  'tissue':'纸巾','paper towel':'纸巾','napkin':'餐巾','plastic bag':'塑料袋',
  'shampoo':'洗发水','soap':'肥皂','toothpaste':'牙膏','toilet paper':'卫生纸',
  'vitamin':'维生素','medicine':'药','band aid':'创可贴',
  'pizza':'披萨','burger':'汉堡','sandwich':'三明治','salad':'沙拉','soup':'汤',
  'fries':'薯条','chips':'薯片','sushi':'寿司','dim sum':'点心',
  'receipt':'收据','total':'总计','subtotal':'小计','discount':'折扣','tax':'税费','change':'找零',
  'cash':'现金','card':'银行卡','credit':'信用卡','debit':'借记卡',
  'visa':'维萨','mastercard':'万事达','amex':'美国运通',
  'gift card':'礼品卡','coupon':'优惠券','voucher':'代金券'
};

function translateItem(name) {
  if (!name) return '';
  var n = name.trim().toLowerCase();
  // Try full match first
  if (itemTranslations[n]) return itemTranslations[n];
  // Try partial match (first word)
  var first = n.split(/[\s,]+/)[0];
  if (itemTranslations[first]) return itemTranslations[first];
  // Try matching part of the name
  for (var key in itemTranslations) {
    if (n.includes(key) || key.includes(n)) return itemTranslations[key];
  }
  return '';
}

function parseStoredName(s) {
  if (!s) return { cn: '', en: '' };
  var m = s.match(/^(.+?)\s*\((.+)\)$/);
  if (m) return { cn: m[1].trim(), en: m[2].trim() };
  return { cn: s, en: s };
}
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
  ['listStart', 'exportStart'].forEach(id => {
    document.getElementById(id).value = firstDay;
  });
}

function setAnalysisDefaultDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  document.getElementById('anaStart').value = firstDay;
  document.getElementById('anaEnd').value = lastDay;
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
  if (tab === 'analysis') { setAnalysisDefaultDates(); refreshAnalysis(); }
  if (tab === 'settings') checkApiKeyStatus();
}

function navigateTo(page) {
  if (page === 'add' || page === 'manual') {
    document.getElementById('backBtn').classList.add('show');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.getElementById('pageTitle').textContent = page === 'add' ? '拍照记账' : '手动录入';
    currentPage = page;
  } else {
    switchTab(page);
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
    const monthlyReceipts = allReceipts.filter(r => !r.receipt_date || (r.receipt_date >= firstDay && r.receipt_date <= lastDay));

    const totalExpense = monthlyReceipts.reduce((s, r) => s + (r.total_amount || 0), 0);

    document.getElementById('statTotal').textContent = '¥' + totalExpense.toFixed(2);
    document.getElementById('statCount').textContent = monthlyReceipts.length;

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
    allReceipts.filter(r => !r.receipt_date || r.receipt_date >= firstDay).forEach(r => {
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
        <div class="rc-total">${currencyMap[r.currency] || '¥'}${Number(r.total_amount).toFixed(2)}</div>
      </div>
      <div class="rc-meta">
        <span>${r.receipt_date || '--'}</span>
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
    type: 'bar', data: { labels: monthly.map(m => m.month.replace(/\d{4}-0?/, '') + '月'), datasets: [{ label: '支出', data: monthly.map(m => m.total), backgroundColor: 'rgba(79,70,229,0.7)', borderColor: '#4F46E5', borderWidth: 1, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '¥' + v } }, x: { grid: { display: false }, ticks: { maxRotation: 0 } } } }
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
    data: { labels: categories.map(c => c.name + '  ¥' + c.total), datasets: [{ data: categories.map(c => c.total), backgroundColor: colors.slice(0, categories.length), borderWidth: 2 }] },
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
    data: { labels: categories.map(c => c.name + '  ¥' + c.total), datasets: [{ data: categories.map(c => c.total), backgroundColor: colors.slice(0, categories.length), borderWidth: 2 }] },
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

// ======================== PROVIDER HELPERS ========================
function getProvider() {
  return localStorage.getItem('ai_provider') || 'claude';
}

function getApiKey() {
  const p = getProvider();
  if (p === 'local') return 'local';
  return localStorage.getItem(p === 'deepseek' ? 'deepseek_api_key' : p === 'gemini' ? 'gemini_api_key' : p === 'openai' ? 'openai_api_key' : 'claude_api_key');
}

function getProviderName() {
  const p = getProvider();
  return p === 'deepseek' ? 'DeepSeek' : p === 'gemini' ? 'Gemini' : p === 'openai' ? 'OpenAI' : p === 'local' ? '本地识别' : 'Claude';
}

function syncProviderFromDropdown() {
  const sel = document.getElementById('aiProvider');
  if (sel) localStorage.setItem('ai_provider', sel.value);
}

function onProviderChange() {
  localStorage.setItem('ai_provider', document.getElementById('aiProvider').value);
  checkApiKeyStatus();
}

// ======================== DIAGNOSTICS ========================
let diagLog = [];
function diag(msg) {
  diagLog.push('[' + new Date().toLocaleTimeString() + '] ' + msg);
  console.log('[账单管家] ' + msg);
}
function getDiagText() {
  return diagLog.join('\n');
}
function toggleDiag() {
  const el = document.getElementById('diagInfo');
  if (!el) return;
  if (el.style.display === 'block') {
    el.style.display = 'none';
  } else {
    el.style.display = 'block';
    const p = getProvider();
    const k = getApiKey();
    el.innerHTML = [
      '<div><b>当前提供商:</b> ' + getProviderName() + ' (' + p + ')</div>',
      '<div><b>API Key:</b> ' + (k ? k.slice(0, 8) + '...' + k.slice(-4) : '未配置') + '</div>',
      '<div><b>localStorage:</b> ai_provider=' + (localStorage.getItem('ai_provider') || '(未设置)') + '</div>',
      '<div><b>日志:</b></div>',
      '<div style="max-height:200px;overflow-y:auto;white-space:pre-wrap;font-family:monospace;font-size:11px;">' + getDiagText() + '</div>'
    ].join('');
  }
}

function copyDiag() {
  const p = getProvider();
  const k = getApiKey();
  const lines = [
    '=== ' + getProviderName() + ' ==' + '= 诊断信息 ===',
    '当前提供商: ' + getProviderName() + ' (' + p + ')',
    'API Key: ' + (k ? k.slice(0, 8) + '...' + k.slice(-4) : '未配置'),
    'localStorage ai_provider: ' + (localStorage.getItem('ai_provider') || '(未设置)'),
    '',
    '--- 操作日志 ---',
    getDiagText()
  ];
  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(function() {
    showToast('诊断信息已复制', 'success');
  }, function() {
    showToast('复制失败，请手动选中', 'error');
  });
}

async function testApiConnection() {
  // Sync dropdown to localStorage before reading
  syncProviderFromDropdown();

  const provider = getProvider();
  const apiKey = getApiKey();
  diag('测试连接: provider=' + provider + ', key=' + (apiKey ? apiKey.slice(0, 8) + '...' : '无'));

  if (!apiKey) {
    showToast('请先配置 ' + getProviderName() + ' API Key', 'error');
    return;
  }

  if (provider === 'local') {
    showToast('本地识别无需测试', '');
    return;
  }

  showToast('正在测试 ' + getProviderName() + ' 连接...');

  try {
    if (provider === 'gemini') {
      const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hello, reply "OK" in one word.' }] }] })
      });
      if (!resp.ok) {
        const err = await resp.text();
        diag('Gemini测试失败: ' + err.slice(0, 300));
        throw new Error(err.slice(0, 200));
      }
      const result = await resp.json();
      diag('Gemini测试成功');
      showToast('Gemini API 连接正常', 'success');
    } else if (provider === 'claude') {
      const PROXY_URL = localStorage.getItem('ocr_proxy_url') || 'https://receipt-tracker-api-kohl.vercel.app/api/anthropic';
      const resp = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          body: { model: 'claude-sonnet-4-6', max_tokens: 100, messages: [{ role: 'user', content: 'Reply "OK" in one word.' }] }
        })
      });
      if (!resp.ok) {
        const err = await resp.text();
        diag('Claude测试失败: ' + err.slice(0, 300));
        throw new Error(err.slice(0, 200));
      }
      diag('Claude测试成功');
      showToast('Claude API 连接正常', 'success');
    } else if (provider === 'deepseek') {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 100, messages: [{ role: 'user', content: 'Reply "OK" in one word.' }] })
      });
      if (!resp.ok) {
        const err = await resp.text();
        diag('DeepSeek测试失败: ' + err.slice(0, 300));
        throw new Error(err.slice(0, 200));
      }
      diag('DeepSeek测试成功');
      showToast('DeepSeek API 连接正常', 'success');
    } else if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 100, messages: [{ role: 'user', content: 'Reply "OK" in one word.' }] })
      });
      if (!resp.ok) {
        const err = await resp.text();
        diag('OpenAI测试失败: ' + err.slice(0, 300));
        throw new Error(err.slice(0, 200));
      }
      diag('OpenAI测试成功');
      showToast('OpenAI API 连接正常', 'success');
    }
  } catch (e) {
    diag('测试失败: ' + e.message);
    showToast('连接失败: ' + e.message, 'error');
  }
}

// ======================== OCR UPLOAD ========================
function handleFileSelect(event) {
  var newFiles = Array.from(event.target.files);
  if (!newFiles.length) return;

  // Append to existing files
  currentOcrFiles = currentOcrFiles.concat(newFiles);
  currentOcrImageFile = currentOcrFiles[0];

  // Reset file input so same file can be selected again
  event.target.value = '';

  var area = document.getElementById('uploadArea');
  area.classList.add('has-image');
  area.style.cssText = 'border-style:solid;border-color:var(--success);padding:16px;';

  renderUploadGallery(area);
}

function renderUploadGallery(area) {
  // Remove the upload-area click handler to prevent gallery buttons from triggering file picker
  area.onclick = null;
  var files = currentOcrFiles;
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:12px;">';
  var loadPromises = files.map(function(file, i) {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) {
        html += '<div style="position:relative;border-radius:8px;overflow:hidden;border:2px solid var(--gray-200);">';
        html += '<img src="' + e.target.result + '" style="width:100%;height:120px;object-fit:cover;display:block;" alt="photo ' + (i+1) + '">';
        html += '<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.6);color:white;font-size:11px;padding:2px 6px;border-radius:4px;">#' + (i+1) + '</div>';
        html += '<button class="btn btn-sm btn-primary" style="position:absolute;bottom:4px;right:4px;font-size:11px;padding:4px 8px;" onclick="event.stopPropagation();startOcr(' + i + ')">识别</button>';
        html += '</div>';
        resolve();
      };
      reader.readAsDataURL(file);
    });
  });

  Promise.all(loadPromises).then(function() {
    html += '</div>';
    if (files.length > 1) {
      html += '<button class="btn btn-primary btn-lg btn-block" onclick="event.stopPropagation();startAllOcr()" style="margin-bottom:6px;">🚀 全部识别 (' + files.length + '张)</button>';
    } else {
      html += '<button class="btn btn-primary btn-lg btn-block" onclick="event.stopPropagation();startOcr()" style="margin-bottom:6px;">🚀 开始识别</button>';
    }
    html += '<div style="display:flex;gap:8px;">';
    html += '<button class="btn btn-outline" style="flex:1;" onclick="event.stopPropagation();document.getElementById(\'fileInput\').click()">📷 继续添加</button>';
    html += '<button class="btn btn-outline" style="flex:1;" onclick="retakePhoto()">重新选择</button>';
    html += '</div>';
    area.innerHTML = html;
  });
}

async function startOcr(fileIndex) {
  var file;
  if (fileIndex !== undefined && currentOcrFiles[fileIndex]) {
    file = currentOcrFiles[fileIndex];
    currentOcrImageFile = file;
  } else {
    file = currentOcrImageFile;
  }
  if (!file) return;

  syncProviderFromDropdown();
  var apiKey = getApiKey();
  var provider = getProvider();
  diag('OCR开始: provider=' + provider + ', key=' + (apiKey ? apiKey.slice(0, 8) + '...' : '无'));
  if (!apiKey) {
    showToast('请先设置 API Key', 'error');
    document.querySelector('.tab[data-page="settings"]').style.animation = 'pulse-warning 0.5s ease-in-out 3';
    setTimeout(function() {
      document.querySelector('.tab[data-page="settings"]').style.animation = '';
    }, 1500);
    return;
  }

  document.getElementById('ocrLoading').style.display = 'block';
  document.getElementById('ocrResult').style.display = 'none';

  try {
    await processSingleOcr();
    showToast('识别完成，请确认信息', 'success');
  } catch (e) {
    document.getElementById('ocrLoading').style.display = 'none';
    diag('OCR失败: ' + e.message);
    if (e.message === 'Failed to fetch' || e.message.includes('NetworkError') || e.message.includes('network')) {
      showToast('网络连接失败，请检查网络后重试', 'error');
    } else {
      showToast('识别失败: ' + e.message, 'error');
    }
  }
}

async function startAllOcr() {
  if (!currentOcrFiles.length) return;
  syncProviderFromDropdown();
  var apiKey = getApiKey();
  if (!apiKey) {
    showToast('请先在设置中配置 API Key', 'error');
    return;
  }
  showToast('开始识别 ' + currentOcrFiles.length + ' 张图片...');
  var successCount = 0;
  for (var i = 0; i < currentOcrFiles.length; i++) {
    showToast('正在识别第 ' + (i + 1) + '/' + currentOcrFiles.length + ' 张...');
    currentOcrImageFile = currentOcrFiles[i];
    try {
      await processSingleOcr();
      successCount++;
    } catch (e) {
      showToast('第 ' + (i + 1) + ' 张识别失败: ' + e.message, 'error');
    }
  }
  if (successCount > 0) {
    showToast('✓ ' + successCount + '/' + currentOcrFiles.length + ' 张识别完成', 'success');
  }
}

async function processSingleOcr() {
  var file = currentOcrImageFile;
  if (!file) throw new Error('无文件');

  var compressedFile = await compressImage(file, 1600);
  var base64 = await fileToBase64(compressedFile);
  var ext = compressedFile.name.split('.').pop().toLowerCase();
  var mediaType = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
  var dataUrl = base64.split(',')[1];
  diag('图片大小: ' + (base64.length / 1024).toFixed(0) + 'KB');

  var provider = getProvider();
  var apiKey = getApiKey();
  var text;
  if (provider === 'deepseek') {
    text = await callDeepSeekOcr(apiKey, dataUrl, mediaType);
  } else if (provider === 'gemini') {
    text = await callGeminiOcr(apiKey, dataUrl, mediaType);
  } else if (provider === 'openai') {
    text = await callOpenAiOcr(apiKey, dataUrl, mediaType);
  } else if (provider === 'local') {
    text = await callLocalOcr(file);
  } else {
    text = await callClaudeOcr(apiKey, dataUrl, mediaType);
  }

  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('无法解析识别结果');
  var receipt = JSON.parse(jsonMatch[0]);

  document.getElementById('ocrLoading').style.display = 'none';
  document.getElementById('uploadArea').style.display = 'none';
  fillOcrResult(receipt);
  document.getElementById('ocrResult').style.display = 'block';
  diag('OCR成功');
}

async function callClaudeOcr(apiKey, dataUrl, mediaType) {
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
  return result.content[0].text;
}

async function callDeepSeekOcr(apiKey, dataUrl, mediaType) {
  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: getOcrPrompt() },
          { type: 'image_url', image_url: { url: 'data:' + mediaType + ';base64,' + dataUrl } }
        ]
      }]
    })
  });
  if (!resp.ok) {
    const err = await resp.text();
    let msg;
    if (resp.status === 401 || resp.status === 403) msg = 'API Key 无效，请去设置页面检查并重新配置';
    else if (resp.status === 400) {
      // Check if it's because images aren't supported
      if (err.includes('image') || err.includes('vision') || err.includes('multimodal')) {
        msg = 'DeepSeek 不支持图片识别，请在设置中换用 Claude API';
      } else {
        msg = '请求参数有误: ' + err.slice(0, 100);
      }
    } else msg = 'DeepSeek API错误(' + resp.status + ')，请稍后重试';
    throw new Error(msg);
  }
  const result = await resp.json();
  return result.choices[0].message.content;
}

async function callGeminiOcr(apiKey, dataUrl, mediaType) {
  const mimeMap = { 'image/jpeg': 'image/jpeg', 'image/png': 'image/png', 'image/webp': 'image/webp', 'image/gif': 'image/gif' };
  const mime = mimeMap[mediaType] || 'image/jpeg';
  const geminiProxy = localStorage.getItem('gemini_proxy_url') || 'https://receipt-tracker-api-kohl.vercel.app/api/gemini';
  const requestBody = {
    contents: [{
      role: 'user',
      parts: [
        { text: getOcrPrompt() },
        { inline_data: { mime_type: mime, data: dataUrl } }
      ]
    }]
  };

  let lastErr = null;

  // Try Vercel proxy first (helps when Google is blocked/unreachable)
  if (geminiProxy) {
    diag('Gemini: 尝试通过代理 ' + geminiProxy);
    try {
      const resp = await fetch(geminiProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, body: requestBody })
      });
      if (resp.ok) {
        const result = await resp.json();
        diag('Gemini: 代理调用成功');
        return result.candidates[0].content.parts[0].text;
      }
      const errText = await resp.text();
      diag('Gemini: 代理返回错误 ' + resp.status + ': ' + errText.slice(0, 200));
      lastErr = new Error('代理错误(' + resp.status + '): ' + errText.slice(0, 200));
    } catch (e) {
      diag('Gemini: 代理调用失败: ' + e.message);
      lastErr = e;
    }
  }

  // Fall back to direct connection
  diag('Gemini: 尝试直连');
  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (!resp.ok) {
      const err = await resp.text();
      diag('Gemini: 直连返回错误: ' + err.slice(0, 300));
      let msg;
      if (resp.status === 403 || resp.status === 401) {
        msg = 'API Key 无效。原始错误: ' + err.slice(0, 200);
      } else if (resp.status === 400) {
        msg = '请求参数有误: ' + err.slice(0, 200);
      } else if (resp.status === 429) {
        msg = 'Gemini 频率超限。去 https://aistudio.google.com/apikey 重新创建 Key。原始: ' + err.slice(0, 300);
      } else {
        msg = 'Gemini API错误(' + resp.status + '): ' + err.slice(0, 200);
      }
      throw new Error(msg);
    }
    const result = await resp.json();
    diag('Gemini: 直连调用成功');
    return result.candidates[0].content.parts[0].text;
  } catch (e) {
    diag('Gemini: 直连失败: ' + e.message);
    if (lastErr && !e.message.includes('频率超限') && !e.message.includes('无效')) {
      throw lastErr;
    }
    throw e;
  }
}

async function callOpenAiOcr(apiKey, dataUrl, mediaType) {
  const mimeMap = { 'image/jpeg': 'image/jpeg', 'image/png': 'image/png', 'image/webp': 'image/webp', 'image/gif': 'image/gif' };
  const mime = mimeMap[mediaType] || 'image/jpeg';
  diag('OpenAI: 开始调用 GPT-4o');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: getOcrPrompt() },
          { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + dataUrl } }
        ]
      }]
    })
  });
  if (!resp.ok) {
    const err = await resp.text();
    diag('OpenAI: 返回错误: ' + err.slice(0, 300));
    let msg;
    if (resp.status === 401 || resp.status === 403) msg = 'API Key 无效，请检查 OpenAI API Key';
    else if (resp.status === 429) msg = 'OpenAI 速率超限，请稍后重试';
    else if (resp.status === 400) msg = '请求参数有误: ' + err.slice(0, 100);
    else msg = 'OpenAI API错误(' + resp.status + '): ' + err.slice(0, 100);
    throw new Error(msg);
  }
  const result = await resp.json();
  diag('OpenAI: 调用成功');
  return result.choices[0].message.content;
}

async function callLocalOcr(file) {
  // Dynamically load Tesseract.js
  if (typeof Tesseract === 'undefined') {
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
  }
  // Show progress
  document.querySelector('#ocrLoading .spinner').after(
    Object.assign(document.createElement('div'), { id: 'ocrProgress', style: 'font-size:13px;margin-top:8px;' })
  );
  const result = await Tesseract.recognize(file, 'chi_sim+eng', {
    logger: m => {
      const el = document.getElementById('ocrProgress');
      if (el && m.status === 'recognizing text') el.textContent = '识别中... ' + Math.round(m.progress * 100) + '%';
    }
  });
  // Parse raw OCR text into receipt format
  const rawText = result.data.text;
  return parseOcrTextToReceipt(rawText);
}

function parseOcrTextToReceipt(rawText) {
  // Try to extract basic info from raw text with simple heuristics
  const lines = rawText.split('\n').filter(l => l.trim());
  // Build a simple structured result
  const receipt = {
    store_name: lines[0] || '',
    receipt_date: '',
    receipt_time: '',
    items: [],
    subtotal: 0,
    total_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    payment_method: '',
    uncertain_fields: [],
    uncertain_questions: {}
  };
  // Look for date patterns
  const dateMatch = rawText.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  if (dateMatch) receipt.receipt_date = dateMatch[1].replace(/\//g, '-');
  // Look for total amount patterns
  const totalMatch = rawText.match(/[总合][计额]\s*[:：]?\s*¥?\s*(\d+\.?\d*)/);
  if (totalMatch) receipt.total_amount = parseFloat(totalMatch[1]);
  else {
    const priceMatch = rawText.match(/合计?[:：]?\s*¥?\s*(\d+\.?\d*)/);
    if (priceMatch) receipt.total_amount = parseFloat(priceMatch[1]);
  }
  // Try to extract items (lines containing numbers)
  const priceLines = lines.filter(l => /\d+\.?\d*/.test(l));
  priceLines.forEach(l => {
    const nums = l.match(/(\d+\.?\d*)/g);
    if (nums && nums.length >= 1) {
      const lastNum = parseFloat(nums[nums.length - 1]);
      if (lastNum > 0 && lastNum < 100000) {
        const name = l.replace(/\d+\.?\d*/g, '').replace(/[×xX*]\s*\d+/g, '').trim();
        if (name && !name.includes('合') && !name.includes('总') && !name.includes('找') && !name.includes('支')) {
          receipt.items.push({ name, quantity: 1, unit_price: lastNum, total_price: lastNum, category_name: '其他' });
        }
      }
    }
  });
  if (!receipt.items.length) {
    receipt.items.push({ name: rawText.slice(0, 30) + '...', quantity: 1, unit_price: receipt.total_amount, total_price: receipt.total_amount, category_name: '其他' });
  }
  receipt.uncertain_fields = ['store_name', 'receipt_date', 'receipt_time', 'items', 'subtotal', 'payment_method'];
  receipt.uncertain_questions = { store_name: '本地识别可能不准确，请核对并修改以上信息' };
  return JSON.stringify(receipt, null, 2);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('加载Tesseract.js失败'));
    document.body.appendChild(s);
  });
}

function getOcrPrompt() {
  return `你是一个专业的小票/收据识别助手。请仔细分析这张图片中的小票信息，并以严格的JSON格式返回。

请提取以下字段：
- store_name: 商家/店铺名称
- store_address: 地址（如有）
- receipt_date: 日期（格式 YYYY-MM-DD）
- receipt_time: 时间（格式 HH:MM）
- items: 商品列表，每项包含：
  - name: 商品原文名称（保持收据上的原文，通常是英文）
  - name_cn: 根据商品原文翻译成中文，如果是英文则翻译为中文，如果是中文则保留
  - quantity: 数量（数字，默认为1）
  - unit_price: 单价（数字，如果没有单价则和total_price相同）
  - total_price: 该商品总价
  - category_name: 根据商品名称判断类别（餐饮美食/超市购物/交通出行/日用百货/数码电子/医疗健康/其他）
- subtotal: 小计金额
- discount_amount: 折扣金额（没有则为0）
- tax_amount: 税费金额（没有则为0）
- total_amount: 总计/实付金额
- payment_method: 支付方式，从以下选项中选最匹配的一个：Visa/Mastercard/American Express/Debit Card/现金/微信支付/支付宝/Gift Card/其他。如有多种支付，选主要的一种。
- receipt_number: 小票号码/订单号

关键要求：
1. 金额字段统一为数字类型，不要带货币符号
2. 如果某些字段不存在，使用空字符串或0
3. 商品名称保持原文
4. 所有字段都必须出现在JSON中
5. 只返回JSON，不要有额外的说明文字
6. **非常重要**：如果不确定某个字段，设为空/0，并在下面列出。

除了上面的数据字段外，请在JSON根部额外包含：
- "uncertain_fields": 一个数组，列出你不确定的字段路径，例如 ["store_name", "items[1].name", "total_amount"]
- "uncertain_questions": 一个对象，key为字段路径，value为你想问用户的中文问题，例如：
  {
    "store_name": "商家名称？",
    "items[2].name": "商品3名称？",
    "items[1].total_price": "商品2价格？",
    "total_amount": "总计金额？"
  }

返回格式示例：
{
  "store_name": "沃尔玛",
  "store_address": "",
  "receipt_date": "2024-01-15",
  "receipt_time": "14:30",
  "items": [
    {"name": "可口可乐", "name_cn": "可口可乐", "quantity": 2, "unit_price": 3.5, "total_price": 7.0, "category_name": "餐饮美食"}
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

function compressImage(file, maxDim) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w <= maxDim && h <= maxDim) { resolve(file); return; }
      var ratio = Math.min(maxDim / w, maxDim / h);
      var c = document.createElement('canvas');
      c.width = Math.round(w * ratio);
      c.height = Math.round(h * ratio);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function(blob) {
        if (!blob) { resolve(file); return; }
        blob.name = file.name;
        resolve(blob);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = function() { resolve(file); };
    var reader = new FileReader();
    reader.onload = function(e) { img.src = e.target.result; };
    reader.onerror = function() { resolve(file); };
    reader.readAsDataURL(file);
  });
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

  function isUncertain(path) { return uncertain.has(path); }

  // Fill form fields, marking uncertain ones with subtle indicator
  setFieldWithUncertainty('ocrStore', receipt.store_name || '', isUncertain('store_name'));
  setFieldWithUncertainty('ocrDate', receipt.receipt_date || '', isUncertain('receipt_date'));
  setFieldWithUncertainty('ocrTime', receipt.receipt_time || '', isUncertain('receipt_time'));
  setFieldWithUncertainty('ocrSubtotal', receipt.subtotal || 0, isUncertain('subtotal'));
  setFieldWithUncertainty('ocrDiscount', receipt.discount_amount || 0, isUncertain('discount_amount'));
  setFieldWithUncertainty('ocrTax', receipt.tax_amount || 0, isUncertain('tax_amount'));
  // Reset payment dropdown to defaults, then select matching
  const paymentEl = document.getElementById('ocrPayment');
  var defaultPayments = ['','Visa','Mastercard','American Express','Debit Card','现金 Cash','微信支付','支付宝','Gift Card','其他 Other'];
  paymentEl.innerHTML = defaultPayments.map(function(v) {
    return '<option value="' + v + '">' + (v || '请选择') + '</option>';
  }).join('');
  var paymentMethod = receipt.payment_method || '';
  var paymentMatched = false;
  for (var pi = 0; pi < paymentEl.options.length; pi++) {
    if (paymentEl.options[pi].value.toLowerCase() === paymentMethod.toLowerCase()) {
      paymentEl.selectedIndex = pi;
      paymentMatched = true;
      break;
    }
  }
  if (paymentMethod && !paymentMatched) {
    var opt = document.createElement('option');
    opt.value = paymentMethod;
    opt.textContent = paymentMethod;
    paymentEl.appendChild(opt);
    paymentEl.value = paymentMethod;
  }

  const container = document.getElementById('ocrItems');
  container.innerHTML = '';
  const items = (receipt.items && receipt.items.length) ? receipt.items : [{ name: '', name_cn: '', quantity: 1, unit_price: 0, total_price: 0, category_name: '其他' }];
  items.forEach((item, i) => {
    addItemRow(item);
  });
  recalcTotal();
}

function onReviewToggle() {
  var cb = document.getElementById('ocrNeedsReview');
  var btn = document.getElementById('ocrSaveBtn');
  if (cb && cb.checked) {
    btn.style.border = '2px solid #F59E0B';
    btn.textContent = '⚠️ 标记待修改并保存';
  } else {
    btn.style.border = '';
    btn.textContent = '✓ 确认保存';
  }
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
    marker.title = question || '不确定';
  } else if (marker) {
    marker.remove();
  }
}

function addItemRow(item, opts) {
  var container = document.getElementById('ocrItems');
  var nameEn = item ? item.name || '' : '';
  var nameCn = (item && item.name_cn) ? item.name_cn : translateItem(nameEn);
  var qty = item ? item.quantity || 1 : 1;
  var price = item ? item.total_price || 0 : 0;
  var cat = item ? item.category_name || '其他' : '其他';
  var unit = (item && item.unit) || '个';

  var unitHtml = '<select class="ie-unit" onchange="recalcTotal()">';
  for (var ui = 0; ui < unitOptions.length; ui++) {
    unitHtml += '<option value="' + unitOptions[ui] + '" ' + (unit === unitOptions[ui] ? 'selected' : '') + '>' + unitOptions[ui] + '</option>';
  }
  unitHtml += '</select>';

  var catHtml = '<select class="ie-cat" onchange="recalcTotal()">';
  var cats = ['餐饮美食','超市购物','交通出行','日用百货','数码电子','服饰美妆','医疗健康','休闲娱乐','其他'];
  for (var ci = 0; ci < cats.length; ci++) {
    catHtml += '<option value="' + cats[ci] + '" ' + (cat === cats[ci] || (!cat && cats[ci] === '其他') ? 'selected' : '') + '>' + cats[ci] + '</option>';
  }
  catHtml += '</select>';

  var div = document.createElement('div');
  div.className = 'item-editor-row';
  div.innerHTML = [
    '<div class="ie-name-row">',
    '<input type="text" placeholder="中文名称" value="' + esc(nameCn) + '" onchange="recalcTotal()" class="ie-name-cn">',
    '<input type="text" placeholder="English name" value="' + esc(nameEn) + '" onchange="recalcTotal()" class="ie-name-en">',
    '</div>',
    '<input type="number" placeholder="数量" value="' + qty + '" min="1" step="1" onchange="recalcTotal()" class="ie-qty">',
    unitHtml,
    '<input type="number" placeholder="金额" value="' + price + '" step="0.01" onchange="recalcTotal()" class="ie-price">',
    catHtml,
    '<button class="remove-item" onclick="this.parentElement.remove();recalcTotal()" title="删除此行">✕</button>'
  ].join('');
  container.appendChild(div);
}

function recalcTotal() {
  const rows = document.querySelectorAll('#ocrItems .item-editor-row');
  let total = 0;
  rows.forEach(row => { total += parseFloat(row.querySelector('.ie-price').value) || 0; });
  // Auto-update subtotal to match item total
  document.getElementById('ocrSubtotal').value = total ? total.toFixed(2) : '';
  const subtotal = total;
  const discount = parseFloat(document.getElementById('ocrDiscount').value) || 0;
  var tax = parseFloat(document.getElementById('ocrTax').value) || 0;
  var taxIncluded = document.getElementById('ocrTaxIncluded').checked;
  if (taxIncluded) tax = 0;
  var symbol = getCurrencySymbol();
  document.getElementById('ocrCurrencySymbol').textContent = symbol;
  var taxLabel = document.getElementById('ocrTax').parentElement.querySelector('label');
  if (taxLabel) taxLabel.textContent = taxIncluded ? '税费(含)' : '税费';
  document.getElementById('ocrTotalDisplay').textContent = Math.max(0, subtotal + discount + tax).toFixed(2);
  document.getElementById('ocrTotalMismatch').style.display = 'none';
}

async function saveOcrReceipt() {
  const btn = document.getElementById('ocrSaveBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 保存中...';

  try {
    const rows = document.querySelectorAll('#ocrItems .item-editor-row');
    const items = [];
    rows.forEach(row => {
      const nameCn = (row.querySelector('.ie-name-cn')?.value || '').trim();
      const nameEn = (row.querySelector('.ie-name-en')?.value || '').trim();
      if (!nameCn && !nameEn) return;
      const name = nameEn ? (nameCn ? nameCn + ' (' + nameEn + ')' : nameEn) : nameCn;
      items.push({
        name: name,
        quantity: parseFloat(row.querySelector('.ie-qty')?.value) || 1,
        unit_price: parseFloat(row.querySelector('.ie-price')?.value) || 0,
        total_price: parseFloat(row.querySelector('.ie-price')?.value) || 0,
        category_name: row.querySelector('.ie-cat')?.value || '其他',
        unit: row.querySelector('.ie-unit')?.value || '个'
      });
    });

    if (!items.length) {
      showToast('请至少添加一个商品', 'error');
      btn.disabled = false;
      btn.textContent = '✓ 确认保存';
      return;
    }

    const discount = parseFloat(document.getElementById('ocrDiscount')?.value) || 0;
    var tax = parseFloat(document.getElementById('ocrTax')?.value) || 0;
    var taxIncluded = document.getElementById('ocrTaxIncluded')?.checked || false;
    if (taxIncluded) tax = 0;
    const subtotal = parseFloat(document.getElementById('ocrSubtotal')?.value) || 0;
    const itemTotal = items.reduce((s, i) => s + i.total_price, 0);
    const needsReview = document.getElementById('ocrNeedsReview')?.checked || false;

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

    const receiptData = {
      store_name: (document.getElementById('ocrStore')?.value || '').trim(),
      receipt_date: document.getElementById('ocrDate')?.value || '',
      receipt_time: document.getElementById('ocrTime')?.value || '',
      total_amount: Math.max(0, (subtotal || itemTotal) + discount + tax),
      subtotal: subtotal || itemTotal,
      discount_amount: discount,
      tax_amount: tax,
      payment_method: document.getElementById('ocrPayment')?.value || '',
      notes: needsReview ? '需后续修改' : '',
      image_url: imageUrl,
    };

    const receipts = await sbPost('receipts', receiptData);
    const receiptId = receipts[0].id;

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
    btn.disabled = false;
    btn.textContent = '✓ 确认保存';
  }
}

function retakePhoto() {
  document.getElementById('ocrResult').style.display = 'none';
  document.getElementById('ocrLoading').style.display = 'none';
  var area = document.getElementById('uploadArea');
  area.style.display = 'block';
  area.innerHTML = '<div class="upload-icon">📸</div><div class="upload-text">点击拍照或选择图片</div><div class="upload-hint">支持 JPG / PNG 格式</div>';
  area.classList.remove('has-image');
  area.style.cssText = '';
  area.onclick = function() { document.getElementById('fileInput').click(); };
  currentOcrImageFile = null;
  currentOcrFiles = [];
}

// ======================== MANUAL ENTRY ========================
function addManualItemRow(item) {
  const container = document.getElementById('manualItems');
  var nameEn = item ? item.name || '' : '';
  var nameCn = '';
  if (item && item.name_cn) nameCn = item.name_cn;
  else if (item) nameCn = translateItem(item.name);
  var qty = item ? item.quantity || 1 : 1;
  var price = item ? item.total_price || 0 : 0;
  var cat = item ? item.category_name || '其他' : '其他';
  var unit = (item && item.unit) || '个';
  var div = document.createElement('div');
  div.className = 'item-editor-row';
  var unitHtml = '<select class="ie-unit" onchange="calcManualTotal()">';
  for (var ui = 0; ui < unitOptions.length; ui++) {
    unitHtml += '<option value="' + unitOptions[ui] + '" ' + (unit === unitOptions[ui] ? 'selected' : '') + '>' + unitOptions[ui] + '</option>';
  }
  unitHtml += '</select>';
  var catHtml = '<select class="ie-cat" onchange="calcManualTotal()">';
  var cats = ['餐饮美食','超市购物','交通出行','日用百货','数码电子','服饰美妆','医疗健康','休闲娱乐','其他'];
  for (var ci = 0; ci < cats.length; ci++) {
    catHtml += '<option value="' + cats[ci] + '" ' + (cat === cats[ci] || (!cat && cats[ci] === '其他') ? 'selected' : '') + '>' + cats[ci] + '</option>';
  }
  catHtml += '</select>';
  div.innerHTML = [
    '<div class="ie-name-row">',
    '<input type="text" placeholder="中文名称" value="' + esc(nameCn) + '" onchange="calcManualTotal()" class="ie-name-cn">',
    '<input type="text" placeholder="English name" value="' + esc(nameEn) + '" onchange="calcManualTotal()" class="ie-name-en">',
    '</div>',
    '<input type="number" placeholder="数量" value="' + qty + '" min="1" step="1" onchange="calcManualTotal()" class="ie-qty">',
    unitHtml,
    '<input type="number" placeholder="金额" value="' + price + '" step="0.01" onchange="calcManualTotal()" class="ie-price">',
    catHtml,
    '<button class="remove-item" onclick="this.parentElement.remove();calcManualTotal()" title="删除此行">✕</button>'
  ].join('');
  container.appendChild(div);
}

function calcManualTotal() {
  const rows = document.querySelectorAll('#manualItems .item-editor-row');
  let total = 0;
  rows.forEach(row => { total += parseFloat(row.querySelector('.ie-price').value) || 0; });
  // Auto-update subtotal to match item total
  document.getElementById('manualSubtotal').value = total ? total.toFixed(2) : '';
  const subtotal = total;
  const discount = parseFloat(document.getElementById('manualDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('manualTax').value) || 0;
  var c = document.getElementById('manualCurrency');
  var symbol = c ? (currencyMap[c.value] || '€') : '€';
  document.getElementById('manualCurrencySymbol').textContent = symbol;
  document.getElementById('manualTotalDisplay').textContent = Math.max(0, subtotal + discount + tax).toFixed(2);
  document.getElementById('manualTotalMismatch').style.display = 'none';
}

async function saveManualReceipt() {
  const rows = document.querySelectorAll('#manualItems .item-editor-row');
  const items = [];
  rows.forEach(row => {
    const nameCn = (row.querySelector('.ie-name-cn')?.value || '').trim();
    const nameEn = (row.querySelector('.ie-name-en')?.value || '').trim();
    if (!nameCn && !nameEn) return;
    const name = nameEn ? (nameCn ? nameCn + ' (' + nameEn + ')' : nameEn) : nameCn;
    items.push({
      name,
      quantity: parseFloat(row.querySelector('.ie-qty').value) || 1,
      total_price: parseFloat(row.querySelector('.ie-price').value) || 0,
      category_name: row.querySelector('.ie-cat').value || '其他',
      unit: row.querySelector('.ie-unit').value || '个'
    });
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
      total_amount: Math.max(0, (subtotal || itemTotal) + discount + tax),
      subtotal: subtotal || itemTotal,
      discount_amount: discount,
      tax_amount: tax,
      payment_method: document.getElementById('manualPayment').value,
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
    document.getElementById('manualDate').value = new Date().toISOString().split('T')[0];
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
    if (start) allData = allData.filter(r => !r.receipt_date || r.receipt_date >= start);
    if (end) allData = allData.filter(r => !r.receipt_date || r.receipt_date <= end);
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
          <div class="rc-total">${currencyMap[r.currency] || '¥'}${Number(r.total_amount).toFixed(2)}</div>
        </div>
        <div class="rc-meta">
          <span>${r.receipt_date || '--'}</span>
          <span>${(r.receipt_items || []).length} 件商品</span>
          <span>${esc(r.payment_method) || '--'}</span>
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
    var curSym = currencyMap[r.currency] || '€';

    const container = document.getElementById('detailContent');
    const imgHtml = r.image_url ? `<img src="${r.image_url}" style="max-width:120px;max-height:120px;border-radius:6px;margin-bottom:8px;object-fit:cover;cursor:pointer;" onclick="window.open(this.src)" alt="receipt">` : '';
    container.innerHTML = `
      ${imgHtml}
      <div class="detail-header">
        <div class="store-name">${esc(r.store_name || '未知商家')}</div>
        <div class="store-date">${r.receipt_date || ''} ${r.receipt_time || ''}</div>
        <div class="total-amount">${curSym}${Number(r.total_amount).toFixed(2)}</div>
      </div>
      <div class="card">
        <div class="detail-section">
          <h3>🛒 商品明细</h3>
          <ul class="item-list">
            ${(r.receipt_items || []).map(i => `
              <li><span class="item-name">${esc(i.name)}</span><span class="item-qty">×${i.quantity}${i.unit ? i.unit : ''}</span><span class="item-price">${curSym}${Number(i.total_price).toFixed(2)}</span></li>
            `).join('')}
          </ul>
        </div>
      </div>
      <div class="card">
        <div class="detail-section">
          <h3>📄 详细信息</h3>
          <div class="detail-grid">
            <div class="dg-item"><div class="dg-label">小计</div><div class="dg-value">${curSym}${Number(r.subtotal || 0).toFixed(2)}</div></div>
            <div class="dg-item"><div class="dg-label">折扣</div><div class="dg-value">${r.discount_amount ? curSym + Number(r.discount_amount).toFixed(2) : '-'}</div></div>
            <div class="dg-item"><div class="dg-label">税费</div><div class="dg-value">${r.tax_amount ? curSym + Number(r.tax_amount).toFixed(2) : '-'}</div></div>
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
    var curSymbol = currencyMap[r.currency] || '€';

    const container = document.getElementById('editContent');
    container.innerHTML = `
      <h3 style="margin-bottom:16px;">✏️ 编辑账单</h3>
      <div class="form-group"><label>商家名称</label><input id="editStore" value="${esc(r.store_name || '')}"></div>
      <div class="form-row" style="gap:6px;">
        <div class="form-group"><label>日期</label><input type="date" id="editDate" value="${r.receipt_date || ''}" style="font-size:11px;padding:3px 4px;"></div>
        <div class="form-group"><label>时间</label><input type="time" id="editTime" value="${r.receipt_time || ''}" style="font-size:11px;padding:3px 4px;"></div>
      </div>
      <div class="card-title">🛒 商品明细</div>
      <div id="editItems"></div>
      <button class="btn btn-sm btn-outline btn-block" onclick="addEditItemRow()" style="margin-bottom:12px;">+ 添加商品</button>
      <div class="form-row-sm">
        <div class="form-group"><label>小计</label><input type="number" id="editSubtotal" step="0.01" value="${r.subtotal || 0}" onchange="calcEditTotal()" style="font-size:13px;padding:6px 8px;"></div>
        <div class="form-group"><label>折扣</label><input type="number" id="editDiscount" step="0.01" value="${r.discount_amount || 0}" onchange="calcEditTotal()" style="font-size:13px;padding:6px 8px;"></div>
        <div class="form-group"><label>税费</label><input type="number" id="editTax" step="0.01" value="${r.tax_amount || 0}" onchange="calcEditTotal()" style="font-size:13px;padding:6px 8px;"></div>
      </div>
      <div class="currency-payment-row">
        <div class="form-group"><label>货币</label>
          <select id="editCurrency" onchange="calcEditTotal()" style="font-size:13px;padding:8px;">
            <option value="EUR" ${(r.currency||'EUR')==='EUR'?'selected':''}>€ EUR</option>
            <option value="USD" ${r.currency==='USD'?'selected':''}>$ USD</option>
            <option value="GBP" ${r.currency==='GBP'?'selected':''}>£ GBP</option>
            <option value="CNY" ${r.currency==='CNY'?'selected':''}>¥ CNY</option>
            <option value="other" ${r.currency==='other'?'selected':''}>¤ other</option>
          </select>
        </div>
        <div class="form-group"><label>支付方式</label>
          <select id="editPayment" style="font-size:13px;padding:8px;">
            ${function(){
              var defs = ['','Visa','Mastercard','American Express','Debit Card','现金 Cash','微信支付','支付宝','Gift Card','其他 Other'];
              var matched = defs.some(function(p){ return p === (r.payment_method||''); });
              var h = defs.map(function(p){
                var sel = (r.payment_method||'') === p ? 'selected' : '';
                return '<option value="'+p+'" '+sel+'>'+(p||'请选择')+'</option>';
              }).join('');
              if ((r.payment_method||'') && !matched) {
                h += '<option value="'+esc(r.payment_method)+'" selected>'+esc(r.payment_method)+'</option>';
              }
              return h;
            }()}
          </select>
        </div>
      </div>
      <div class="form-group" style="margin-top:4px;">
        <label style="font-size:16px;font-weight:600;"><span id="editCurrencySymbol">${curSymbol}</span> <span id="editTotalDisplay">${Number(r.total_amount || 0).toFixed(2)}</span></label>
      </div>
      <div id="editTotalMismatch" style="font-size:11px;color:#D97706;display:none;margin:4px 0;"></div>
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
  var parsed = parseStoredName(item ? item.name || '' : '');
  var nameCn = parsed.cn;
  var nameEn = parsed.en;
  var qty = item ? item.quantity || 1 : 1;
  var price = item ? item.total_price || 0 : 0;
  var cat = item ? item.category_name || '其他' : '其他';
  var unit = (item && item.unit) || '个';
  var div = document.createElement('div');
  div.className = 'item-editor-row';
  var unitHtml = '<select class="ie-unit" onchange="calcEditTotal()">';
  for (var ui = 0; ui < unitOptions.length; ui++) {
    unitHtml += '<option value="' + unitOptions[ui] + '" ' + (unit === unitOptions[ui] ? 'selected' : '') + '>' + unitOptions[ui] + '</option>';
  }
  unitHtml += '</select>';
  var catHtml = '<select class="ie-cat" onchange="calcEditTotal()">';
  var cats = ['餐饮美食','超市购物','交通出行','日用百货','数码电子','服饰美妆','医疗健康','休闲娱乐','其他'];
  for (var ci = 0; ci < cats.length; ci++) {
    catHtml += '<option value="' + cats[ci] + '" ' + (cat === cats[ci] || (!cat && cats[ci] === '其他') ? 'selected' : '') + '>' + cats[ci] + '</option>';
  }
  catHtml += '</select>';
  div.innerHTML = [
    '<div class="ie-name-row">',
    '<input type="text" placeholder="中文名称" value="' + esc(nameCn) + '" onchange="calcEditTotal()" class="ie-name-cn">',
    '<input type="text" placeholder="English name" value="' + esc(nameEn) + '" onchange="calcEditTotal()" class="ie-name-en">',
    '</div>',
    '<input type="number" placeholder="数量" value="' + qty + '" min="1" step="1" onchange="calcEditTotal()" class="ie-qty">',
    unitHtml,
    '<input type="number" placeholder="金额" value="' + price + '" step="0.01" onchange="calcEditTotal()" class="ie-price">',
    catHtml,
    '<button class="remove-item" onclick="this.parentElement.remove();calcEditTotal()" title="删除此行">✕</button>'
  ].join('');
  container.appendChild(div);
}

function calcEditTotal() {
  const rows = document.querySelectorAll('#editItems .item-editor-row');
  let total = 0;
  rows.forEach(row => { total += parseFloat(row.querySelector('.ie-price').value) || 0; });
  // Auto-update subtotal to match item total
  document.getElementById('editSubtotal').value = total ? total.toFixed(2) : '';
  const subtotal = total;
  const discount = parseFloat(document.getElementById('editDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('editTax').value) || 0;
  var c = document.getElementById('editCurrency');
  var symbol = c ? (currencyMap[c.value] || '€') : '€';
  document.getElementById('editCurrencySymbol').textContent = symbol;
  document.getElementById('editTotalDisplay').textContent = Math.max(0, subtotal + discount + tax).toFixed(2);
  document.getElementById('editTotalMismatch').style.display = 'none';
}

async function saveEditReceipt(id) {
  const rows = document.querySelectorAll('#editItems .item-editor-row');
  const items = [];
  rows.forEach(row => {
    const nameCn = (row.querySelector('.ie-name-cn')?.value || '').trim();
    const nameEn = (row.querySelector('.ie-name-en')?.value || '').trim();
    if (!nameCn && !nameEn) return;
    const name = nameEn ? (nameCn ? nameCn + ' (' + nameEn + ')' : nameEn) : nameCn;
    items.push({
      name, quantity: parseFloat(row.querySelector('.ie-qty').value) || 1,
      total_price: parseFloat(row.querySelector('.ie-price').value) || 0,
      category_name: row.querySelector('.ie-cat').value || '其他',
      unit: row.querySelector('.ie-unit').value || '个'
    });
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
      total_amount: Math.max(0, (subtotal || itemTotal) + discount + tax),
      subtotal: subtotal || itemTotal,
      discount_amount: discount,
      tax_amount: tax,
      payment_method: document.getElementById('editPayment').value,
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
    if (start || end) {
      allData = allData.filter(r => !r.receipt_date || (
        (!start || r.receipt_date >= start) &&
        (!end || r.receipt_date <= end)
      ));
    }

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
  const provider = getProvider();
  const key = getApiKey();
  const el = document.getElementById('apiKeyStatus');
  const label = document.getElementById('apiKeyLabel');
  if (provider === 'local') {
    label.textContent = '🔑 API Key（本地识别无需 Key）';
    el.textContent = '无需配置';
    el.className = 'si-status configured';
    return;
  }
  label.textContent = provider === 'deepseek' ? '🔑 DeepSeek API Key' : provider === 'gemini' ? '🔑 Gemini API Key' : provider === 'openai' ? '🔑 OpenAI API Key' : '🔑 Claude API Key';
  el.textContent = key ? '已配置' : '未配置';
  el.className = 'si-status ' + (key ? 'configured' : 'not-configured');
  // Sync the dropdown
  const sel = document.getElementById('aiProvider');
  if (sel) sel.value = provider;
}

function showApiKeyModal() {
  const provider = getProvider();
  const title = document.getElementById('apiKeyModalTitle');
  const desc = document.getElementById('apiKeyModalDesc');
  const input = document.getElementById('apiKeyInput');
  input.value = '';

  if (provider === 'deepseek') {
    title.textContent = '🔑 配置 DeepSeek API Key';
    desc.innerHTML = '用于小票 OCR 识别，可在 <a href="https://platform.deepseek.com/api_keys" target="_blank" style="color:var(--primary);">DeepSeek Platform</a> 获取';
    input.placeholder = 'sk-...';
  } else if (provider === 'gemini') {
    title.textContent = '🔑 配置 Google Gemini API Key';
    desc.innerHTML = '用于小票 OCR 识别，可在 <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--primary);">Google AI Studio</a> 免费获取';
    input.placeholder = 'AIzaSy...';
  } else if (provider === 'openai') {
    title.textContent = '🔑 配置 OpenAI API Key';
    desc.innerHTML = '用于小票 OCR 识别，可在 <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--primary);">OpenAI Platform</a> 获取';
    input.placeholder = 'sk-...';
  } else {
    title.textContent = '🔑 配置 Claude API Key';
    desc.innerHTML = '用于小票识别，可在 <a href="https://console.anthropic.com/" target="_blank" style="color:var(--primary);">Anthropic Console</a> 获取';
    input.placeholder = 'sk-ant-...';
  }

  document.getElementById('apiKeyModal').classList.add('show');
  const existing = getApiKey();
  if (existing) input.placeholder += '（已配置，输入新值覆盖）';
}

function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { showToast('请输入 API Key', 'error'); return; }
  // Sync provider from dropdown before saving
  syncProviderFromDropdown();
  const provider = getProvider();
  const keyName = provider === 'deepseek' ? 'deepseek_api_key' : provider === 'gemini' ? 'gemini_api_key' : provider === 'openai' ? 'openai_api_key' : 'claude_api_key';
  localStorage.setItem(keyName, key);
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
