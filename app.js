// URLs kết nối trực tiếp đến Google Sheets (định dạng CSV)
const sheetUrls = {
    prov: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_tinh",
    route: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_tuyen",
    lt: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=Leadtime",
    shop: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_shop"
};

// Global Data State
let dbData = {
    prov: [],
    route: [],
    lt: [],
    shop: []
};

// Active drill-down state
let activeRouteFilter = null;

// Sort State
let sortState = {
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

function normalizeProvName(name) {
    if (!name) return "";
    return name.toString().toLowerCase()
        .replace(/tp\s+/g, '')
        .replace(/tỉnh\s+/g, '')
        .replace(/thành phố\s+/g, '')
        .replace(/hồ chí minh/g, 'hcm')
        .replace(/hà nội/g, 'hn')
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
        statusText.innerText = "Tải chỉ số Tỉnh Lấy (chi_so_tinh)...";
        progressBar.style.width = "25%";
        let resProv = await fetch(sheetUrls.prov);
        let textProv = await resProv.text();
        dbData.prov = parseCSV(textProv);

        statusText.innerText = "Tải chỉ số Tuyến Giao (chi_so_tuyen)...";
        progressBar.style.width = "50%";
        let resRoute = await fetch(sheetUrls.route);
        let textRoute = await resRoute.text();
        dbData.route = parseCSV(textRoute);

        statusText.innerText = "Tải cơ cấu chặng Leadtime (Leadtime)...";
        progressBar.style.width = "75%";
        let resLt = await fetch(sheetUrls.lt);
        let textLt = await resLt.text();
        dbData.lt = parseCSV(textLt);

        statusText.innerText = "Tải hiệu suất doanh nghiệp (chi_so_shop)...";
        progressBar.style.width = "100%";
        let resShop = await fetch(sheetUrls.shop);
        let textShop = await resShop.text();
        dbData.shop = parseCSV(textShop);

        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; }, 500);
            initUnifiedDashboard();
        }, 800);

    } catch (err) {
        console.error("Lỗi khi load DB:", err);
        statusText.innerText = "Lỗi kết nối Google Sheets! Vui lòng làm mới trang hoặc kiểm tra mạng.";
        statusText.style.color = "var(--danger-color)";
    }
}

function reloadAllData() {
    loadAllData();
}

function initUnifiedDashboard() {
    // Điền bộ lọc tháng
    let months = [...new Set(dbData.prov.map(d => d.thang))].filter(Boolean).sort().reverse();
    let monthSelect = document.getElementById('global-select-thang');
    monthSelect.innerHTML = '';
    months.forEach(m => {
        monthSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });

    // Điền bộ lọc tỉnh lấy
    let provinces = [...new Set(dbData.prov.map(d => d.tinh_lay))].filter(Boolean).sort();
    let provSelect = document.getElementById('global-select-tinh');
    provSelect.innerHTML = '';
    provinces.forEach(p => {
        // Ưu tiên chọn Hà Nội hoặc Hồ Chí Minh làm mặc định
        let selectedAttr = (p === 'Hồ Chí Minh' || p === 'Hà Nội') ? 'selected' : '';
        provSelect.innerHTML += `<option value="${p}" ${selectedAttr}>${p}</option>`;
    });

    updateDashboard();
}

function sortUnified(key) {
    if (sortState.route.key === key) {
        sortState.route.asc = !sortState.route.asc;
    } else {
        sortState.route.key = key;
        sortState.route.asc = false;
    }
    updateDashboard();
}

function sortUnifiedShop(key) {
    if (sortState.shop.key === key) {
        sortState.shop.asc = !sortState.shop.asc;
    } else {
        sortState.shop.key = key;
        sortState.shop.asc = false;
    }
    updateDashboard();
}

