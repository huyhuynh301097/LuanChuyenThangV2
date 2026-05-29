// Đăng ký Plugin DataLabels cho Chart.js toàn cục
Chart.register(ChartDataLabels);

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
let selectedShopName = "";

// Chart Instances
let trendChartInstance = null;
let shopChartInstance = null;

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

// Helpers
function formatNum(val) {
    if (!val) return "0";
    let n = parseFloat(val.toString().replace(/,/g, ''));
    return isNaN(n) ? val : Math.round(n).toLocaleString('vi-VN');
}

function formatPercent(val) {
    if (val === undefined || val === null || val === "") return "--";
    let s = val.toString().trim();
    if (s === "") return "--";
    if (s.includes('%')) {
        let n = parseFloat(s.replace(/%/g, ''));
        return isNaN(n) ? s : Math.round(n) + "%";
    }
    let p = parseFloat(s);
    if (isNaN(p)) return val;
    if (p <= 1.0) {
        return Math.round(p * 100) + "%";
    }
    return Math.round(p) + "%";
}

function formatHours(val) {
    if (!val) return "--";
    let h = parseFloat(val);
    return isNaN(h) ? val : Math.round(h) + "h";
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

function getFloatVal(val) {
    if (!val) return 0;
    let v = val.toString().replace(/%/g, '').replace(/,/g, '');
    let f = parseFloat(v);
    if (isNaN(f)) return 0;
    if (f <= 1.0) return f * 100;
    return f;
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
        statusText.innerText = "Đồng bộ Google Sheets thất bại! Vui lòng kiểm tra lại mạng.";
        statusText.style.color = "var(--danger-color)";
    }
}

function reloadAllData() {
    loadAllData();
}

function initApp() {
    let months = [...new Set(dbData.prov.map(d => d.thang))].filter(Boolean).sort();
    selectedMonth = months.length > 0 ? months[months.length - 1] : "2026-05";
    resetSelections();
    renderStep1();
    initHeatmap();
    
    // Tự động chọn tỉnh có điểm ưu tiên cao nhất toàn quốc làm gợi ý đầu tiên
    setTimeout(() => {
        let firstChip = document.querySelector('.province-chip');
        if (firstChip) {
            firstChip.click();
        }
    }, 100);
}

/**
 * Khởi tạo và tính toán điểm ưu tiên triển khai của 63 Tỉnh thành để vẽ Bản đồ nhiệt
 */
function initHeatmap() {
    try {
        let list = [];
        let filteredProv = dbData.prov.filter(p => p.thang === selectedMonth);
        
        filteredProv.forEach(p => {
            let provName = p.tinh_lay;
            if (!provName) return; // Bỏ qua nếu dòng trống không có tên tỉnh
            
            let longtail = getFloatVal(p.pct_longtail);
            let opr = getFloatVal(p.pct_opr);
            
            // Lấy tất cả các shop thuộc tỉnh này trong tháng hiện tại
            let shopsInProv = dbData.shop.filter(s => {
                let mMonth = s.thang ? s.thang === selectedMonth : true;
                return s.tinh_lay === provName && mMonth;
            });
            
            let totalWeight = 0;
            let numFeasibleShops = 0;
            shopsInProv.forEach(s => {
                let w = getFloatVal(s.kl_tb_ngay);
                totalWeight += w;
                if (w >= 500) {
                    numFeasibleShops++;
                }
            });
            
            // Tính toán các đầu điểm số
            let longtailScore = Math.min(25, Math.max(0, (longtail - 10) * 1.5));
            let oprScore = Math.min(25, Math.max(0, (85 - opr) * 1.5));
            let volScore = Math.min(25, (totalWeight / 8000) * 25);
            let shopsScore = Math.min(25, numFeasibleShops * 5);
            
            let score = Math.round(longtailScore + oprScore + volScore + shopsScore);
            
            // Gán phân cấp nhiệt
            let level = "Thấp";
            let heatClass = "heatmap-low";
            if (score >= 75) {
                level = "Rất cao";
                heatClass = "heatmap-critical";
            } else if (score >= 50) {
                level = "Cao";
                heatClass = "heatmap-high";
            } else if (score >= 25) {
                level = "Trung bình";
                heatClass = "heatmap-medium";
            }
            
            list.push({
                provName: provName,
                region: p.vung_lay || "Khác",
                score: score,
                level: level,
                heatClass: heatClass,
                longtail: longtail,
                opr: opr,
                totalWeight: totalWeight,
                numFeasibleShops: numFeasibleShops
            });
        });
        
        // Sắp xếp các tỉnh theo điểm ưu tiên giảm dần
        list.sort((a, b) => b.score - a.score);
        
        let northHtml = "";
        let centralHtml = "";
        let southHtml = "";
        
        list.forEach(item => {
            let regLower = (item.region || "").toString().toLowerCase();
            let chipHtml = `
                <div class="province-chip ${item.heatClass}" id="chip-${normalizeProv(item.provName)}" onclick="selectProvinceFromHeatmap('${item.provName}')" title="Điểm ưu tiên: ${item.score}/100 | Longtail: ${formatPercent(item.longtail)} | OPR: ${formatPercent(item.opr)} | Shop lớn: ${item.numFeasibleShops}">
                    <span style="font-size:0.75rem;">${item.provName}</span>
                    <span style="font-size: 0.6rem; opacity: 0.9; font-weight: 500;">Ưu tiên: ${item.score}</span>
                </div>
            `;
            
            if (regLower.includes("bắc")) {
                northHtml += chipHtml;
            } else if (regLower.includes("trung") || regLower.includes("tây nguyên") || regLower.includes("tâynguyên")) {
                centralHtml += chipHtml;
            } else {
                southHtml += chipHtml;
            }
        });
        
        document.getElementById("north-provinces").innerHTML = northHtml || `<div class="placeholder-text">Không có dữ liệu miền Bắc</div>`;
        document.getElementById("central-provinces").innerHTML = centralHtml || `<div class="placeholder-text">Không có dữ liệu miền Trung</div>`;
        document.getElementById("south-provinces").innerHTML = southHtml || `<div class="placeholder-text">Không có dữ liệu miền Nam</div>`;
    } catch (err) {
        console.error("Lỗi khi vẽ Bản đồ nhiệt (initHeatmap):", err);
        let errorPlaceholder = `<div class="placeholder-text" style="color:var(--danger-text);"><i class="fa-solid fa-circle-exclamation"></i> Lỗi xử lý dữ liệu bản đồ nhiệt.</div>`;
        document.getElementById("north-provinces").innerHTML = errorPlaceholder;
        document.getElementById("central-provinces").innerHTML = errorPlaceholder;
        document.getElementById("south-provinces").innerHTML = errorPlaceholder;
    }
}

/**
 * Xử lý khi chọn tỉnh từ Bản đồ nhiệt: Đồng bộ dashboard & phân tích tuyến đề xuất trọng điểm
 */
