// URLs kết nối trực tiếp đến Google Sheets (xuất định dạng CSV)
const sheetUrls = {
    prov: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_tinh",
    route: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_tuyen",
    lt: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=Leadtime",
    shop: "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/gviz/tq?tqx=out:csv&sheet=chi_so_shop"
};

// Global DB State
let dbData = {
    prov: [],
    route: [],
    lt: [],
    shop: []
};

// Global Sort State
let sortState = {
    prov: { key: 'vol', asc: false },
    route: { key: 'vol', asc: false },
    lt: { key: 'lt_tong', asc: false },
    shop: { key: 'tong_vol', asc: false }
};

document.addEventListener('DOMContentLoaded', () => {
    // Chuyển đổi tab
    const menuItems = document.querySelectorAll('.menu-item');
    const tabContents = document.querySelectorAll('.tab-content');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            menuItems.forEach(i => i.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));

            item.classList.add('active');
            const tabId = item.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Tải dữ liệu lần đầu
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

// Helpers for formatted indices
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
    // Nếu p lớn hơn 1 (ví dụ 95.8) thì hiển thị luôn, nếu bé hơn 1 (ví dụ 0.958) thì nhân 100
    if (p <= 1.0) {
        return (p * 100).toFixed(2) + "%";
    }
    return p.toFixed(2) + "%";
}

function formatHours(val) {
    if (!val) return "--";
    let h = parseFloat(val);
    return isNaN(h) ? val : h.toFixed(2) + "h";
}

// Fetch & Load Data
async function loadAllData() {
    const overlay = document.getElementById('loading-overlay');
    const statusText = document.getElementById('loading-status');
    const progressBar = document.getElementById('loading-progress');

    overlay.style.display = 'flex';
    overlay.style.opacity = '1';

    try {
        // Tải Tỉnh Lấy
        statusText.innerText = "Tải dữ liệu Tỉnh Lấy (chi_so_tinh)...";
        progressBar.style.width = "25%";
        let resProv = await fetch(sheetUrls.prov);
        let textProv = await resProv.text();
        dbData.prov = parseCSV(textProv);

        // Tải Tuyến Lấy - Giao
        statusText.innerText = "Tải dữ liệu Tuyến Lấy - Giao (chi_so_tuyen)...";
        progressBar.style.width = "50%";
        let resRoute = await fetch(sheetUrls.route);
        let textRoute = await resRoute.text();
        dbData.route = parseCSV(textRoute);

        // Tải Phân tích Leadtime
        statusText.innerText = "Tải dữ liệu phân tích Leadtime chi tiết...";
        progressBar.style.width = "75%";
        let resLt = await fetch(sheetUrls.lt);
        let textLt = await resLt.text();
        dbData.lt = parseCSV(textLt);

        // Tải Hiệu Suất Shop
        statusText.innerText = "Tải dữ liệu Hiệu Suất Shop (chi_so_shop)...";
        progressBar.style.width = "100%";
        let resShop = await fetch(sheetUrls.shop);
        let textShop = await resShop.text();
        dbData.shop = parseCSV(textShop);

        // Thành công, ẩn loading
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; }, 500);
            initDB();
        }, 800);

    } catch (err) {
        console.error("Lỗi khi load DB:", err);
        statusText.innerText = "Lỗi khi kết nối đến Google Sheets. Hãy kiểm tra kết nối mạng!";
        statusText.style.color = "var(--danger-color)";
    }
}

function reloadAllData() {
    loadAllData();
}

function initDB() {
    populateFilters();
    renderAllTables();
}

function populateFilters() {
    // Lọc Tháng cho Tỉnh Lấy
    let provThangs = [...new Set(dbData.prov.map(d => d.thang))].filter(Boolean).sort();
    let provThangSelect = document.getElementById('prov-select-thang');
    provThangSelect.innerHTML = '<option value="">-- Tất cả tháng --</option>';
    provThangs.forEach(t => {
        provThangSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });

    // Lọc Tháng cho Tuyến
    let routeThangs = [...new Set(dbData.route.map(d => d.thang))].filter(Boolean).sort();
    let routeThangSelect = document.getElementById('route-select-thang');
    routeThangSelect.innerHTML = '<option value="">-- Tất cả tháng --</option>';
    routeThangs.forEach(t => {
        routeThangSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });

    // Lọc Tháng cho Leadtime
    let ltThangs = [...new Set(dbData.lt.map(d => d.thang))].filter(Boolean).sort();
    let ltThangSelect = document.getElementById('lt-select-thang');
    ltThangSelect.innerHTML = '<option value="">-- Tất cả tháng --</option>';
    ltThangs.forEach(t => {
        ltThangSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });

    // Lọc Tỉnh Lấy cho Shop
    let shopTinhs = [...new Set(dbData.shop.map(d => d.tinh_lay))].filter(Boolean).sort();
    let shopTinhSelect = document.getElementById('shop-select-tinh');
    shopTinhSelect.innerHTML = '<option value="">-- Tất cả các tỉnh --</option>';
    shopTinhs.forEach(t => {
        shopTinhSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });
}

