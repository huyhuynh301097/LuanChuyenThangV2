/**
 * Direct Transit Operational Dashboard (app.js)
 * Live Google Sheets integration, IndexedDB caching, composite data mapping, and premium browser-side visualization.
 */

// App State configuration
const state = {
  // Raw parsed datasets
  chi_so_tuyen: [],
  chi_so_vung_tinh: [],
  leadtime: [],
  
  // Computed Mapped Routes (Tuyến + Leadtime joined by month & route name)
  mappedRoutes: [],
  
  // Active Filter selection
  filters: {
    month: 'ALL',
    region: 'ALL',
    province: 'ALL',
    search: ''
  },
  
  // Table Pagination & Sorting
  pagination: {
    currentPage: 1,
    pageSize: 15,
    sortedColumn: 'vol',
    sortOrder: 'desc' // 'asc' or 'desc'
  },
  
  // Focus Rank Selection: 'province', 'route', or 'opportunity'
  activeFocusTab: 'province',
  
  // Active Chart Type: 'kpi' or 'leadtime'
  activeChartType: 'kpi',
  
  // Chart.js instance pointer
  chartInstance: null
};

// Google Sheet Source Configurations
const GOOGLE_SHEET = {
  id: '1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk'
};

// ----------------------------------------------------
// INDEXEDDB ENGINE - LOCAL DATA CACHE
// ----------------------------------------------------
const DB_NAME = 'GHN_LuanChuyenThang_DB';
const DB_VERSION = 1;
const STORE_NAME = 'operational_data';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getCachedData(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('IndexedDB Get Error:', err);
    return null;
  }
}

async function setCachedData(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('IndexedDB Put Error:', err);
    return false;
  }
}

// ----------------------------------------------------
// UTILITIES & DATA PARSERS
// ----------------------------------------------------

// Parse custom formatted percentage strings into float numbers (e.g. "51.43%" -> 0.5143)
function parsePercent(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleanVal = String(val).replace(/%/g, '').trim();
  const num = parseFloat(cleanVal);
  return isNaN(num) ? 0 : num / 100;
}

// Parse string numbers with comma separation into float values (e.g. "2,210" -> 2210)
function parseNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleanVal = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleanVal);
  return isNaN(num) ? 0 : num;
}

