// URLs kết nối trực tiếp đến Google Sheets (xuất định dạng CSV)
const sheetUrls = {
    prov: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_tinh",
    route: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_tuyen",
    lt: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=Leadtime",
    shop: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_shop"
};

// Global DB
let dbData = {
    prov: [],
    route: [],
    lt: [],
    shop: []
};

// Selection State
let selectedMonth = "";
let selectedProv = "";
let selectedRoute = "";

// Sorting States
let sortState = {
    prov: { key: 'vol', asc: false },
    route: { key: 'vol', asc: false },
    shop: { key: 'tong_vol', asc: false }
};

document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
});

// CSV Parser
function parseCSV(text) {
    let lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    let headers = parseCSVLine(lines[0]);
    let result = [];
    
    for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let cols = parseCSVLine(line);
        let rowObj = {};
        for (let j = 0; j < headers.length; j++) {
            rowObj[headers[j]] = cols[j] !== undefined ? cols[j] : "";
        }
        result.push(rowObj);
    }
    return result;
}

function parseCSVLine(line) {
    let arr = [];
    let insideQuote = false;
    let col = "";
    for (let i = 0; i < line.length; i++) {
        let char = line[i];
        if (char === '"') {
            insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
            arr.push(col.trim().replace(/^"|"$/g, ''));
            col = "";
        } else {
            col += char;
        }
    }
    arr.push(col.trim().replace(/^"|"$/g, ''));
    return arr;
}

// Formatters
function formatNum(val) {
    if (!val) return "0";
    let n = parseFloat(val.toString().replace(/,/g, ''));
    return isNaN(n) ? val : n.toLocaleString('vi-VN');
}

function formatPercent(val) {
    if (!val) return "0%";
    if (val.toString().includes('%')) return val;
    let p = parseFloat(val);
    if (isNaN(p)) return val;
    if (p <= 1.0) {
        return (p * 100).toFixed(2) + "%";
    }
    return p.toFixed(2) + "%";
}

function formatHours(val) {
    if (!val) return "--";
    let h = parseFloat(val);
    return isNaN(h) ? val : h.toFixed(1) + "h";
}

function normalizeProv(p) {
    if (!p) return "";
    return p.toString().toLowerCase()
        .replace(/tp\./gi, '')
        .replace(/tp\s+/gi, '')
        .replace(/thành phố\s+/gi, '')
        .replace(/tỉnh\s+/gi, '')
        .replace(/hồ chí minh/gi, 'hcm')
        .replace(/hà nội/gi, 'hn')
        .trim();
}

// Fetch DB
async function loadAllData() {
    const overlay = document.getElementById('loading-overlay');
    const statusText = document.getElementById('loading-status');
    const progressBar = document.getElementById('loading-progress');

    overlay.style.display = 'flex';
    overlay.style.opacity = '1';

    try {
        statusText.innerText = "Đồng bộ chỉ số Tỉnh Lấy (chi_so_tinh)...";
        progressBar.style.width = "25%";
        let resProv = await fetch(sheetUrls.prov);
        let textProv = await resProv.text();
        dbData.prov = parseCSV(textProv);

        statusText.innerText = "Đồng bộ chỉ số Tuyến Vận Chuyển (chi_so_tuyen)...";
        progressBar.style.width = "50%";
        let resRoute = await fetch(sheetUrls.route);
        let textRoute = await resRoute.text();
        dbData.route = parseCSV(textRoute);

        statusText.innerText = "Đồng bộ chặng Leadtime (Leadtime)...";
        progressBar.style.width = "75%";
        let resLt = await fetch(sheetUrls.lt);
        let textLt = await resLt.text();
        dbData.lt = parseCSV(textLt);

        statusText.innerText = "Đồng bộ hiệu suất Shop (chi_so_shop)...";
        progressBar.style.width = "100%";
        let resShop = await fetch(sheetUrls.shop);
        let textShop = await resShop.text();
        dbData.shop = parseCSV(textShop);

        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; }, 500);
            initApp();
        }, 800);

    } catch (err) {
        console.error("Lỗi đồng bộ DB:", err);
        statusText.innerText = "Đồng bộ Google Sheets thất bại! Vui lòng kiểm tra lại đường truyền mạng.";
        statusText.style.color = "var(--danger-color)";
    }
}

function reloadAllData() {
    loadAllData();
}

function initApp() {
    // Điền bộ lọc tháng
    let months = [...new Set(dbData.prov.map(d => d.thang))].filter(Boolean).sort().reverse();
    let monthSelect = document.getElementById('filter-month');
    monthSelect.innerHTML = '';
    months.forEach(m => {
        monthSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });

    selectedMonth = monthSelect.value;
    resetSelections();
    renderStep1();
}

function onMonthChange() {
    selectedMonth = document.getElementById('filter-month').value;
    resetSelections();
    renderStep1();
}