function selectProvinceFromHeatmap(provName) {
    try {
        if (!provName) return;
        
        // 1. Highlight chip được chọn trên Bản đồ nhiệt
        document.querySelectorAll('.province-chip').forEach(el => el.classList.remove('selected-heatmap-chip'));
        let selectedChip = document.getElementById('chip-' + normalizeProv(provName));
        if (selectedChip) {
            selectedChip.classList.add('selected-heatmap-chip');
        }
        
        // 2. Kích hoạt chọn tỉnh ở Step 1
        selectProvince(provName);
        
        // 3. Phân tích các tuyến chặng xuất phát từ tỉnh này để đưa ra đề xuất trọng điểm
        let provinceRoutes = dbData.route.filter(r => r.thang === selectedMonth && r.tuyen && r.tuyen.startsWith(provName + " - "));
        
        let routeDetails = provinceRoutes.map(r => {
            let ltInfo = dbData.lt.find(l => l.thang === selectedMonth && l.tuyen === r.tuyen);
            let dest = (r.tuyen || "").split(" - ")[1] || "Không xác định";
            
            let longtail = getFloatVal(r.pct_longtail);
            let opr = getFloatVal(r.pct_opr);
            let leadtime = ltInfo ? parseFloat(ltInfo.lt_tong) : (r.Leadtine ? parseFloat(r.Leadtine) : 0);
            let bypassSaving = ltInfo ? parseFloat(ltInfo.lt_ktc1_ktc2) : 0;
            if (isNaN(bypassSaving) || bypassSaving <= 0) bypassSaving = 12.0; // Fallback tiết kiệm 12h trung gian
            
            // Tìm các shop gửi đi tỉnh nhận này
            let normalizedDest = normalizeProv(dest);
            let shopsForRoute = dbData.shop.filter(s => {
                let mMonth = s.thang ? s.thang === selectedMonth : true;
                let matchProv = s.tinh_lay === provName;
                let normalizedShopTop = normalizeProv(s.top_tinh_giao);
                let matchDest = normalizedShopTop.includes(normalizedDest) || normalizedDest.includes(normalizedShopTop);
                return matchProv && matchDest && mMonth;
            });
            
            let totalWeightRoute = 0;
            let shopsCount = shopsForRoute.length;
            shopsForRoute.forEach(s => {
                totalWeightRoute += getFloatVal(s.kl_tb_ngay_top_tinh_giao);
            });
            
            return {
                tuyen: r.tuyen,
                dest: dest,
                vol: getFloatVal(r.vol),
                longtail: longtail,
                opr: opr,
                leadtime: leadtime,
                bypassSaving: bypassSaving,
                weight: totalWeightRoute,
                shopsCount: shopsCount
            };
        });
        
        // Lọc bỏ chặng có sản lượng bằng 0 và sắp xếp theo mức độ cấp bách (Longtail giảm dần, OPR tăng dần)
        let validRoutes = routeDetails.filter(r => r.vol > 0);
        validRoutes.sort((a, b) => b.longtail - a.longtail || a.opr - b.opr);
        
        // Lấy Top 3 tuyến
        let topRoutes = validRoutes.slice(0, 3);
        
        const sidebar = document.getElementById('heatmap-recommendation-content');
        sidebar.innerHTML = "";
        
        if (topRoutes.length === 0) {
            sidebar.innerHTML = `
                <div class="rec-province-title"><i class="fa-solid fa-location-dot"></i> Tỉnh: ${provName}</div>
                <div class="placeholder-text">Không có chặng vận chuyển nào phát sinh sản lượng lớn để đề xuất tại tỉnh này trong tháng ${selectedMonth}.</div>
            `;
            return;
        }
        
        let recHtml = `<div class="rec-province-title animate-fade-in"><i class="fa-solid fa-location-dot"></i> Tỉnh đề xuất: <strong>${provName}</strong></div>`;
        
        topRoutes.forEach(route => {
            let actionHtml = "";
            
            if (route.weight >= 8000) {
                actionHtml = `
                    <div class="rec-route-action" style="background:#f0fdf4; border-color:#bbf7d0; color:#166534;">
                        <i class="fa-solid fa-circle-check" style="color:#10b981;"></i>
                        <div>
                            <strong>Khả thi Mô hình 1!</strong> Tuyến có tổng tải gom đạt <strong>${Math.round(route.weight).toLocaleString('vi-VN')} Kg/ngày</strong> từ ${route.shopsCount} shop lớn. Nên gom đi thẳng xe 8T ngay, bypass KTC lấy để giảm <strong>-${route.bypassSaving.toFixed(1)}h</strong> Leadtime tổng!
                        </div>
                    </div>
                `;
            } else if (route.weight >= 1900) {
                actionHtml = `
                    <div class="rec-route-action" style="background:#eff6ff; border-color:#bfdbfe; color:#1e3a8a;">
                        <i class="fa-solid fa-truck" style="color:#3b82f6;"></i>
                        <div>
                            <strong>Khả thi Mô hình 2!</strong> Tổng tải gom bưu cục đi tỉnh này đạt <strong>${Math.round(route.weight).toLocaleString('vi-VN')} Kg/ngày</strong> (${route.shopsCount} shop). Đề xuất triển khai xe tải 1.9T gom đầu lấy đi thẳng, bỏ trung chuyển nội tỉnh.
                        </div>
                    </div>
                `;
            } else {
                // Đề xuất tăng trưởng volume để đi chặng gom
                let gap = 8000 - route.weight;
                let avgParcelW = 1.8;
                let neededVol = Math.round(gap / avgParcelW);
                
                actionHtml = `
                    <div class="rec-route-action" style="background:#fffbeb; border-color:#fde68a; color:#9a3412;">
                        <i class="fa-solid fa-chart-line-up" style="color:#f59e0b;"></i>
                        <div>
                            <strong>Cần tăng trưởng!</strong> Longtail chặng này rất cao (${formatPercent(route.longtail)}). Khối lượng gom hiện đạt ${Math.round(route.weight).toLocaleString('vi-VN')} Kg/ngày. Cần thúc đẩy tăng trưởng thêm <strong>+${neededVol.toLocaleString('vi-VN')} đơn/ngày</strong> (+${Math.round(gap).toLocaleString('vi-VN')} Kg) để đủ tải xe 8T đi thẳng KTC Giao.
                        </div>
                    </div>
                `;
            }
            
            recHtml += `
                <div class="rec-route-card animate-fade-in" style="cursor:pointer;" onclick="selectRoute('${route.tuyen}')">
                    <div class="rec-route-header">
                        <span class="rec-route-name"><i class="fa-solid fa-circle-arrow-right text-purple"></i> Tuyến đi: <strong>${route.dest}</strong></span>
                        <span class="badge-standard" style="font-size:0.65rem; padding: 2px 6px;">Top ${route.shopsCount} shop</span>
                    </div>
                    
                    <div class="rec-route-metrics">
                        <div class="rec-metric-item">
                            <span>Leadtime</span>
                            <strong>${formatHours(route.leadtime)}</strong>
                        </div>
                        <div class="rec-metric-item">
                            <span>% Longtail</span>
                            <strong class="${getLongtailClass(route.longtail)}">${formatPercent(route.longtail)}</strong>
                        </div>
                        <div class="rec-metric-item">
                            <span>% OPR</span>
                            <strong class="${getOPRClass(route.opr)}">${formatPercent(route.opr)}</strong>
                        </div>
                    </div>
                    
                    ${actionHtml}
                </div>
            `;
        });
        
        sidebar.innerHTML = recHtml;
    } catch (err) {
        console.error("Lỗi khi chọn tỉnh từ Bản đồ nhiệt (selectProvinceFromHeatmap):", err);
    }
}