// JSONP Request Helper to bypass CORS restrictions
function fetchSheetJSONP(sheetName, callbackName) {
  return new Promise((resolve, reject) => {
    const scriptId = 'jsonp_' + sheetName.replace(/[^a-zA-Z0-9]/g, '') + '_' + new Date().getTime();
    
    // Define the global callback function
    window[callbackName] = function(data) {
      // Clean up script tag and global callback
      const scriptEl = document.getElementById(scriptId);
      if (scriptEl) scriptEl.remove();
      delete window[callbackName];
      resolve(data);
    };
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET.id}/gviz/tq?tqx=responseHandler:${callbackName}&sheet=${encodeURIComponent(sheetName)}`;
    
    script.onerror = (err) => {
      const scriptEl = document.getElementById(scriptId);
      if (scriptEl) scriptEl.remove();
      delete window[callbackName];
      reject(new Error(`Failed to load sheet "${sheetName}" via JSONP. Please verify Google Sheet link/sharing permissions.`));
    };
    
    document.body.appendChild(script);
  });
}

// Parse the GViz JSON structure returned from Google Sheets Query
function parseGvizTable(tableData) {
  try {
    if (!tableData || !tableData.table) return [];
    
    const cols = tableData.table.cols;
    return tableData.table.rows.map(row => {
      const item = {};
      row.c.forEach((cell, i) => {
        if (i >= cols.length) return;
        const colLabel = cols[i].label || cols[i].id;
        if (cell) {
          // If it's a date or custom formatted field, check cell.f or cell.v
          item[colLabel] = cell.f !== undefined ? cell.f : cell.v;
        } else {
          item[colLabel] = null;
        }
      });
      return item;
    });
  } catch (err) {
    console.error('Error parsing GViz Table data:', err);
    return [];
  }
}

// ----------------------------------------------------
// SYNCHRONIZATION ENGINE
// ----------------------------------------------------
async function syncLiveSheetData() {
  const overlay = document.getElementById('syncOverlay');
  const progressFill = document.getElementById('syncProgressFill');
  const progressText = document.getElementById('syncProgressText');
  const syncBtn = document.getElementById('syncBtn');
  
  // Show UI synchronization loader modal
  overlay.classList.add('active');
  syncBtn.disabled = true;
  syncBtn.classList.add('syncing');
  
  const updateProgress = (percentage, statusText) => {
    progressFill.style.width = percentage + '%';
    progressText.innerText = statusText + `: ${percentage}%`;
  };

  try {
    // Step 1: Fetch and parse Route indicators (chi_so_tuyen) via JSONP
    updateProgress(10, 'Đang tải Chỉ Số Tuyến (JSONP)...');
    const resTuyen = await fetchSheetJSONP('chi_so_tuyen', 'onTuyenLoaded');
    updateProgress(35, 'Đang xử lý Chỉ Số Tuyến...');
    const parsedTuyen = parseGvizTable(resTuyen).map(row => ({
      thang: row.thang,
      vung_lay: row.vung_lay,
      vung_giao: row.vung_giao,
      tuyen: row.tuyen,
      vol: parseNumber(row.vol),
      kl: parseNumber(row.kl),
      pct_opr: parsePercent(row.pct_opr),
      pct_rot_lc: parsePercent(row.pct_rot_lc),
      pct_odr: parsePercent(row.pct_odr),
      pct_longtail: parsePercent(row.pct_longtail)
    }));

    // Step 2: Fetch and parse Province indicators (chi_so_vung_tinh) via JSONP
    updateProgress(50, 'Đang tải Chỉ Số Tỉnh (JSONP)...');
    const resTinh = await fetchSheetJSONP('chi_so_vung_tinh', 'onTinhLoaded');
    updateProgress(65, 'Đang xử lý Chỉ Số Tỉnh...');
    const parsedTinh = parseGvizTable(resTinh).map(row => ({
      thang: row.thang,
      vung_lay: row.vung_lay,
      tinh_lay: row.tinh_lay,
      vol: parseNumber(row.vol),
      kl: parseNumber(row.kl),
      pct_opr: parsePercent(row.pct_opr),
      pct_rot_lc: parsePercent(row.pct_rot_lc),
      pct_odr: parsePercent(row.pct_odr),
      pct_longtail: parsePercent(row.pct_longtail)
    }));

    // Step 3: Fetch and parse speed metrics (leadtime) via JSONP
    updateProgress(75, 'Đang tải Leadtime Tuyến (JSONP)...');
    const resLt = await fetchSheetJSONP('leadtime', 'onLtLoaded');
    updateProgress(90, 'Đang xử lý Leadtime Tuyến...');
    const parsedLt = parseGvizTable(resLt).map(row => ({
      thang: row.thang,
      tuyen: row.tuyen,
      so_don: parseNumber(row.so_don),
      pct_1ktc: parsePercent(row.pct_1ktc),
      pct_2ktc: parsePercent(row.pct_2ktc),
      lt_xuat_bclay_nhap_ktc1: parseNumber(row.lt_xuat_bclay_nhap_ktc1),
      lt_ktc1_ktc2: parseNumber(row.lt_ktc1_ktc2),
      lt_ktc_cuoi_nhap_bcgiao: parseNumber(row.lt_ktc_cuoi_nhap_bcgiao),
      lt_tong: parseNumber(row.lt_tong)
    }));

    // Step 4: Write to IndexedDB Cache
    updateProgress(95, 'Đang lưu vào bộ nhớ cache local...');
    await setCachedData('chi_so_tuyen', parsedTuyen);
    await setCachedData('chi_so_vung_tinh', parsedTinh);
    await setCachedData('leadtime', parsedLt);
    await setCachedData('sync_timestamp', new Date().getTime());

    // Update global state pointers
    state.chi_so_tuyen = parsedTuyen;
    state.chi_so_vung_tinh = parsedTinh;
    state.leadtime = parsedLt;
    
    updateProgress(100, 'Đồng bộ hoàn thành!');
    setTimeout(() => {
      overlay.classList.remove('active');
      syncBtn.disabled = false;
      syncBtn.classList.remove('syncing');
      
      // Perform computation mapping and rebuild UI
      processAndMapData();
    }, 800);

  } catch (err) {
    console.error('Synchronization failed:', err);
    document.getElementById('syncStatusTitle').innerText = 'Đồng bộ thất bại!';
    document.getElementById('syncStatusSub').innerText = 'Lỗi: ' + err.message + '. Vui lòng kiểm tra lại kết nối mạng hoặc quyền chia sẻ của Google Sheet.';
    progressFill.style.backgroundColor = 'hsl(var(--danger))';
    
    // Clear any previous close buttons to avoid duplicates
    const oldCloseBtn = document.getElementById('syncCloseBtn');
    if (oldCloseBtn) oldCloseBtn.remove();
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'page-btn';
    closeBtn.id = 'syncCloseBtn';
    closeBtn.style.margin = '20px auto 0';
    closeBtn.innerText = 'Đóng';
    closeBtn.onclick = () => {
      overlay.classList.remove('active');
      syncBtn.disabled = false;
      syncBtn.classList.remove('syncing');
      closeBtn.remove();
    };
    document.querySelector('.sync-modal').appendChild(closeBtn);
  }

// ----------------------------------------------------
// DATA PROCESSING & COMPOSITE MAPPING ENGINE
// ----------------------------------------------------
function processAndMapData() {
  const routes = state.chi_so_tuyen;
  const leadtimes = state.leadtime;
  
  // Step 1: Create a hashmap of leadtimes for O(1) matching by {thang, tuyen}
  const leadtimeMap = new Map();
  leadtimes.forEach(lt => {
    const key = `${lt.thang}_${lt.tuyen}`;
    leadtimeMap.set(key, lt);
  });
  
  // Step 2: Join leadtime data into routes
  state.mappedRoutes = routes.map(route => {
    const matchKey = `${route.thang}_${route.tuyen}`;
    const lt = leadtimeMap.get(matchKey);
    
    // Extract origin province name (tinh_lay) from the route string (e.g. "Hà Tĩnh - Nghệ An" -> "Hà Tĩnh")
    const tinh_lay = route.tuyen.split('-')[0].trim();
    
    return {
      ...route,
      tinh_lay: tinh_lay,
      so_don: lt ? lt.so_don : 0,
      pct_1ktc: lt ? lt.pct_1ktc : 0,
      pct_2ktc: lt ? lt.pct_2ktc : 0,
      lt_xuat_bclay_nhap_ktc1: lt ? lt.lt_xuat_bclay_nhap_ktc1 : 0,
      lt_ktc1_ktc2: lt ? lt.lt_ktc1_ktc2 : 0,
      lt_ktc_cuoi_nhap_bcgiao: lt ? lt.lt_ktc_cuoi_nhap_bcgiao : 0,
      lt_tong: lt ? lt.lt_tong : 0,
      isMapped: !!lt
    };
  });
  
  // Step 3: Populate filter select options dynamically
  populateFilterOptions();
  
  // Step 4: Reset UI Views
  state.pagination.currentPage = 1;
  updateDashboardUI();
}

// Populate Filter fields adaptively based on current dataset values
function populateFilterOptions() {
  const months = [...new Set(state.mappedRoutes.map(r => r.thang))].sort().reverse();
  const regions = [...new Set(state.mappedRoutes.map(r => r.vung_lay))].sort();
  
  const monthSelect = document.getElementById('monthFilter');
  const regionSelect = document.getElementById('regionFilter');
  
  // Save current values to preserve selection state if possible
  const prevMonth = monthSelect.value;
  const prevRegion = regionSelect.value;
  
  monthSelect.innerHTML = '<option value="ALL">Tất cả các tháng</option>';
  months.forEach(m => {
    monthSelect.innerHTML += `<option value="${m}">Tháng ${m}</option>`;
  });
  
  regionSelect.innerHTML = '<option value="ALL">Tất cả các vùng</option>';
  regions.forEach(r => {
    regionSelect.innerHTML += `<option value="${r}">Vùng ${r}</option>`;
  });
  
  // Re-apply values if they still exist
  if (months.includes(prevMonth)) monthSelect.value = prevMonth;
  if (regions.includes(prevRegion)) regionSelect.value = prevRegion;
  
  state.filters.month = monthSelect.value;
  state.filters.region = regionSelect.value;
  
  populateProvinceFilter();
}

function populateProvinceFilter() {
  const activeRegion = state.filters.region;
  let filteredRoutes = state.mappedRoutes;
  
  if (activeRegion !== 'ALL') {
    filteredRoutes = filteredRoutes.filter(r => r.vung_lay === activeRegion);
  }
  
  const provinces = [...new Set(filteredRoutes.map(r => r.tinh_lay))].sort();
  const provinceSelect = document.getElementById('provinceFilter');
  const prevProvince = provinceSelect.value;
  
  provinceSelect.innerHTML = '<option value="ALL">Tất cả các tỉnh</option>';
  provinces.forEach(p => {
    provinceSelect.innerHTML += `<option value="${p}">${p}</option>`;
  });
  
  if (provinces.includes(prevProvince)) provinceSelect.value = prevProvince;
  state.filters.province = provinceSelect.value;
}

// ----------------------------------------------------
// CORE UI RENDERING ENGINE
// ----------------------------------------------------

// Applies filters, updates metrics, focus ranks, trends chart, and the operational grid
function updateDashboardUI() {
  // 1. Filter the mapped dataset
  const filteredData = getFilteredData();
  
  // 2. Render KPI Stats Cards
  renderKPICards(filteredData);
  
  // 3. Render Focus Priorities Rank List
  renderFocusRankList(filteredData);
  
  // 4. Render Trends Charts (Chart.js)
  renderTrendsChart();
  
  // 5. Render Data Table Grid & Pagination
  renderDataTable(filteredData);
}

// Filter dataset based on selected drop-downs & search inputs
function getFilteredData() {
  return state.mappedRoutes.filter(row => {
    const matchMonth = state.filters.month === 'ALL' || row.thang === state.filters.month;
    const matchRegion = state.filters.region === 'ALL' || row.vung_lay === state.filters.region;
    const matchProvince = state.filters.province === 'ALL' || row.tinh_lay === state.filters.province;
    
    let matchSearch = true;
    if (state.filters.search) {
      const searchLower = state.filters.search.toLowerCase();
      matchSearch = row.tuyen.toLowerCase().includes(searchLower) ||
                    row.tinh_lay.toLowerCase().includes(searchLower);
    }
    
    return matchMonth && matchRegion && matchProvince && matchSearch;
  });
}

// Aggregate metrics and populate KPI values
function renderKPICards(data) {
  if (data.length === 0) {
    document.getElementById('kpiVol').innerText = '0';
    document.getElementById('kpiOpr').innerText = '0.0%';
    document.getElementById('kpiRotLc').innerText = '0.0%';
    document.getElementById('kpiOdr').innerText = '0.0%';
    document.getElementById('kpiLeadtime').innerText = '0h';
    
    ['kpiVolTrend', 'kpiOprTrend', 'kpiRotLcTrend', 'kpiOdrTrend', 'kpiLeadtimeTrend'].forEach(id => {
      document.getElementById(id).innerHTML = '-';
    });
    return;
  }
  
  let totalVol = 0;
  let totalKl = 0;
  let weightedOprSum = 0;
  let weightedRotLcSum = 0;
  let weightedOdrSum = 0;
  let weightedLtSum = 0;
  let ltCount = 0;
  
  data.forEach(r => {
    totalVol += r.vol;
    totalKl += r.kl;
    weightedOprSum += r.pct_opr * r.vol;
    weightedRotLcSum += r.pct_rot_lc * r.vol;
    weightedOdrSum += r.pct_odr * r.vol;
    
    if (r.isMapped && r.lt_tong > 0) {
      weightedLtSum += r.lt_tong * r.vol;
      ltCount += r.vol;
    }
  });
  
  const avgOpr = totalVol > 0 ? (weightedOprSum / totalVol) : 0;
  const avgRotLc = totalVol > 0 ? (weightedRotLcSum / totalVol) : 0;
  const avgOdr = totalVol > 0 ? (weightedOdrSum / totalVol) : 0;
  const avgLeadtime = ltCount > 0 ? (weightedLtSum / ltCount) : 0;
  
  // Populate Card Values
  document.getElementById('kpiVol').innerText = totalVol.toLocaleString('vi-VN');
  document.getElementById('kpiOpr').innerText = (avgOpr * 100).toFixed(2) + '%';
  document.getElementById('kpiRotLc').innerText = (avgRotLc * 100).toFixed(2) + '%';
  document.getElementById('kpiOdr').innerText = (avgOdr * 100).toFixed(2) + '%';
  document.getElementById('kpiLeadtime').innerText = avgLeadtime > 0 ? avgLeadtime.toFixed(1) + 'h' : '-';
  
  // Render visual trend thresholds comparison to safe baselines
  const formatTrend = (val, isPercentage, threshold, isNegativeTrend = false) => {
    let stateClass = '';
    let symbol = '';
    
    const checkValue = isPercentage ? val * 100 : val;
    
    if (isNegativeTrend) {
      // For negative indicators (e.g. drop rates) -> lower is better
      stateClass = checkValue <= threshold ? 'trend-up' : 'trend-down';
      symbol = checkValue <= threshold ? '✓ Tốt' : '⚠ Cao';
    } else {
      // For positive indicators -> higher is better
      stateClass = checkValue >= threshold ? 'trend-up' : 'trend-down';
      symbol = checkValue >= threshold ? '✓ Tốt' : '⚠ Yếu';
    }
    
    const targetText = isPercentage ? `${threshold}%` : `${threshold}h`;
    return `<span class="${stateClass}">${symbol} (Target: ${targetText})</span>`;
  };
  
  document.getElementById('kpiVolTrend').innerHTML = `<span class="trend-up">Khối lượng: ${Math.round(totalKl).toLocaleString('vi-VN')} kg</span>`;
  document.getElementById('kpiOprTrend').innerHTML = formatTrend(avgOpr, true, 55); // OPR target >= 55%
  document.getElementById('kpiRotLcTrend').innerHTML = formatTrend(avgRotLc, true, 3.5, true); // Rớt LC <= 3.5%
  document.getElementById('kpiOdrTrend').innerHTML = formatTrend(avgOdr, true, 80); // ODR target >= 80%
  document.getElementById('kpiLeadtimeTrend').innerHTML = avgLeadtime > 0 ? formatTrend(avgLeadtime, false, 24, true) : '-'; // Leadtime <= 24h
}

// Calculate and render focus rankings for provinces and routes
function renderFocusRankList(data) {
  const rankContainer = document.getElementById('rankList');
  rankContainer.innerHTML = '';
  
  if (data.length === 0) {
    rankContainer.innerHTML = '<div class="empty-state">Không tìm thấy tuyến trùng khớp bộ lọc để lập bảng phân tích.</div>';
    return;
  }
  
  const type = state.activeFocusTab;
  
  if (type === 'province') {
    // Group routes by province and aggregate metrics to compute weighted focus scores
    const provincesMap = new Map();
    data.forEach(r => {
      if (!provincesMap.has(r.tinh_lay)) {
        provincesMap.set(r.tinh_lay, {
          tinh: r.tinh_lay,
          vung: r.vung_lay,
          vol: 0,
          rotLcSum: 0,
          odrSum: 0
        });
      }
      const item = provincesMap.get(r.tinh_lay);
      item.vol += r.vol;
      item.rotLcSum += r.pct_rot_lc * r.vol;
      item.odrSum += r.pct_odr * r.vol;
    });
    
    const provinceList = Array.from(provincesMap.values()).map(p => {
      const avgRotLc = p.vol > 0 ? (p.rotLcSum / p.vol) : 0;
      const avgOdr = p.vol > 0 ? (p.odrSum / p.vol) : 0;
      
      // Focus Score: high vol, high drop rates, low delivery on time rates.
      // Score = vol * avgRotLc * (1 - avgOdr)
      const score = p.vol * avgRotLc * (1 - avgOdr);
      
      return {
        ...p,
        avgRotLc,
        avgOdr,
        score: Math.round(score * 100) / 100
      };
    }).sort((a, b) => b.score - a.score);
    
    // Render top 5 provinces
    const topProvinces = provinceList.slice(0, 5);
    if (topProvinces.length === 0 || topProvinces[0].vol === 0) {
      rankContainer.innerHTML = '<div class="empty-state">Dữ liệu vận hành các tỉnh hiện tại đều ổn định hoặc không có sản lượng.</div>';
      return;
    }
    
    topProvinces.forEach((p, idx) => {
      const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-default';
      rankContainer.innerHTML += `
        <div class="rank-item">
          <div class="rank-item-left">
            <div class="rank-badge ${rankClass}">${idx + 1}</div>
            <div class="rank-name-container">
              <span class="rank-name">${p.tinh} (Vùng ${p.vung})</span>
              <span class="rank-subtext">Sản lượng: ${p.vol.toLocaleString('vi-VN')} | Rớt LC: ${(p.avgRotLc*100).toFixed(2)}% | ODR: ${(p.avgOdr*100).toFixed(1)}%</span>
            </div>
          </div>
          <div class="rank-item-right">
            <span class="rank-score">${p.score.toLocaleString('vi-VN')}</span>
            <span class="rank-score-label">Focus Score</span>
          </div>
        </div>
      `;
    });
    
  } else if (type === 'route') {
    // Score routes directly
    const routeList = data.map(r => {
      const score = r.vol * r.pct_rot_lc * (1 - r.pct_odr);
      return {
        tuyen: r.tuyen,
        thang: r.thang,
        vol: r.vol,
        rotLc: r.pct_rot_lc,
        odr: r.pct_odr,
        score: Math.round(score * 100) / 100
      };
    }).sort((a, b) => b.score - a.score);
    
    const topRoutes = routeList.slice(0, 5);
    if (topRoutes.length === 0 || topRoutes[0].score === 0) {
      rankContainer.innerHTML = '<div class="empty-state">Không phát hiện tuyến vận hành kém cần tập trung.</div>';
      return;
    }
    
    topRoutes.forEach((r, idx) => {
      const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-default';
      rankContainer.innerHTML += `
        <div class="rank-item">
          <div class="rank-item-left">
            <div class="rank-badge ${rankClass}">${idx + 1}</div>
            <div class="rank-name-container">
              <span class="rank-name">${r.tuyen}</span>
              <span class="rank-subtext">T. ${r.thang} | Sản lượng: ${r.vol.toLocaleString('vi-VN')} | Rớt LC: ${(r.rotLc*100).toFixed(2)}% | ODR: ${(r.odr*100).toFixed(1)}%</span>
            </div>
          </div>
          <div class="rank-item-right">
            <span class="rank-score">${r.score.toLocaleString('vi-VN')}</span>
            <span class="rank-score-label">Focus Score</span>
          </div>
        </div>
      `;
    });
    
  } else if (type === 'opportunity') {
    // Opportunity areas: High failure metrics (Rớt LC > 5% or ODR < 70%) but very low volume (vol < 100).
    // These are excellent candidates to request additional volume from partners.
    const opportunities = data.filter(r => r.vol < 120 && (r.pct_rot_lc > 0.05 || r.pct_odr < 0.70))
      .map(r => {
        // Opportunity Score represents operational weakness combined with low volume (higher score is better candidate to ask for volume)
        // Opp Score = (Rớt LC * (1 - ODR)) / (vol + 1)
        const score = (r.pct_rot_lc * (1 - r.pct_odr) * 10000) / (r.vol + 1);
        return {
          tuyen: r.tuyen,
          thang: r.thang,
          vol: r.vol,
          rotLc: r.pct_rot_lc,
          odr: r.pct_odr,
          score: Math.round(score * 100) / 100
        };
      }).sort((a, b) => b.score - a.score);
    
    const topOpportunities = opportunities.slice(0, 5);
    if (topOpportunities.length === 0) {
      rankContainer.innerHTML = '<div class="empty-state">Không tìm thấy tuyến sản lượng thấp, vận hành yếu cần gom shop gộp sản lượng.</div>';
      return;
    }
    
    topOpportunities.forEach((r, idx) => {
      const rankClass = 'rank-default';
      rankContainer.innerHTML += `
        <div class="rank-item">
          <div class="rank-item-left">
            <div class="rank-badge ${rankClass}">⚡</div>
            <div class="rank-name-container">
              <span class="rank-name">${r.tuyen}</span>
              <span class="rank-subtext">T. ${r.thang} | Sản lượng hiện tại: <b>${r.vol}</b> đơn | Rớt LC: ${(r.rotLc*100).toFixed(1)}% | ODR: ${(r.odr*100).toFixed(1)}%</span>
            </div>
          </div>
          <div class="rank-item-right">
            <span class="rank-score rank-score-opportunity">${r.score.toFixed(1)}</span>
            <span class="rank-score-label">Gom Shop Score</span>
          </div>
        </div>
      `;
    });
  }
}

// Render the historical trend charts using Chart.js
function renderTrendsChart() {
  const ctx = document.getElementById('trendsChart').getContext('2d');
  
  // 1. Group mappedRoutes by month to build aggregated timeline data
  const monthsMap = new Map();
  state.mappedRoutes.forEach(r => {
    if (!monthsMap.has(r.thang)) {
      monthsMap.set(r.thang, {
        thang: r.thang,
        vol: 0,
        oprSum: 0,
        rotLcSum: 0,
        odrSum: 0,
        ltSum: 0,
        ltVol: 0
      });
    }
    const item = monthsMap.get(r.thang);
    item.vol += r.vol;
    item.oprSum += r.pct_opr * r.vol;
    item.rotLcSum += r.pct_rot_lc * r.vol;
    item.odrSum += r.pct_odr * r.vol;
    
    if (r.isMapped && r.lt_tong > 0) {
      item.ltSum += r.lt_tong * r.vol;
      item.ltVol += r.vol;
    }
  });
  
  const timelineData = Array.from(monthsMap.values()).map(m => ({
    thang: m.thang,
    vol: m.vol,
    avgOpr: m.vol > 0 ? (m.oprSum / m.vol) : 0,
    avgRotLc: m.vol > 0 ? (m.rotLcSum / m.vol) : 0,
    avgOdr: m.vol > 0 ? (m.odrSum / m.vol) : 0,
    avgLt: m.ltVol > 0 ? (m.ltSum / m.ltVol) : 0
  })).sort((a, b) => a.thang.localeCompare(b.thang)); // sort chronological
  
  const labels = timelineData.map(t => 'Tháng ' + t.thang);
  
  // Destroy previous Chart instance if active
  if (state.chartInstance) {
    state.chartInstance.destroy();
  }
  
  const isKpiChart = state.activeChartType === 'kpi';
  
  let chartData = {};
  if (isKpiChart) {
    chartData = {
      labels: labels,
      datasets: [
        {
          label: 'Tỷ lệ xử lý (OPR)',
          data: timelineData.map(t => (t.avgOpr * 100).toFixed(1)),
          borderColor: 'rgb(16, 185, 129)', // Emerald Success
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Rớt luân chuyển (LC)',
          data: timelineData.map(t => (t.avgRotLc * 100).toFixed(1)),
          borderColor: 'rgb(239, 68, 68)', // Coral Warning
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 3,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Đúng hạn (ODR)',
          data: timelineData.map(t => (t.avgOdr * 100).toFixed(1)),
          borderColor: 'rgb(99, 102, 241)', // Indigo primary
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 3,
          tension: 0.3,
          fill: true
        }
      ]
    };
  } else {
    // Dual y-axis leadtime vs volume chart
    chartData = {
      labels: labels,
      datasets: [
        {
          label: 'Leadtime trung bình (Giờ)',
          data: timelineData.map(t => t.avgLt.toFixed(1)),
          borderColor: 'rgb(245, 158, 11)', // Amber Warning
          backgroundColor: 'rgba(245, 158, 11, 0.2)',
          borderWidth: 3,
          tension: 0.2,
          yAxisID: 'y'
        },
        {
          label: 'Tổng sản lượng đơn',
          data: timelineData.map(t => t.vol),
          type: 'bar',
          backgroundColor: 'rgba(6, 182, 212, 0.3)', // Cyan secondary alpha
          borderColor: 'rgb(6, 182, 212)',
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: 'y1'
        }
      ]
    };
  }
  
  state.chartInstance = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8', // slate-400 text
            font: { family: 'Inter', size: 11 }
          }
        },
        tooltip: {
          padding: 12,
          bodySpacing: 6
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { 
            color: '#94a3b8', 
            font: { family: 'Inter' },
            callback: function(value) {
              return isKpiChart ? value + '%' : value + 'h';
            }
          },
          title: {
            display: !isKpiChart,
            text: 'Leadtime (Giờ)',
            color: '#94a3b8'
          }
        },
        ...(isKpiChart ? {} : {
          y1: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false }, // avoid grid overlap
            ticks: { color: '#94a3b8' },
            title: {
              display: true,
              text: 'Sản lượng đơn (Vol)',
              color: '#94a3b8'
            }
          }
        })
      }
    }
  });
}

// Render the Mapped Route Operational Data Grid Table
function renderDataTable(data) {
  const tableBody = document.getElementById('dataTableBody');
  tableBody.innerHTML = '';
  
  if (data.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="11" class="empty-state" style="text-align: center; padding: 48px;">Không tìm thấy tuyến đường nào phù hợp với bộ lọc đang chọn.</td></tr>';
    document.getElementById('tableInfo').innerText = 'Hiển thị 0 - 0 trong tổng số 0 dòng';
    document.getElementById('paginationControls').innerHTML = '';
    return;
  }
  
  // 1. Sort the dataset
  const col = state.pagination.sortedColumn;
  const order = state.pagination.sortOrder;
  
  const sortedData = [...data].sort((a, b) => {
    let valA = a[col];
    let valB = b[col];
    
    // Sort text strings case-insensitive
    if (typeof valA === 'string') {
      return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    
    // Sort numerical values
    valA = valA || 0;
    valB = valB || 0;
    return order === 'asc' ? valA - valB : valB - valA;
  });
  
  // 2. Paginate
  const totalItems = sortedData.length;
  const pageSize = state.pagination.pageSize;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  // Bound check page number
  if (state.pagination.currentPage > totalPages) {
    state.pagination.currentPage = totalPages;
  }
  if (state.pagination.currentPage < 1) {
    state.pagination.currentPage = 1;
  }
  
  const curPage = state.pagination.currentPage;
  const startIndex = (curPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedData = sortedData.slice(startIndex, endIndex);
  
  // 3. Render page rows
  paginatedData.forEach(row => {
    // Formatted Badges
    const getBadge = (val, thresholds) => {
      const pct = val * 100;
      let scoreClass = 'good';
      if (pct < thresholds.good) scoreClass = 'bad';
      else if (pct < thresholds.excellent) scoreClass = 'fair';
      return `<span class="badge-metric ${scoreClass}">${(pct).toFixed(1)}%</span>`;
    };
    
    const rotLcBadge = (() => {
      const pct = row.pct_rot_lc * 100;
      let scoreClass = 'good';
      if (pct > 5.0) scoreClass = 'bad'; // Drop rate > 5% is critical
      else if (pct > 3.0) scoreClass = 'fair';
      return `<span class="badge-metric ${scoreClass}">${(pct).toFixed(1)}%</span>`;
    })();
    
    const leadtimeText = row.isMapped && row.lt_tong > 0 ? 
      `<span style="font-weight: 600; color: hsl(var(--text-primary));">${row.lt_tong.toFixed(1)}h</span>` : 
      '<span style="color: hsl(var(--text-muted)); font-style: italic;">No Map</span>';
      
    const ktc1Text = row.isMapped ? (row.pct_1ktc * 100).toFixed(0) + '%' : '-';
    const ktc2Text = row.isMapped ? (row.pct_2ktc * 100).toFixed(0) + '%' : '-';
    
    tableBody.innerHTML += `
      <tr>
        <td>${row.thang}</td>
        <td>${row.vung_lay} ➜ ${row.vung_giao}</td>
        <td class="route-text">${row.tuyen}</td>
        <td style="font-weight: 600;">${row.vol.toLocaleString('vi-VN')}</td>
        <td>${getBadge(row.pct_opr, { good: 50, excellent: 60 })}</td>
        <td>${rotLcBadge}</td>
        <td>${getBadge(row.pct_odr, { good: 75, excellent: 85 })}</td>
        <td>${(row.pct_longtail * 100).toFixed(1)}%</td>
        <td>${leadtimeText}</td>
        <td>${ktc1Text}</td>
        <td>${ktc2Text}</td>
      </tr>
    `;
  });
  
  // 4. Update table info footer
  document.getElementById('tableInfo').innerText = `Hiển thị ${startIndex + 1} - ${endIndex} trong tổng số ${totalItems.toLocaleString('vi-VN')} dòng`;
  
  // 5. Render Pagination Controls
  renderPaginationButtons(totalPages);
}

function renderPaginationButtons(totalPages) {
  const container = document.getElementById('paginationControls');
  container.innerHTML = '';
  
  const curPage = state.pagination.currentPage;
  
  // Left Prev button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.innerHTML = '‹';
  prevBtn.disabled = curPage === 1;
  prevBtn.onclick = () => {
    state.pagination.currentPage--;
    renderDataTable(getFilteredData());
  };
  container.appendChild(prevBtn);
  
  // Page number button layout
  const startPage = Math.max(1, curPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  
  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (i === curPage ? ' page-active' : '');
    btn.innerText = i;
    btn.onclick = () => {
      state.pagination.currentPage = i;
      renderDataTable(getFilteredData());
    };
    container.appendChild(btn);
  }
  
  // Right Next button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.innerHTML = '›';
  nextBtn.disabled = curPage === totalPages;
  nextBtn.onclick = () => {
    state.pagination.currentPage++;
    renderDataTable(getFilteredData());
  };
  container.appendChild(nextBtn);
}

// ----------------------------------------------------
// EXPORTING TO CSV UTILITY
// ----------------------------------------------------
function exportMappedRoutesToCSV() {
  const data = getFilteredData();
  if (data.length === 0) return;
  
  const headers = ['thang', 'vung_lay', 'vung_giao', 'tuyen', 'vol', 'kl', 'pct_opr', 'pct_rot_lc', 'pct_odr', 'pct_longtail', 'lt_tong', 'pct_1ktc', 'pct_2ktc', 'lt_xuat_bclay_nhap_ktc1', 'lt_ktc1_ktc2', 'lt_ktc_cuoi_nhap_bcgiao'];
  
  let csvContent = '\uFEFF'; // Add BOM for Excel UTF-8 support
  csvContent += headers.join(',') + '\n';
  
  data.forEach(r => {
    const row = [
      r.thang,
      r.vung_lay,
      r.vung_giao,
      `"${r.tuyen}"`,
      r.vol,
      r.kl,
      (r.pct_opr * 100).toFixed(2) + '%',
      (r.pct_rot_lc * 100).toFixed(2) + '%',
      (r.pct_odr * 100).toFixed(2) + '%',
      (r.pct_longtail * 100).toFixed(2) + '%',
      r.isMapped ? r.lt_tong.toFixed(2) : '',
      r.isMapped ? (r.pct_1ktc * 100).toFixed(0) + '%' : '',
      r.isMapped ? (r.pct_2ktc * 100).toFixed(0) + '%' : '',
      r.isMapped ? r.lt_xuat_bclay_nhap_ktc1.toFixed(2) : '',
      r.isMapped ? r.lt_ktc1_ktc2.toFixed(2) : '',
      r.isMapped ? r.lt_ktc_cuoi_nhap_bcgiao.toFixed(2) : ''
    ];
    csvContent += row.join(',') + '\n';
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `GHN_Mapped_Operational_DB_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ----------------------------------------------------
// SYSTEM INITIALIZATION & EVENT LISTENERS
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  
  // 1. Initial Data Loading: Load from IndexedDB Cache first
  const cachedTuyen = await getCachedData('chi_so_tuyen');
  const cachedTinh = await getCachedData('chi_so_vung_tinh');
  const cachedLt = await getCachedData('leadtime');
  
  if (cachedTuyen && cachedTinh && cachedLt) {
    state.chi_so_tuyen = cachedTuyen;
    state.chi_so_vung_tinh = cachedTinh;
    state.leadtime = cachedLt;
    
    // Process mappings and build UI
    processAndMapData();
  } else {
    // If no cache, trigger synchronization automatically on first run
    syncLiveSheetData();
  }
  
  // 2. Wire synchronization click event
  document.getElementById('syncBtn').addEventListener('click', syncLiveSheetData);
  
  // 3. Filters Change Events
  document.getElementById('monthFilter').addEventListener('change', (e) => {
    state.filters.month = e.target.value;
    updateDashboardUI();
  });
  
  document.getElementById('regionFilter').addEventListener('change', (e) => {
    state.filters.region = e.target.value;
    populateProvinceFilter();
    updateDashboardUI();
  });
  
  document.getElementById('provinceFilter').addEventListener('change', (e) => {
    state.filters.province = e.target.value;
    updateDashboardUI();
  });
  
  document.getElementById('routeSearch').addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    updateDashboardUI();
  });
  
  // 4. Focus Ranks tab selection toggles
  document.getElementById('btnFocusProvince').addEventListener('click', (e) => {
    setActiveFocusTab('province');
  });
  document.getElementById('btnFocusRoute').addEventListener('click', (e) => {
    setActiveFocusTab('route');
  });
  document.getElementById('btnOpportunity').addEventListener('click', (e) => {
    setActiveFocusTab('opportunity');
  });
  
  function setActiveFocusTab(tabId) {
    ['btnFocusProvince', 'btnFocusRoute', 'btnOpportunity'].forEach(id => {
      document.getElementById(id).classList.remove('page-active');
    });
    
    const formulaText = document.getElementById('focusScoreFormula');
    if (tabId === 'province') {
      document.getElementById('btnFocusProvince').classList.add('page-active');
      formulaText.innerText = 'Score = Vol * Rớt LC * (1 - ODR)';
    } else if (tabId === 'route') {
      document.getElementById('btnFocusRoute').classList.add('page-active');
      formulaText.innerText = 'Score = Vol * Rớt LC * (1 - ODR)';
    } else {
      document.getElementById('btnOpportunity').classList.add('page-active');
      formulaText.innerText = 'Score = (Rớt LC * (1 - ODR) * 10000) / (Vol + 1)';
    }
    
    state.activeFocusTab = tabId;
    renderFocusRankList(getFilteredData());
  }
  
  // 5. Chart toggle event
  document.getElementById('chartTypeToggle').addEventListener('change', (e) => {
    state.activeChartType = e.target.value;
    renderTrendsChart();
  });
  
  // 6. CSV Download event
  document.getElementById('btnDownloadCSV').addEventListener('click', exportMappedRoutesToCSV);
  
  // 7. Grid Column Sorting Header Click Bindings
  const tableHeaders = document.querySelectorAll('table.data-table th');
  tableHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-col');
      if (!column) return;
      
      const currentSorted = state.pagination.sortedColumn;
      const currentOrder = state.pagination.sortOrder;
      
      let newOrder = 'desc';
      if (column === currentSorted) {
        newOrder = currentOrder === 'desc' ? 'asc' : 'desc';
      }
      
      state.pagination.sortedColumn = column;
      state.pagination.sortOrder = newOrder;
      
      // Update visual headers
      tableHeaders.forEach(h => h.className = '');
      th.className = newOrder === 'asc' ? 'sort-asc' : 'sort-desc';
      
      renderDataTable(getFilteredData());
    });
  });
});