function resetSelections() {
    selectedProv = "";
    selectedRoute = "";
    
    // Disable steps 2 & 3
    document.getElementById('section-step2').classList.add('disabled-step');
    document.getElementById('section-step3').classList.add('disabled-step');
    
    document.getElementById('selected-prov-label').innerText = "Chưa Chọn";
    document.getElementById('shop-prov-label').innerText = "Chưa Chọn";
    document.getElementById('shop-dest-label').innerText = "Chưa Chọn";

    document.getElementById('route-tbody').innerHTML = `<tr><td colspan="7" class="placeholder-text">Vui lòng nhấp chọn một Tỉnh Lấy ở Bước 1 để hiển thị tuyến kết nối.</td></tr>`;
    document.getElementById('shop-tbody').innerHTML = `<tr><td colspan="10" class="placeholder-text">Vui lòng nhấp chọn một Tuyến Vận Chuyển ở Bước 2 để đối soát danh sách shop.</td></tr>`;
}

function sortData(tabName, key) {
    if (sortState[tabName].key === key) {
        sortState[tabName].asc = !sortState[tabName].asc;
    } else {
        sortState[tabName].key = key;
        sortState[tabName].asc = false;
    }

    if (tabName === 'prov') renderStep1();
    if (tabName === 'route') renderStep2();
    if (tabName === 'shop') renderStep3();
}

function getSortedArr(arr, key, asc) {
    return [...arr].sort((a, b) => {
        let valA = a[key] !== undefined ? a[key] : "";
        let valB = b[key] !== undefined ? b[key] : "";
        let numA = parseFloat(valA.toString().replace(/,/g, '').replace(/%/g, ''));
        let numB = parseFloat(valB.toString().replace(/,/g, '').replace(/%/g, ''));

        if (!isNaN(numA) && !isNaN(numB)) {
            return asc ? (numA - numB) : (numB - numA);
        }
        return asc ? valA.toString().localeCompare(valB.toString()) : valB.toString().localeCompare(valA.toString());
    });
}

// Helper to color codes
function getODRClass(val) {
    let p = parseFloat(val);
    if (isNaN(p)) return '';
    if (p <= 1.0) p = p * 100;
    if (p < 88.0) return 'hl-cell-red';
    if (p < 92.0) return 'hl-cell-yellow';
    return 'hl-cell-green';
}

function getLongtailClass(val) {
    let p = parseFloat(val);
    if (isNaN(p)) return '';
    if (p <= 1.0) p = p * 100;
    if (p > 18.0) return 'hl-cell-red';
    if (p > 15.0) return 'hl-cell-yellow';
    return 'hl-cell-green';
}

function getOPRClass(val) {
    let p = parseFloat(val);
    if (isNaN(p)) return '';
    if (p <= 1.0) p = p * 100;
    if (p < 70.0) return 'hl-cell-red';
    if (p < 85.0) return 'hl-cell-yellow';
    return 'hl-cell-green';
}

// ==================== BƯỚC 1: RENDER TỈNH LẤY ====================
function renderStep1() {
    let filtered = dbData.prov.filter(d => d.thang === selectedMonth);
    let sorted = getSortedArr(filtered, sortState.prov.key, sortState.prov.asc);

    const tbody = document.getElementById('prov-tbody');
    tbody.innerHTML = '';

    sorted.forEach(d => {
        let isSelected = (selectedProv === d.tinh_lay) ? 'selected-row' : '';
        tbody.innerHTML += `
            <tr class="${isSelected}" onclick="selectProvince('${d.tinh_lay}')">
                <td>${d.vung_lay}</td>
                <td style="font-weight: 600;">${d.tinh_lay}</td>
                <td style="font-weight: 600; color: #60a5fa;">${formatNum(d.vol)}</td>
                <td>${formatNum(d.kl)}</td>
                <td class="${getOPRClass(d.pct_opr)}">${formatPercent(d.pct_opr)}</td>
                <td>${formatPercent(d.pct_rot_lc)}</td>
                <td class="${getODRClass(d.pct_odr)}">${formatPercent(d.pct_odr)}</td>
                <td class="${getLongtailClass(d.pct_longtail)}">${formatPercent(d.pct_longtail)}</td>
            </tr>
        `;
    });
}

function selectProvince(provName) {
    selectedProv = provName;
    selectedRoute = "";
    
    // Khởi chạy bước 2
    document.getElementById('section-step2').classList.remove('disabled-step');
    document.getElementById('section-step3').classList.add('disabled-step');
    
    document.getElementById('selected-prov-label').innerText = provName;
    document.getElementById('shop-prov-label').innerText = provName;
    document.getElementById('shop-dest-label').innerText = "Chưa Chọn";

    document.getElementById('shop-tbody').innerHTML = `<tr><td colspan="10" class="placeholder-text">Vui lòng nhấp chọn một Tuyến Vận Chuyển ở Bước 2 để đối soát danh sách shop.</td></tr>`;

    renderStep1(); // Để highlight row được chọn ở bước 1
    renderStep2();
}