function renderAllTables() {
    filterProvData();
    filterRouteData();
    filterLtData();
    filterShopData();
}

// Helper to sort dynamically
function sortDB(tabName, key) {
    if (sortState[tabName].key === key) {
        sortState[tabName].asc = !sortState[tabName].asc;
    } else {
        sortState[tabName].key = key;
        sortState[tabName].asc = true;
    }
    
    // Khởi chạy render lại tab tương ứng
    if (tabName === 'prov') filterProvData();
    if (tabName === 'route') filterRouteData();
    if (tabName === 'lt') filterLtData();
    if (tabName === 'shop') filterShopData();
}

function getSortedArray(arr, key, asc) {
    return [...arr].sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        // Xử lý chuyển đổi sang dạng số để sort chính xác
        let numA = parseFloat(valA.toString().replace(/,/g, '').replace(/%/g, ''));
        let numB = parseFloat(valB.toString().replace(/,/g, '').replace(/%/g, ''));

        if (!isNaN(numA) && !isNaN(numB)) {
            return asc ? (numA - numB) : (numB - numA);
        }

        // Nếu là String
        return asc ? 
            valA.toString().localeCompare(valB.toString()) : 
            valB.toString().localeCompare(valA.toString());
    });
}

// ==================== TAB 1: RENDER CHỈ SỐ TỈNH ====================
function filterProvData() {
    let nameSearch = document.getElementById('prov-search-tinh').value.toLowerCase();
    let thangFilter = document.getElementById('prov-select-thang').value;

    let filtered = dbData.prov.filter(d => {
        let matchName = d.tinh_lay.toLowerCase().includes(nameSearch);
        let matchThang = thangFilter === "" ? true : d.thang === thangFilter;
        return matchName && matchThang;
    });

    let sorted = getSortedArray(filtered, sortState.prov.key, sortState.prov.asc);
    
    const tbody = document.getElementById('prov-table-body');
    tbody.innerHTML = '';

    sorted.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.thang}</td>
                <td>${d.vung_lay}</td>
                <td style="font-weight: 600;">${d.tinh_lay}</td>
                <td style="font-weight: 600; color: #60a5fa;">${formatNum(d.vol)}</td>
                <td>${formatNum(d.kl)}</td>
                <td><span class="badge info">${formatPercent(d.pct_opr)}</span></td>
                <td>${formatPercent(d.pct_rot_lc)}</td>
                <td><span class="badge ${parseFloat(d.pct_odr) < 0.85 ? 'danger' : 'success'}">${formatPercent(d.pct_odr)}</span></td>
                <td>${formatPercent(d.pct_longtail)}</td>
            </tr>
        `;
    });
}

// ==================== TAB 2: RENDER CHỈ SỐ TUYẾN ====================
function filterRouteData() {
    let tuyenSearch = document.getElementById('route-search-tuyen').value.toLowerCase();
    let thangFilter = document.getElementById('route-select-thang').value;
    let ktcSearch = document.getElementById('route-search-ktc').value.toLowerCase();

    let filtered = dbData.route.filter(d => {
        let matchTuyen = d.tuyen.toLowerCase().includes(tuyenSearch);
        let matchThang = thangFilter === "" ? true : d.thang === thangFilter;
        
        let ktcLấy = (d["KTC/KCT lấy"] || "").toLowerCase();
        let ktcGiao = (d["KTC/KCT giao"] || "").toLowerCase();
        let matchKtc = ktcSearch === "" ? true : (ktcLấy.includes(ktcSearch) || ktcGiao.includes(ktcSearch));
        
        return matchTuyen && matchThang && matchKtc;
    });

    let sorted = getSortedArray(filtered, sortState.route.key, sortState.route.asc);

    const tbody = document.getElementById('route-table-body');
    tbody.innerHTML = '';

    sorted.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.thang}</td>
                <td style="font-weight: 600; color: #60a5fa;">${d.tuyen}</td>
                <td style="font-weight: 600;">${formatNum(d.vol)}</td>
                <td>${formatNum(d.kl)}</td>
                <td>${formatPercent(d.pct_opr)}</td>
                <td><span class="badge ${parseFloat(d.pct_odr) < 0.85 ? 'danger' : 'success'}">${formatPercent(d.pct_odr)}</span></td>
                <td style="font-weight: 600;"><span class="badge info">${formatHours(d.Leadtine)}</span></td>
                <td>${d["KTC/KCT lấy"] || "--"}</td>
                <td>${d["KTC/KCT giao"] || "--"}</td>
            </tr>
        `;
    });
}