function resetSelections() {
    selectedProv = "";
    selectedRoute = "";
    selectedShopName = "";
    
    document.getElementById('section-step2').classList.add('disabled-step');
    document.getElementById('section-step3').classList.add('disabled-step');
    
    document.getElementById('selected-prov-label').innerText = "Chưa Chọn";
    document.getElementById('shop-prov-label').innerText = "Chưa Chọn";
    document.getElementById('shop-dest-label').innerText = "Chưa Chọn";
    document.getElementById('trend-route-label').innerText = "Chưa Chọn";
    document.getElementById('trend-shop-label').innerText = "Chưa Chọn";

    document.getElementById('route-tbody').innerHTML = `<tr><td colspan="16" class="placeholder-text">Vui lòng nhấp chọn một Tỉnh Lấy ở bảng Hiệu suất theo tỉnh để hiển thị tuyến kết nối.</td></tr>`;
    document.getElementById('shop-tbody').innerHTML = `<tr><td colspan="20" class="placeholder-text">Vui lòng nhấp chọn một Tuyến Vận Chuyển ở bảng Tuyến lấy - giao để đối soát danh sách shop.</td></tr>`;
    
    // Reset Step 4
    document.getElementById('section-step4').classList.add('disabled-step');
    document.getElementById('consolidate-prov-label').innerText = "Chưa Chọn";
    document.getElementById('ktc-giao-name').innerText = "Chưa Chọn";
    document.getElementById('ktc-lay-name').innerText = "Chưa Chọn";
    
    document.getElementById('8t-fleet-total-kl').innerText = "0 Kg";
    document.getElementById('8t-fleet-total-trucks').innerText = "0 Xe";
    document.getElementById('8t-fleet-feasible-trucks').innerText = "0 Xe";
    document.getElementById('8t-fleet-avg-fill').innerText = "0%";
    document.getElementById('8t-fleet-leadtime-saved').innerText = "0h";
    document.getElementById('8t-fleet-progress-text').innerText = "0 / 0 Xe (0%)";
    document.getElementById('8t-fleet-progress-bar').style.width = "0%";
    document.getElementById('8t-truck-list-container').innerHTML = `<div class="placeholder-text">Chọn Tuyến ở Bước 2 để lập phương án ghép xe 8T.</div>`;

    document.getElementById('19t-fleet-total-kl').innerText = "0 Kg";
    document.getElementById('19t-fleet-total-trucks').innerText = "0 Xe";
    document.getElementById('19t-fleet-feasible-trucks').innerText = "0 Xe";
    document.getElementById('19t-fleet-avg-fill').innerText = "0%";
    document.getElementById('19t-fleet-leadtime-saved').innerText = "0h";
    document.getElementById('19t-fleet-progress-text').innerText = "0 / 0 Xe (0%)";
    document.getElementById('19t-fleet-progress-bar').style.width = "0%";
    document.getElementById('19t-truck-list-container').innerHTML = `<div class="placeholder-text">Chọn Tuyến ở Bước 2 để lập phương án ghép xe 1.9T.</div>`;
    
    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }
    if (shopChartInstance) {
        shopChartInstance.destroy();
        shopChartInstance = null;
    }
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

function getODRClass(val) {
    if (val === undefined || val === null || val === "") return '';
    let p = getFloatVal(val);
    if (p < 88.0) return 'hl-cell-red';
    if (p < 92.0) return 'hl-cell-yellow';
    return 'hl-cell-green';
}

function getLongtailClass(val) {
    if (val === undefined || val === null || val === "") return '';
    let p = getFloatVal(val);
    if (p > 18.0) return 'hl-cell-red';
    if (p > 15.0) return 'hl-cell-yellow';
    return 'hl-cell-green';
}

function getOPRClass(val) {
    if (val === undefined || val === null || val === "") return '';
    let p = getFloatVal(val);
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
                <td style="font-weight: 600; color: #0f172a;">${d.tinh_lay}</td>
                <td style="font-weight: 600; color: var(--accent-color);">${formatNum(d.vol)}</td>
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
    
    document.getElementById('section-step2').classList.remove('disabled-step');
    document.getElementById('section-step3').classList.add('disabled-step');
    
    document.getElementById('selected-prov-label').innerText = provName;
    document.getElementById('shop-prov-label').innerText = provName;
    document.getElementById('shop-dest-label').innerText = "Chưa Chọn";
    document.getElementById('trend-route-label').innerText = "Chưa Chọn";
    document.getElementById('trend-shop-label').innerText = "Chưa Chọn";

    document.getElementById('shop-tbody').innerHTML = `<tr><td colspan="20" class="placeholder-text">Vui lòng nhấp chọn một Tuyến Vận Chuyển ở Bước 2 để đối soát danh sách shop.</td></tr>`;
    
    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }
    if (shopChartInstance) {
        shopChartInstance.destroy();
        shopChartInstance = null;
    }

    renderStep1();
    renderStep2();
}