// ==================== BƯỚC 2: RENDER TUYẾN GIAO ====================
function renderStep2() {
    // Lọc tuyến bắt đầu bằng Tỉnh Lấy được chọn
    let matchedRoutes = dbData.route.filter(r => r.thang === selectedMonth && r.tuyen.startsWith(selectedProv + " - "));
    
    // JOIN với dữ liệu Leadtime
    let joined = matchedRoutes.map(r => {
        let ltInfo = dbData.lt.find(l => l.thang === selectedMonth && l.tuyen === r.tuyen);
        return {
            ...r,
            lt_tong: ltInfo ? ltInfo.lt_tong : r.Leadtine, // Dùng Leadtime tổng từ sheet lt hoặc Leadtine
            pct_longtail: r.pct_longtail // Sử dụng longtail từ sheet chi_so_tuyen
        };
    });

    let sorted = getSortedArr(joined, sortState.route.key, sortState.route.asc);
    
    const tbody = document.getElementById('route-tbody');
    tbody.innerHTML = '';

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="placeholder-text">Không có tuyến gửi nào xuất phát từ ${selectedProv} trong tháng ${selectedMonth}.</td></tr>`;
        return;
    }

    sorted.forEach(r => {
        let isSelected = (selectedRoute === r.tuyen) ? 'selected-row' : '';
        tbody.innerHTML += `
            <tr class="${isSelected}" onclick="selectRoute('${r.tuyen}')">
                <td style="font-weight: 600; color: #60a5fa;"><i class="fa-solid fa-arrow-trend-up"></i> ${r.tuyen}</td>
                <td style="font-weight: 600;">${formatNum(r.vol)}</td>
                <td class="${getOPRClass(r.pct_opr)}">${formatPercent(r.pct_opr)}</td>
                <td class="${getODRClass(r.pct_odr)}">${formatPercent(r.pct_odr)}</td>
                <td class="${getLongtailClass(r.pct_longtail)}">${formatPercent(r.pct_longtail)}</td>
                <td style="font-weight: 700; color: #10b981;">${formatHours(r.lt_tong)}</td>
                <td style="font-size: 0.82rem; color: var(--text-muted);">${r["KTC/KCT lấy"] || "--"} → ${r["KTC/KCT giao"] || "--"}</td>
            </tr>
        `;
    });
}

function selectRoute(routeName) {
    selectedRoute = routeName;

    // Kích hoạt Bước 3
    document.getElementById('section-step3').classList.remove('disabled-step');
    
    let destProv = routeName.split(" - ")[1];
    document.getElementById('shop-dest-label').innerText = destProv;

    renderStep2(); // Highlight row ở bước 2
    renderStep3();
}

// ==================== BƯỚC 3: RENDER SHOP TRỌNG ĐIỂM ====================
function renderStep3() {
    let destProv = selectedRoute.split(" - ")[1];
    let normalizedDest = normalizeProv(destProv);

    // Lọc shop:
    // 1. Thuộc tỉnh lấy được chọn
    // 2. Có Tỉnh giao nhiều nhất (top_tinh_giao) tương ứng với tỉnh giao của tuyến bị lỗi
    let filteredShops = dbData.shop.filter(s => {
        let matchProv = s.tinh_lay === selectedProv;
        let normalizedShopTop = normalizeProv(s.top_tinh_giao);
        
        // Khớp mờ để Hồ Chí Minh và TP Hồ Chí Minh khớp nhau
        let matchDest = normalizedShopTop.includes(normalizedDest) || normalizedDest.includes(normalizedShopTop);
        return matchProv && matchDest;
    });

    let sorted = getSortedArr(filteredShops, sortState.shop.key, sortState.shop.asc);

    const tbody = document.getElementById('shop-tbody');
    tbody.innerHTML = '';

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="placeholder-text">Không có shop nào tại ${selectedProv} gửi đơn nhiều nhất đi ${destProv} trong cơ sở dữ liệu.</td></tr>`;
        return;
    }

    sorted.forEach(s => {
        tbody.innerHTML += `
            <tr>
                <td style="font-weight: 600; color: #f8fafc;">${s.ten_kh}</td>
                <td style="font-size: 0.82rem; color: var(--text-muted);">${s.warehouse_name} (ID: ${s.pickwarehouseid})</td>
                <td>${s.quan}</td>
                <td style="font-weight: 600;">${formatNum(s.tong_vol)}</td>
                <td style="color: #60a5fa;">${formatNum(s.vol_tb_ngay)}</td>
                <td style="font-weight: 600; color: #fbbf24;">${formatNum(s.kl_tb_ngay_top_tinh_giao)} kg/ngày</td>
                <td class="${getODRClass(s.pct_odr)}">${formatPercent(s.pct_odr)}</td>
                <td class="${getOPRClass(s.pct_opr)}">${formatPercent(s.pct_opr)}</td>
                <td style="font-weight: 600;">${s.top_tinh_giao}</td>
                <td>${formatPercent(s.pct_kl_top_tinh_giao)}</td>
            </tr>
        `;
    });
}