// Main update execution
function updateDashboard() {
    const selectedThang = document.getElementById('global-select-thang').value;
    const selectedProv = document.getElementById('global-select-tinh').value;

    // 1. Tải Profile Tỉnh Lấy & Tính toán KPIs
    let provProfile = dbData.prov.find(d => d.thang === selectedThang && d.tinh_lay === selectedProv);
    const profileContainer = document.getElementById('prov-profile-content');

    if (provProfile) {
        document.getElementById('kpi-prov-vol').innerText = formatNum(provProfile.vol);
        document.getElementById('kpi-prov-odr').innerText = formatPercent(provProfile.pct_odr);
        document.getElementById('kpi-prov-opr').innerText = formatPercent(provProfile.pct_opr);

        profileContainer.innerHTML = `
            <div class="profile-item">
                <span class="profile-label">Vùng Địa Lý</span>
                <span class="profile-val badge info">${provProfile.vung_lay}</span>
            </div>
            <div class="profile-item">
                <span class="profile-label">Khối Lượng Pick</span>
                <span class="profile-val">${formatNum(provProfile.kl)} kg</span>
            </div>
            <div class="profile-item">
                <span class="profile-label">Tỉ lệ local route LC</span>
                <span class="profile-val">${formatPercent(provProfile.pct_rot_lc)}</span>
            </div>
            <div class="profile-item">
                <span class="profile-label">Tỉ lệ hàng Longtail</span>
                <span class="profile-val badge warning">${formatPercent(provProfile.pct_longtail)}</span>
            </div>
        `;
    } else {
        profileContainer.innerHTML = '<p class="placeholder-text">Không có thông tin tổng quan tháng này.</p>';
    }

    // 2. Kết nối (JOIN) Tuyến và Leadtime
    let matchedRoutes = dbData.route.filter(r => r.thang === selectedThang && r.tuyen.startsWith(selectedProv + " - "));
    
    let joinedRoutes = matchedRoutes.map(r => {
        let ltInfo = dbData.lt.find(l => l.thang === selectedThang && l.tuyen === r.tuyen);
        return {
            ...r,
            ltInfo: ltInfo || {}
        };
    });

    // Tính toán Weighted Average Leadtime
    let totalVol = 0;
    let weightedLtSum = 0;
    joinedRoutes.forEach(r => {
        let vol = parseFloat(r.vol.toString().replace(/,/g, '')) || 0;
        let lt = parseFloat(r.ltInfo.lt_tong || r.Leadtine) || 0;
        if (vol > 0 && lt > 0) {
            totalVol += vol;
            weightedLtSum += (lt * vol);
        }
    });
    let avgLtOutbound = totalVol > 0 ? (weightedLtSum / totalVol) : 0;
    document.getElementById('kpi-prov-leadtime').innerText = avgLtOutbound > 0 ? avgLtOutbound.toFixed(1) + "h" : "--";

    // Sort Tuyến
    let rKey = sortState.route.key;
    let rAsc = sortState.route.asc;
    joinedRoutes.sort((a, b) => {
        let valA = a[rKey] || a.ltInfo[rKey] || 0;
        let valB = b[rKey] || b.ltInfo[rKey] || 0;
        let numA = parseFloat(valA.toString().replace(/,/g, '').replace(/%/g, ''));
        let numB = parseFloat(valB.toString().replace(/,/g, '').replace(/%/g, ''));

        if (!isNaN(numA) && !isNaN(numB)) {
            return rAsc ? (numA - numB) : (numB - numA);
        }
        return rAsc ? valA.toString().localeCompare(valB.toString()) : valB.toString().localeCompare(valA.toString());
    });

    // Render Bảng Tuyến Giao đã JOIN
    const routesTbody = document.getElementById('joined-routes-tbody');
    routesTbody.innerHTML = '';

    if (joinedRoutes.length === 0) {
        routesTbody.innerHTML = '<tr><td colspan="9" class="placeholder-text">Không tìm thấy tuyến nào xuất phát từ tỉnh này.</td></tr>';
    } else {
        joinedRoutes.forEach(r => {
            let activeClass = (activeRouteFilter === r.tuyen) ? 'active-row' : '';
            
            // Cấu trúc phân bổ số KTC đi qua
            let ktcSplit = `1 KTC: ${formatPercent(r.ltInfo.pct_1ktc || 0)} | 2 KTC: ${formatPercent(r.ltInfo.pct_2ktc || 0)}`;

            routesTbody.innerHTML += `
                <tr class="clickable ${activeClass}" onclick="selectRoute('${r.tuyen}')">
                    <td style="font-weight: 600; color: #60a5fa;"><i class="fa-solid fa-arrow-trend-up"></i> ${r.tuyen}</td>
                    <td style="font-weight: 600;">${formatNum(r.vol)}</td>
                    <td>${formatPercent(r.pct_opr)}</td>
                    <td><span class="badge ${parseFloat(r.pct_odr) < 0.85 ? 'danger' : 'success'}">${formatPercent(r.pct_odr)}</span></td>
                    <td>${formatHours(r.ltInfo.lt_xuat_bclay_nhap_ktc1)}</td>
                    <td>${formatHours(r.ltInfo.lt_ktc1_ktc2)}</td>
                    <td>${formatHours(r.ltInfo.lt_ktc_cuoi_nhap_bcgiao)}</td>
                    <td style="font-weight: 700; color: #10b981;">${formatHours(r.ltInfo.lt_tong || r.Leadtine)}</td>
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${r["KTC/KCT lấy"]} → ${r["KTC/KCT giao"]} (${ktcSplit})</td>
                </tr>
            `;
        });
    }

    // 3. Hiển thị Shops thuộc Tỉnh Lấy và Lọc theo Tuyến kết nối
    let shopList = dbData.shop.filter(s => s.tinh_lay === selectedProv);

    // Xử lý bộ lọc tuyến (nếu được bấm chọn)
    const activeBadge = document.getElementById('active-route-filter');
    if (activeRouteFilter) {
        activeBadge.style.display = 'flex';
        document.getElementById('filtered-route-name').innerText = activeRouteFilter;
        
        let targetDeliveryProv = activeRouteFilter.split(" - ")[1];
        let normalizedTarget = normalizeProvName(targetDeliveryProv);
        
        shopList = shopList.filter(s => {
            let normalizedShopTopProv = normalizeProvName(s.top_tinh_giao);
            return normalizedShopTopProv.includes(normalizedTarget) || normalizedTarget.includes(normalizedShopTopProv);
        });
    } else {
        activeBadge.style.display = 'none';
    }

    // Sort Shops
    let sKey = sortState.shop.key;
    let sAsc = sortState.shop.asc;
    shopList.sort((a, b) => {
        let valA = a[sKey] || 0;
        let valB = b[sKey] || 0;
        let numA = parseFloat(valA.toString().replace(/,/g, '').replace(/%/g, ''));
        let numB = parseFloat(valB.toString().replace(/,/g, '').replace(/%/g, ''));

        if (!isNaN(numA) && !isNaN(numB)) {
            return sAsc ? (numA - numB) : (numB - numA);
        }
        return sAsc ? valA.toString().localeCompare(valB.toString()) : valB.toString().localeCompare(valA.toString());
    });

    // Render Bảng Shop
    const shopTbody = document.getElementById('shop-tbody');
    shopTbody.innerHTML = '';

    if (shopList.length === 0) {
        shopTbody.innerHTML = '<tr><td colspan="9" class="placeholder-text">Không có shop nào hoạt động phù hợp bộ lọc tuyến hiện tại.</td></tr>';
    } else {
        shopList.forEach(s => {
            shopTbody.innerHTML += `
                <tr>
                    <td style="font-weight: 600; color: #f8fafc;">${s.ten_kh}</td>
                    <td style="font-size: 0.82rem; color: var(--text-muted);">${s.warehouse_name} (ID: ${s.pickwarehouseid})</td>
                    <td>${s.quan}</td>
                    <td style="font-weight: 600;">${formatNum(s.tong_vol)}</td>
                    <td style="color: #60a5fa; font-weight: 500;">${formatNum(s.vol_tb_ngay)}/ngày</td>
                    <td><span class="badge ${parseFloat(s.pct_odr) < 0.90 ? 'danger' : 'success'}">${formatPercent(s.pct_odr)}</span></td>
                    <td>${formatPercent(s.pct_opr)}</td>
                    <td style="font-weight: 600;">${s.top_tinh_giao}</td>
                    <td>${formatPercent(s.pct_kl_top_tinh_giao)}</td>
                </tr>
            `;
        });
    }
}

// Lọc shop khi bấm chọn 1 Tuyến liên quan
function selectRoute(routeName) {
    if (activeRouteFilter === routeName) {
        activeRouteFilter = null; // Bấm lại sẽ clear lọc
    } else {
        activeRouteFilter = routeName;
    }
    updateDashboard();
}

function clearRouteFilter() {
    activeRouteFilter = null;
    updateDashboard();
}