// ==================== BƯỚC 2: RENDER TUYẾN GIAO ====================
function renderStep2() {
    let matchedRoutes = dbData.route.filter(r => r.thang === selectedMonth && r.tuyen.startsWith(selectedProv + " - "));
    
    let joined = matchedRoutes.map(r => {
        let ltInfo = dbData.lt.find(l => l.thang === selectedMonth && l.tuyen === r.tuyen);
        let ktc_lay = r["KTC/KCT lấy"] || "";
        let ktc_giao = r["KTC/KCT giao"] || "";
        
        return {
            ...r,
            lt_tong: ltInfo ? ltInfo.lt_tong : r.Leadtine,
            pct_1ktc: ltInfo ? ltInfo.pct_1ktc : "",
            pct_2ktc: ltInfo ? ltInfo.pct_2ktc : "",
            pct_3ktc: ltInfo ? ltInfo.pct_3ktc : "",
            pct_4plus_ktc: ltInfo ? ltInfo.pct_4plus_ktc : "",
            lt_xuat_bclay_nhap_ktc1: ltInfo ? ltInfo.lt_xuat_bclay_nhap_ktc1 : "",
            lt_ktc1_ktc2: ltInfo ? ltInfo.lt_ktc1_ktc2 : "",
            lt_ktc2_ktc3: ltInfo ? ltInfo.lt_ktc2_ktc3 : "",
            lt_ktc_cuoi_nhap_bcgiao: ltInfo ? ltInfo.lt_ktc_cuoi_nhap_bcgiao : "",
            ktc_lay: ktc_lay,
            ktc_giao: ktc_giao
        };
    });

    let sorted = getSortedArr(joined, sortState.route.key, sortState.route.asc);
    
    const tbody = document.getElementById('route-tbody');
    tbody.innerHTML = '';

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="16" class="placeholder-text">Không có tuyến gửi nào xuất phát từ ${selectedProv} trong tháng ${selectedMonth}.</td></tr>`;
        return;
    }

    sorted.forEach(r => {
        let isSelected = (selectedRoute === r.tuyen) ? 'selected-row' : '';

        tbody.innerHTML += `
            <tr class="${isSelected}" onclick="selectRoute('${r.tuyen}')">
                <td style="font-weight: 600; color: var(--accent-color);">${r.tuyen}</td>
                <td style="font-weight: 600;">${formatNum(r.vol)}</td>
                <td class="${getOPRClass(r.pct_opr)}">${formatPercent(r.pct_opr)}</td>
                <td class="${getODRClass(r.pct_odr)}">${formatPercent(r.pct_odr)}</td>
                <td class="${getLongtailClass(r.pct_longtail)}">${formatPercent(r.pct_longtail)}</td>
                <td style="font-weight: 700; color: #166534;">${formatHours(r.lt_tong)}</td>
                <td>${formatPercent(r.pct_1ktc)}</td>
                <td>${formatPercent(r.pct_2ktc)}</td>
                <td>${formatPercent(r.pct_3ktc)}</td>
                <td>${formatPercent(r.pct_4plus_ktc)}</td>
                <td>${formatHours(r.lt_xuat_bclay_nhap_ktc1)}</td>
                <td>${formatHours(r.lt_ktc1_ktc2)}</td>
                <td>${formatHours(r.lt_ktc2_ktc3)}</td>
                <td>${formatHours(r.lt_ktc_cuoi_nhap_bcgiao)}</td>
                <td style="font-weight: 500; color: #0369a1;">${r.ktc_lay || "--"}</td>
                <td style="font-weight: 500; color: #6b21a8;">${r.ktc_giao || "--"}</td>
            </tr>
        `;
    });
}

function selectRoute(routeName) {
    selectedRoute = routeName;
    document.getElementById('section-step3').classList.remove('disabled-step');
    document.getElementById('section-step4').classList.remove('disabled-step');
    
    let destProv = routeName.split(" - ")[1];
    document.getElementById('shop-dest-label').innerText = destProv;
    document.getElementById('trend-route-label').innerText = routeName;
    document.getElementById('consolidate-prov-label').innerText = selectedProv;

    renderStep2();
    renderStep3();
    buildTrendChart(routeName);
    calculateConsolidation(routeName);
    
    // Clear Shop chart initially until clicked
    if (shopChartInstance) {
        shopChartInstance.destroy();
        shopChartInstance = null;
    }
    document.getElementById('trend-shop-label').innerText = "Nhấp chọn shop bên dưới";
}

// ==================== BƯỚC 3: RENDER SHOP & TREND CHARTS ====================
function renderStep3() {
    let destProv = selectedRoute.split(" - ")[1];
    let normalizedDest = normalizeProv(destProv);

    let filteredShops = dbData.shop.filter(s => {
        let matchProv = s.tinh_lay === selectedProv;
        let normalizedShopTop = normalizeProv(s.top_tinh_giao);
        let matchDest = normalizedShopTop.includes(normalizedDest) || normalizedDest.includes(normalizedShopTop);
        
        let matchMonth = true;
        if (s.thang) {
            matchMonth = s.thang === selectedMonth;
        }
        return matchProv && matchDest && matchMonth;
    });

    let sorted = getSortedArr(filteredShops, sortState.shop.key, sortState.shop.asc);
    const tbody = document.getElementById('shop-tbody');
    tbody.innerHTML = '';

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="20" class="placeholder-text">Không có shop nào tại ${selectedProv} gửi đơn nhiều nhất đi ${destProv} trong cơ sở dữ liệu.</td></tr>`;
        return;
    }

    sorted.forEach(s => {
        let isSelected = (selectedShopName === s.ten_kh) ? 'selected-row' : '';

        let pctKlTop = getFloatVal(s.pct_kl_top_tinh_giao);
        if (pctKlTop <= 0) {
            let tKl = getFloatVal(s.tong_kl);
            let topKl = getFloatVal(s.kl_top_tinh_giao);
            if (tKl > 0) pctKlTop = (topKl / tKl) * 100;
        }
        if (pctKlTop <= 0) pctKlTop = 100;

        tbody.innerHTML += `
            <tr class="${isSelected}" onclick="selectShopRow(this, '${s.ten_kh}', ${getFloatVal(s.pct_odr)}, ${getFloatVal(s.pct_opr)})">
                <td style="font-weight: 600; color: #0f172a;">${s.ten_kh}</td>
                <td>${s.pickwarehouseid}</td>
                <td style="font-size: 0.82rem; color: var(--text-muted);">${s.warehouse_name}</td>
                <td>${s.vung}</td>
                <td>${s.tinh_lay}</td>
                <td>${s.quan}</td>
                <td style="font-weight: 600;">${formatNum(s.tong_vol)}</td>
                <td>${formatNum(s.tong_kl)}</td>
                <td>${s.so_ngay}</td>
                <td style="color: var(--accent-color); font-weight: 600;">${formatNum(s.vol_tb_ngay)}</td>
                <td>${formatNum(s.kl_tb_ngay)}</td>
                <td>${formatPercent(s.pct_tren_5kg)}</td>
                <td class="${getOPRClass(s.pct_opr)}">${formatPercent(s.pct_opr)}</td>
                <td>${formatPercent(s.pct_rot_lc)}</td>
                <td class="${getODRClass(s.pct_odr)}">${formatPercent(s.pct_odr)}</td>
                <td class="${getLongtailClass(s.pct_longtail)}">${formatPercent(s.pct_longtail)}</td>
                <td style="font-weight: 600;">${s.top_tinh_giao}</td>
                <td>${formatNum(s.kl_top_tinh_giao)}</td>
                <td>${formatPercent(pctKlTop)}</td>
                <td style="font-weight: 600; color: #9a3412;">${formatNum(s.kl_tb_ngay_top_tinh_giao)} kg/ngày</td>
            </tr>
        `;
    });
}

// Click chọn shop để hiển thị Trend Shop cụ thể
function selectShopRow(rowElement, shopName, odr, opr) {
    selectedShopName = shopName;
    
    // Highlight Row
    let rows = document.querySelectorAll('#shop-table tbody tr');
    rows.forEach(r => r.classList.remove('selected-row'));
    rowElement.classList.add('selected-row');

    buildShopTrendChart(shopName, odr, opr);
}