// ==================== TAB 3: RENDER LEADTIME CHẶNG ====================
function filterLtData() {
    let tuyenSearch = document.getElementById('lt-search-tuyen').value.toLowerCase();
    let thangFilter = document.getElementById('lt-select-thang').value;

    let filtered = dbData.lt.filter(d => {
        let matchTuyen = d.tuyen.toLowerCase().includes(tuyenSearch);
        let matchThang = thangFilter === "" ? true : d.thang === thangFilter;
        return matchTuyen && matchThang;
    });

    let sorted = getSortedArray(filtered, sortState.lt.key, sortState.lt.asc);

    const tbody = document.getElementById('lt-table-body');
    tbody.innerHTML = '';

    sorted.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.thang}</td>
                <td style="font-weight: 600; color: #60a5fa;">${d.tuyen}</td>
                <td>${formatNum(d.so_don)}</td>
                <td>${formatPercent(d.pct_1ktc)}</td>
                <td>${formatPercent(d.pct_2ktc)}</td>
                <td>${formatPercent(d.pct_3ktc)}</td>
                <td>${formatHours(d.lt_xuat_bclay_nhap_ktc1)}</td>
                <td>${formatHours(d.lt_ktc1_ktc2)}</td>
                <td>${formatHours(d.lt_ktc2_ktc3)}</td>
                <td>${formatHours(d.lt_ktc_cuoi_nhap_bcgiao)}</td>
                <td style="font-weight: 700; color: #10b981;">${formatHours(d.lt_tong)}</td>
            </tr>
        `;
    });
}

// ==================== TAB 4: RENDER HIỆU SUẤT SHOP ====================
function filterShopData() {
    let nameSearch = document.getElementById('shop-search-name').value.toLowerCase();
    let tinhFilter = document.getElementById('shop-select-tinh').value;
    let bcSearch = document.getElementById('shop-search-bc').value.toLowerCase();

    let filtered = dbData.shop.filter(d => {
        let matchName = d.ten_kh.toLowerCase().includes(nameSearch) || d.pickwarehouseid.toLowerCase().includes(nameSearch);
        let matchTinh = tinhFilter === "" ? true : d.tinh_lay === tinhFilter;
        let matchBc = bcSearch === "" ? true : d.warehouse_name.toLowerCase().includes(bcSearch);
        return matchName && matchTinh && matchBc;
    });

    let sorted = getSortedArray(filtered, sortState.shop.key, sortState.shop.asc);

    const tbody = document.getElementById('shop-table-body');
    tbody.innerHTML = '';

    sorted.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td style="font-weight: 600; color: #f8fafc;">${d.ten_kh}</td>
                <td style="font-size: 0.85rem; color: #94a3b8;">${d.warehouse_name} (ID: ${d.pickwarehouseid})</td>
                <td>${d.tinh_lay}</td>
                <td>${d.quan}</td>
                <td style="font-weight: 600;">${formatNum(d.tong_vol)}</td>
                <td style="color: #60a5fa;">${formatNum(d.vol_tb_ngay)}</td>
                <td><span class="badge ${parseFloat(d.pct_odr) < 0.90 ? 'danger' : 'success'}">${formatPercent(d.pct_odr)}</span></td>
                <td>${formatPercent(d.pct_opr)}</td>
                <td style="font-weight: 600;">${d.top_tinh_giao}</td>
                <td>${formatPercent(d.pct_kl_top_tinh_giao)}</td>
            </tr>
        `;
    });
}