function buildTrendChart(routeName) {
    let months = ["2026-03", "2026-04", "2026-05"];
    
    let odrs = [];
    let longtails = [];
    let leadtimes = [];
    let pct1ktc = [];
    let pct2ktc = [];
    let pct3ktc = [];
    let vols = [];
    let weights = [];

    months.forEach(m => {
        let marData = dbData.route.find(r => r.thang === m && r.tuyen === routeName);
        let marLt = dbData.lt.find(l => l.thang === m && l.tuyen === routeName);

        odrs.push(marData ? getFloatVal(marData.pct_odr) : 0);
        longtails.push(marData ? getFloatVal(marData.pct_longtail) : 0);
        
        let ltTong = marLt ? parseFloat(marLt.lt_tong) : (marData ? parseFloat(marData.Leadtine) : 0);
        leadtimes.push(isNaN(ltTong) ? 0 : ltTong);

        pct1ktc.push(marLt ? getFloatVal(marLt.pct_1ktc) : 0);
        pct2ktc.push(marLt ? getFloatVal(marLt.pct_2ktc) : 0);
        pct3ktc.push(marLt ? getFloatVal(marLt.pct_3ktc) : 0);

        vols.push(marData ? getFloatVal(marData.vol) : 0);
        weights.push(marData ? getFloatVal(marData.kl) : 0);
    });

    const ctx = document.getElementById('routeTrendChart').getContext('2d');
    
    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ["Tháng 3", "Tháng 4", "Tháng 5"],
            datasets: [
                {
                    label: 'ODR (%)',
                    data: odrs,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.02)',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 3,
                    pointRadius: 5
                },
                {
                    label: 'Longtail (%)',
                    data: longtails,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.02)',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 2.5,
                    borderDash: [5, 5],
                    pointRadius: 4
                },
                {
                    label: '%1KTC',
                    data: pct1ktc,
                    borderColor: '#f97316',
                    backgroundColor: 'transparent',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: '%2KTC',
                    data: pct2ktc,
                    borderColor: '#06b6d4',
                    backgroundColor: 'transparent',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: '%3KTC',
                    data: pct3ktc,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'transparent',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'Leadtime (h)',
                    data: leadtimes,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.02)',
                    yAxisID: 'yLeadtime',
                    tension: 0.25,
                    borderWidth: 3,
                    pointRadius: 5
                },
                {
                    label: 'Volume (đơn)',
                    data: vols,
                    borderColor: '#64748b',
                    backgroundColor: 'rgba(100, 116, 139, 0.02)',
                    yAxisID: 'yQty',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'Khối lượng (Kg)',
                    data: weights,
                    borderColor: '#b45309',
                    backgroundColor: 'rgba(180, 83, 9, 0.02)',
                    yAxisID: 'yQty',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    min: 0,
                    max: 100,
                    ticks: {
                        color: '#475569',
                        callback: function(value) { return Math.round(value) + "%"; }
                    },
                    grid: { color: 'rgba(0, 0, 0, 0.04)' },
                    title: { display: true, text: 'Tỷ lệ (%)', font: { size: 10, weight: '600' } }
                },
                yLeadtime: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    ticks: {
                        color: '#475569',
                        callback: function(value) { return Math.round(value) + "h"; }
                    },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Leadtime (giờ)', font: { size: 10, weight: '600' } }
                },
                yQty: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    ticks: {
                        color: '#475569',
                        callback: function(value) { return Math.round(value).toLocaleString('vi-VN'); }
                    },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Sản lượng/Khối lượng', font: { size: 10, weight: '600' } }
                },
                x: {
                    ticks: { color: '#475569' },
                    grid: { color: 'rgba(0, 0, 0, 0.04)' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#0f172a', font: { size: 10, weight: '500' } }
                },
                datalabels: {
                    display: function(context) {
                        return context.datasetIndex === 0 || context.datasetIndex === 1 || context.datasetIndex === 5;
                    },
                    align: 'top',
                    anchor: 'end',
                    font: {
                        family: "'Inter', sans-serif",
                        size: 9,
                        weight: '700'
                    },
                    color: function(context) {
                        return context.dataset.borderColor;
                    },
                    formatter: function(value, context) {
                        let label = context.dataset.label;
                        if (label.includes('%') || label.includes('ODR') || label.includes('Longtail')) {
                            return Math.round(value) + "%";
                        }
                        if (label.includes('Leadtime')) {
                            return Math.round(value) + "h";
                        }
                        return Math.round(value).toLocaleString('vi-VN');
                    },
                    offset: 4
                }
            }
        }
    });
}

function buildShopTrendChart(shopName, odr, opr) {
    const ctx = document.getElementById('shopTrendChart').getContext('2d');
    
    if (shopChartInstance) {
        shopChartInstance.destroy();
    }
    
    document.getElementById('trend-shop-label').innerText = shopName;

    let rawShopsForName = dbData.shop.filter(x => x.ten_kh === shopName);
    
    let months = ["2026-03", "2026-04", "2026-05"];
    let odrs = [];
    let oprs = [];
    let longtails = [];
    let rotlcs = [];
    let leadtimes = [];
    let vols = [];
    let weights = [];

    months.forEach(m => {
        let matched = rawShopsForName.find(x => x.thang === m);
        if (matched) {
            odrs.push(getFloatVal(matched.pct_odr));
            oprs.push(getFloatVal(matched.pct_opr));
            longtails.push(getFloatVal(matched.pct_longtail));
            rotlcs.push(getFloatVal(matched.pct_rot_lc));
            vols.push(getFloatVal(matched.tong_vol));
            weights.push(getFloatVal(matched.tong_kl));
            
            // Tính toán leadtime shop đi top province nhận trong tháng m
            let shopTopGiao = matched.top_tinh_giao;
            let shopTuyen = matched.tinh_lay + " - " + shopTopGiao;
            
            let matchedRoute = dbData.route.find(r => r.thang === m && r.tuyen === shopTuyen);
            let matchedLt = dbData.lt.find(l => l.thang === m && l.tuyen === shopTuyen);
            let ltValue = matchedLt ? parseFloat(matchedLt.lt_tong) : (matchedRoute ? parseFloat(matchedRoute.Leadtine) : 0);
            
            if (isNaN(ltValue) || ltValue <= 0) {
                // fallback to selected route's leadtime for that month
                let selRouteLt = dbData.lt.find(l => l.thang === m && l.tuyen === selectedRoute);
                let selRouteData = dbData.route.find(r => r.thang === m && r.tuyen === selectedRoute);
                ltValue = selRouteLt ? parseFloat(selRouteLt.lt_tong) : (selRouteData ? parseFloat(selRouteData.Leadtine) : 35.0);
            }
            leadtimes.push(ltValue);
        } else {
            // fallback simulated if no match
            odrs.push(odr);
            oprs.push(opr);
            longtails.push(12.5);
            rotlcs.push(2.1);
            leadtimes.push(35.0);
            vols.push(1000);
            weights.push(2000);
        }
    });

    shopChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ["Tháng 3", "Tháng 4", "Tháng 5"],
            datasets: [
                {
                    label: 'Shop ODR (%)',
                    data: odrs,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.02)',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 3,
                    pointRadius: 5
                },
                {
                    label: 'Shop OPR (%)',
                    data: oprs,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.02)',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 3,
                    pointRadius: 5
                },
                {
                    label: 'Longtail (%)',
                    data: longtails,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'Rớt LC (%)',
                    data: rotlcs,
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    yAxisID: 'y',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'Leadtime (h)',
                    data: leadtimes,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.02)',
                    yAxisID: 'yLeadtime',
                    tension: 0.25,
                    borderWidth: 2.5,
                    pointRadius: 4
                },
                {
                    label: 'Volume (đơn)',
                    data: vols,
                    borderColor: '#64748b',
                    backgroundColor: 'transparent',
                    yAxisID: 'yQty',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'Khối lượng (Kg)',
                    data: weights,
                    borderColor: '#b45309',
                    backgroundColor: 'transparent',
                    yAxisID: 'yQty',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    min: 0,
                    max: 100,
                    ticks: {
                        color: '#475569',
                        callback: function(value) { return Math.round(value) + "%"; }
                    },
                    grid: { color: 'rgba(0, 0, 0, 0.04)' },
                    title: { display: true, text: 'Tỷ lệ (%)', font: { size: 10, weight: '600' } }
                },
                yLeadtime: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    ticks: {
                        color: '#475569',
                        callback: function(value) { return Math.round(value) + "h"; }
                    },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Leadtime (giờ)', font: { size: 10, weight: '600' } }
                },
                yQty: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    ticks: {
                        color: '#475569',
                        callback: function(value) { return Math.round(value).toLocaleString('vi-VN'); }
                    },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Sản lượng/Khối lượng', font: { size: 10, weight: '600' } }
                },
                x: {
                    ticks: { color: '#475569' },
                    grid: { color: 'rgba(0, 0, 0, 0.04)' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#0f172a', font: { size: 10, weight: '500' } }
                },
                datalabels: {
                    display: function(context) {
                        return context.datasetIndex === 0 || context.datasetIndex === 1 || context.datasetIndex === 4;
                    },
                    align: 'top',
                    anchor: 'end',
                    font: {
                        family: "'Inter', sans-serif",
                        size: 9,
                        weight: '700'
                    },
                    color: function(context) {
                        return context.dataset.borderColor;
                    },
                    formatter: function(value, context) {
                        let label = context.dataset.label;
                        if (label.includes('%') || label.includes('ODR') || label.includes('Longtail')) {
                            return Math.round(value) + "%";
                        }
                        if (label.includes('Leadtime')) {
                            return Math.round(value) + "h";
                        }
                        return Math.round(value).toLocaleString('vi-VN');
                    },
                    offset: 4
                }
            }
        }
    });
}

// ==================== BƯỚC 4: TÍNH TOÁN GOM GHÉP SHOP TỐI ƯU LOGISTICS ====================

/**
 * Thuật toán lập phương án gom ghép xe tải luân chuyển theo Bưu cục lấy (Pick Warehouse)
 * Giới hạn tối đa 2-3 shop/xe. 
 * Tự động tách shop lớn tự thân đủ tải thành xe riêng.
 * Gom các shop nhỏ chéo nhau bằng thuật toán Least-Excess để tối đa hóa số xe khả thi.
 */
function planTrucks(shops, capacity, weightKey, getVolFn) {
    let trucks = [];
    let deployedWeights = {}; // Tên shop -> khối lượng đã gom thành công trên xe khả thi
    let deployedVols = {};    // Tên shop -> sản lượng đã gom thành công trên xe khả thi
    
    // Gom nhóm shop theo Bưu cục lấy (pickwarehouseid hoặc fallback warehouse_name)
    let poGroups = {};
    shops.forEach(s => {
        let poId = s.pickwarehouseid || s.warehouse_name || "MACDINH";
        let poName = s.warehouse_name || s.pickwarehouseid || "Bưu cục không tên";
        if (!poGroups[poId]) {
            poGroups[poId] = {
                id: poId,
                name: poName,
                shops: []
            };
        }
        poGroups[poId].shops.push(s);
    });
    
    // Xử lý gom xe cho từng bưu cục
    for (let poId in poGroups) {
        let po = poGroups[poId];
        let candidates = []; // Các shop nhỏ hoặc phần dư cần gom ghép
        
        // 1. Tách các shop lớn tự thân đủ tải (weight >= capacity)
        po.shops.forEach(s => {
            let weight = getFloatVal(s[weightKey]);
            let vol = getVolFn(s);
            
            if (weight <= 0) return;
            
            if (weight >= capacity) {
                // Chia thành N xe đầy tải
                let numFullTrucks = Math.floor(weight / capacity);
                for (let i = 0; i < numFullTrucks; i++) {
                    trucks.push({
                        postOfficeId: po.id,
                        postOfficeName: po.name,
                        district: s.quan || "--",
                        isFeasible: true,
                        totalWeight: capacity,
                        totalVolume: vol * (capacity / weight),
                        capacity: capacity,
                        shops: [{
                            ten_kh: s.ten_kh,
                            quan: s.quan || "--",
                            vol: vol * (capacity / weight),
                            kl: capacity,
                            isRemainder: false
                        }]
                    });
                    
                    // Ghi nhận sản lượng đã triển khai
                    deployedWeights[s.ten_kh] = (deployedWeights[s.ten_kh] || 0) + capacity;
                    deployedVols[s.ten_kh] = (deployedVols[s.ten_kh] || 0) + vol * (capacity / weight);
                }
                
                // Phần dư được đưa vào hàng đợi gom ghép
                let remainderW = weight % capacity;
                if (remainderW > 0) {
                    let remainderV = vol * (remainderW / weight);
                    candidates.push({
                        shopRef: s,
                        ten_kh: s.ten_kh,
                        quan: s.quan || "--",
                        weight: remainderW,
                        volume: remainderV,
                        isRemainder: true
                    });
                }
            } else {
                candidates.push({
                    shopRef: s,
                    ten_kh: s.ten_kh,
                    quan: s.quan || "--",
                    weight: weight,
                    volume: vol,
                    isRemainder: false
                });
            }
        });
        
        // 2. Gom ghép các shop nhỏ/phần dư (tối đa 3 shop/xe)
        // Sắp xếp giảm dần theo khối lượng để ưu tiên ghép shop lớn trước
        candidates.sort((a, b) => b.weight - a.weight);
        let used = new Set();
        
        function buildGroupTruck(indices, isFeasible) {
            let truckShops = indices.map(idx => {
                let c = candidates[idx];
                return {
                    ten_kh: c.ten_kh,
                    quan: c.quan,
                    vol: c.volume,
                    kl: c.weight,
                    isRemainder: c.isRemainder
                };
            });
            
            let totalW = truckShops.reduce((sum, ts) => sum + ts.kl, 0);
            let totalV = truckShops.reduce((sum, ts) => sum + ts.vol, 0);
            let districts = [...new Set(truckShops.map(ts => ts.quan).filter(Boolean))].join(", ");
            
            trucks.push({
                postOfficeId: po.id,
                postOfficeName: po.name,
                district: districts || "--",
                isFeasible: isFeasible,
                totalWeight: totalW,
                totalVolume: totalV,
                capacity: capacity,
                shops: truckShops
            });
            
            indices.forEach(idx => used.add(idx));
            
            if (isFeasible) {
                truckShops.forEach(ts => {
                    deployedWeights[ts.ten_kh] = (deployedWeights[ts.ten_kh] || 0) + ts.kl;
                    deployedVols[ts.ten_kh] = (deployedVols[ts.ten_kh] || 0) + ts.vol;
                });
            }
        }
        
        // Thử ghép các cặp (2 shop) hoặc bộ ba (3 shop) đạt đủ tải trọng xe (>= capacity)
        for (let i = 0; i < candidates.length; i++) {
            if (used.has(i)) continue;
            
            // Tìm shop j tốt nhất để ghép cặp (2 shop)
            let bestJ = -1;
            let minExcessPair = Infinity;
            for (let j = i + 1; j < candidates.length; j++) {
                if (used.has(j)) continue;
                let sum = candidates[i].weight + candidates[j].weight;
                if (sum >= capacity) {
                    let excess = sum - capacity;
                    if (excess < minExcessPair) {
                        minExcessPair = excess;
                        bestJ = j;
                    }
                }
            }
            
            if (bestJ !== -1) {
                buildGroupTruck([i, bestJ], true);
                continue;
            }
            
            // Tìm cặp (j, k) tốt nhất để ghép bộ ba (3 shop)
            let bestJK = null;
            let minExcessTriplet = Infinity;
            for (let j = i + 1; j < candidates.length; j++) {
                if (used.has(j)) continue;
                for (let k = j + 1; k < candidates.length; k++) {
                    if (used.has(k)) continue;
                    let sum = candidates[i].weight + candidates[j].weight + candidates[k].weight;
                    if (sum >= capacity) {
                        let excess = sum - capacity;
                        if (excess < minExcessTriplet) {
                            minExcessTriplet = excess;
                            bestJK = [j, k];
                        }
                    }
                }
            }
            
            if (bestJK !== null) {
                buildGroupTruck([i, bestJK[0], bestJK[1]], true);
                continue;
            }
        }
        
        // 3. Gom nhóm tất cả các shop còn lại chưa đủ tải trọng (Chờ tăng trưởng)
        // Mỗi xe gom tối đa 3 shop trong cùng bưu cục
        for (let i = 0; i < candidates.length; i++) {
            if (used.has(i)) continue;
            
            let indices = [i];
            for (let j = i + 1; j < candidates.length && indices.length < 3; j++) {
                if (!used.has(j)) {
                    indices.push(j);
                }
            }
            
            buildGroupTruck(indices, false);
        }
    }
    
    return { trucks, deployedWeights, deployedVols };
}

/**
 * Render danh sách xe ghép tải luân chuyển dưới dạng các Fleet Cards
 */
function renderFleet(containerId, trucks, capacity, modelNum) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    
    if (trucks.length === 0) {
        container.innerHTML = `<div class="placeholder-text">Không có xe luân chuyển nào được thiết lập. Chọn một Tuyến ở bảng Bước 2 để tính toán.</div>`;
        return;
    }
    
    trucks.forEach((truck, index) => {
        let isFeasible = truck.isFeasible;
        let cardClass = isFeasible ? "feasible" : "potential";
        let badgeClass = isFeasible ? "badge-direct" : "badge-group";
        let badgeText = isFeasible ? `Khả Thi (Đủ xe ${modelNum === 1 ? '8T' : '1.9T'})` : "Chờ Tăng Trưởng";
        
        let fillPct = Math.min(100, (truck.totalWeight / capacity) * 100);
        
        let growthHtml = "";
        if (!isFeasible) {
            let gap = capacity - truck.totalWeight;
            let growthWeightPct = (gap / truck.totalWeight) * 100;
            if (truck.totalWeight <= 0) growthWeightPct = 100;
            
            // Tính số đơn tương đương dựa trên trọng lượng đơn trung bình của xe
            let avgWeightPerParcel = 1.8; // Fallback mặc định
            if (truck.totalVolume > 0 && truck.totalWeight > 0) {
                avgWeightPerParcel = truck.totalWeight / truck.totalVolume;
            }
            let additionalVol = gap / avgWeightPerParcel;
            
            growthHtml = `
                <div class="truck-growth-card">
                    <i class="fa-solid fa-chart-line-up"></i>
                    <div>
                        <strong>Khuyến nghị tăng trưởng:</strong> Cần tăng thêm <strong>+${Math.round(gap).toLocaleString('vi-VN')} Kg</strong> 
                        (+${Math.round(growthWeightPct)}% khối lượng, tương đương khoảng <strong>+${Math.round(additionalVol).toLocaleString('vi-VN')} đơn/ngày</strong>) 
                        để đạt tải trọng chuẩn của xe ${modelNum === 1 ? '8T' : '1.9T'} và triển khai Mô hình ${modelNum}.
                    </div>
                </div>
            `;
        }
        
        let shopsRows = "";
        truck.shops.sort((a, b) => b.kl - a.kl).forEach(s => {
            let labelRemainder = s.isRemainder ? " <span style='font-size:0.68rem;color:#a855f7;font-style:italic;'>[Phần dư]</span>" : "";
            shopsRows += `
                <tr>
                    <td class="shop-name-cell">${s.ten_kh}${labelRemainder}</td>
                    <td>${s.quan || "--"}</td>
                    <td>${formatNum(Math.round(s.vol))} đơn/ngày</td>
                    <td class="shop-highlight-cell">${formatNum(Math.round(s.kl))} Kg</td>
                </tr>
            `;
        });
        
        let iconName = modelNum === 1 ? "fa-truck-moving" : "fa-truck";
        
        container.innerHTML += `
            <div class="truck-card ${cardClass}">
                <div class="truck-card-header">
                    <div class="truck-card-title">
                        <i class="fa-solid ${iconName}"></i>
                        <span>Xe #${index + 1} - Bưu cục: <strong>${truck.postOfficeName}</strong></span>
                    </div>
                    <div class="${badgeClass}">${badgeText}</div>
                </div>
                
                <div class="truck-fill-row">
                    <div class="truck-fill-track">
                        <div class="truck-fill-bar" style="width: ${fillPct}%"></div>
                    </div>
                    <div class="truck-fill-text">${Math.round(truck.totalWeight).toLocaleString('vi-VN')} / ${capacity.toLocaleString('vi-VN')} Kg (${fillPct.toFixed(1)}%)</div>
                </div>
                
                ${growthHtml}
                
                <table class="truck-shops-table">
                    <thead>
                        <tr>
                            <th>Tên Shop</th>
                            <th>Quận/Huyện</th>
                            <th>Sản lượng</th>
                            <th>Khối lượng</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shopsRows}
                    </tbody>
                </table>
            </div>
        `;
    });
}

function calculateConsolidation(routeName) {
    let currentRouteData = dbData.route.find(r => r.thang === selectedMonth && r.tuyen === routeName);
    let ltInfo = dbData.lt.find(l => l.thang === selectedMonth && l.tuyen === routeName);
    
    let ktcLay = currentRouteData ? currentRouteData["KTC/KCT lấy"] : "";
    let ktcGiao = currentRouteData ? currentRouteData["KTC/KCT giao"] : "";
    
    document.getElementById('ktc-lay-name').innerText = ktcLay || "Chưa xác định";
    document.getElementById('ktc-giao-name').innerText = ktcGiao || "Chưa xác định";
    
    // Lấy toàn bộ shop thuộc tỉnh lấy trong tháng được chọn
    let allShopsInProv = dbData.shop.filter(s => {
        let matchProv = s.tinh_lay === selectedProv;
        let matchMonth = true;
        if (s.thang) {
            matchMonth = s.thang === selectedMonth;
        }
        return matchProv && matchMonth;
    });
    
    // ----------------------------------------------------
    // MÔ HÌNH 1: LUÂN CHUYỂN THẲNG XE 8T (Capacity: 8,000 Kg)
    // ----------------------------------------------------
    let shops8T = allShopsInProv.filter(s => {
        let normalizedTop = normalizeProv(s.top_tinh_giao);
        let shopRouteData = dbData.route.find(r => {
            if (r.thang !== selectedMonth) return false;
            if (!r.tuyen) return false;
            let parts = r.tuyen.split(" - ");
            if (parts.length < 2) return false;
            return parts[0] === selectedProv && normalizeProv(parts[1]) === normalizedTop;
        });
        let shopKtcGiao = shopRouteData ? shopRouteData["KTC/KCT giao"] : "";
        return shopKtcGiao && shopKtcGiao === ktcGiao;
    });
    
    // Hàm tính Volume riêng cho chặng đi tỉnh giao top của shop ở mô hình 1
    let getVolModel1 = s => {
        let pct = getFloatVal(s.pct_kl_top_tinh_giao);
        if (pct <= 0) {
            let tKl = getFloatVal(s.tong_kl);
            let topKl = getFloatVal(s.kl_top_tinh_giao);
            if (tKl > 0) pct = (topKl / tKl) * 100;
        }
        if (pct <= 0) pct = 100;
        return getFloatVal(s.vol_tb_ngay) * (pct / 100);
    };
    
    // Lập phương án xe tải Mô hình 1 (Xe 8T)
    let result8T = planTrucks(shops8T, 8000, "kl_tb_ngay_top_tinh_giao", getVolModel1);
    
    // Tiết kiệm Leadtime xe 8T: Bypass KTC Lấy, tiết kiệm chặng lt_ktc1_ktc2
    let ltSaved8T = 0;
    if (ltInfo && ltInfo.lt_ktc1_ktc2) {
        ltSaved8T = parseFloat(ltInfo.lt_ktc1_ktc2);
    } else if (currentRouteData && currentRouteData.lt_ktc1_ktc2) {
        ltSaved8T = parseFloat(currentRouteData.lt_ktc1_ktc2);
    }
    if (isNaN(ltSaved8T)) ltSaved8T = 0;
    
    // ----------------------------------------------------
    // MÔ HÌNH 2: LUÂN CHUYỂN THẲNG XE 1.9T (Capacity: 1,900 Kg)
    // ----------------------------------------------------
    // Khấu trừ chéo sản lượng đã phân bổ thành công ở Mô hình 1 trước khi đưa vào Mô hình 2
    let shops19TCandidates = allShopsInProv.map(s => {
        let originalWeight = getFloatVal(s.kl_tb_ngay);
        let originalVol = getFloatVal(s.vol_tb_ngay);
        
        // Khối lượng & sản lượng đã gom vào XE KHẢ THI ở Mô hình 1
        let deployedWeight = result8T.deployedWeights[s.ten_kh] || 0;
        let deployedVol = result8T.deployedVols[s.ten_kh] || 0;
        
        let availWeight = Math.max(0, originalWeight - deployedWeight);
        let availVol = Math.max(0, originalVol - deployedVol);
        
        return {
            ...s,
            kl_tb_ngay: availWeight,
            vol_tb_ngay: availVol
        };
    }).filter(s => s.kl_tb_ngay > 0); // Chỉ giữ lại các shop còn khối lượng khả dụng
    
    let getVolModel2 = s => getFloatVal(s.vol_tb_ngay);
    
    // Lập phương án xe tải Mô hình 2 (Xe 1.9T) dựa trên dữ liệu đã khấu trừ
    let result19T = planTrucks(shops19TCandidates, 1900, "kl_tb_ngay", getVolModel2);
    
    // Tiết kiệm Leadtime xe 1.9T: Đi thẳng trung chuyển chặng lt_xuat_bclay_nhap_ktc1
    let ltSaved19T = 0;
    if (ltInfo && ltInfo.lt_xuat_bclay_nhap_ktc1) {
        ltSaved19T = parseFloat(ltInfo.lt_xuat_bclay_nhap_ktc1);
    } else if (currentRouteData && currentRouteData.lt_xuat_bclay_nhap_ktc1) {
        ltSaved19T = parseFloat(currentRouteData.lt_xuat_bclay_nhap_ktc1);
    }
    if (isNaN(ltSaved19T)) ltSaved19T = 0;
    
    // ----------------------------------------------------
    // CẬP NHẬT GIAO DIỆN & VẼ THẺ XE CHO CẢ 2 MÔ HÌNH
    // ----------------------------------------------------
    
    // 1. Cập nhật Mô hình 1 (Xe 8T)
    let totalKl8T = result8T.trucks.reduce((sum, t) => sum + t.totalWeight, 0);
    let totalTrucks8T = result8T.trucks.length;
    let feasibleTrucks8T = result8T.trucks.filter(t => t.isFeasible).length;
    let avgFill8T = totalTrucks8T > 0 ? (result8T.trucks.reduce((sum, t) => sum + (t.totalWeight / t.capacity) * 100, 0) / totalTrucks8T) : 0;
    
    document.getElementById('8t-fleet-total-kl').innerText = Math.round(totalKl8T).toLocaleString('vi-VN') + " Kg";
    document.getElementById('8t-fleet-total-trucks').innerText = totalTrucks8T + " Xe";
    document.getElementById('8t-fleet-feasible-trucks').innerText = feasibleTrucks8T + " Xe";
    document.getElementById('8t-fleet-avg-fill').innerText = avgFill8T.toFixed(1) + "%";
    document.getElementById('8t-fleet-leadtime-saved').innerHTML = ltSaved8T > 0 ? `<i class="fa-solid fa-circle-down"></i> Giảm ${ltSaved8T.toFixed(1)}h` : "--";
    
    let pctFeasible8T = totalTrucks8T > 0 ? (feasibleTrucks8T / totalTrucks8T) * 100 : 0;
    document.getElementById('8t-fleet-progress-text').innerText = `${feasibleTrucks8T} / ${totalTrucks8T} Xe (${pctFeasible8T.toFixed(0)}% khả thi)`;
    document.getElementById('8t-fleet-progress-bar').style.width = pctFeasible8T + "%";
    
    // Vẽ danh sách thẻ xe 8T
    renderFleet('8t-truck-list-container', result8T.trucks, 8000, 1);
    
    // 2. Cập nhật Mô hình 2 (Xe 1.9T)
    let totalKl19T = result19T.trucks.reduce((sum, t) => sum + t.totalWeight, 0);
    let totalTrucks19T = result19T.trucks.length;
    let feasibleTrucks19T = result19T.trucks.filter(t => t.isFeasible).length;
    let avgFill19T = totalTrucks19T > 0 ? (result19T.trucks.reduce((sum, t) => sum + (t.totalWeight / t.capacity) * 100, 0) / totalTrucks19T) : 0;
    
    document.getElementById('19t-fleet-total-kl').innerText = Math.round(totalKl19T).toLocaleString('vi-VN') + " Kg";
    document.getElementById('19t-fleet-total-trucks').innerText = totalTrucks19T + " Xe";
    document.getElementById('19t-fleet-feasible-trucks').innerText = feasibleTrucks19T + " Xe";
    document.getElementById('19t-fleet-avg-fill').innerText = avgFill19T.toFixed(1) + "%";
    document.getElementById('19t-fleet-leadtime-saved').innerHTML = ltSaved19T > 0 ? `<i class="fa-solid fa-circle-down"></i> Giảm ${ltSaved19T.toFixed(1)}h` : "--";
    
    let pctFeasible19T = totalTrucks19T > 0 ? (feasibleTrucks19T / totalTrucks19T) * 100 : 0;
    document.getElementById('19t-fleet-progress-text').innerText = `${feasibleTrucks19T} / ${totalTrucks19T} Xe (${pctFeasible19T.toFixed(0)}% khả thi)`;
    document.getElementById('19t-fleet-progress-bar').style.width = pctFeasible19T + "%";
    
    // Vẽ danh sách thẻ xe 1.9T
    renderFleet('19t-truck-list-container', result19T.trucks, 1900, 2);
}
