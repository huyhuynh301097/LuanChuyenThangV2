// Mock Data (giả lập dữ liệu từ Google Sheets)
const mockData = {
    overview: {
        totalVolume: 45200,
        successRate: 98.5,
        avgLeadtime: 14.2
    },
    provinces: [
        { name: 'Hà Nội', volume: 15000, perf: 99.1 },
        { name: 'TP Hồ Chí Minh', volume: 18000, perf: 98.8 },
        { name: 'Đà Nẵng', volume: 4500, perf: 97.5 },
        { name: 'Hải Phòng', volume: 3200, perf: 98.2 },
        { name: 'Cần Thơ', volume: 2500, perf: 96.9 },
    ],
    routes: [
        { route: 'Hà Nội - TP Hồ Chí Minh', volume: 5500, leadtime: 36.5, status: 'Ổn định' },
        { route: 'TP Hồ Chí Minh - Đà Nẵng', volume: 3200, leadtime: 24.0, status: 'Nhanh' },
        { route: 'Hà Nội - Hải Phòng', volume: 4100, leadtime: 8.5, status: 'Nhanh' },
        { route: 'Đà Nẵng - Cần Thơ', volume: 800, leadtime: 48.0, status: 'Chậm' }
    ],
    shops: [
        { id: 'S001', province: 'Hà Nội', volume: 1200, route: 'HN-HCM', type: 'Direct' },
        { id: 'S002', province: 'Hà Nội', volume: 300, route: 'Multiple', type: 'Standard' },
        { id: 'S003', province: 'TP Hồ Chí Minh', volume: 1500, route: 'HCM-HN', type: 'Direct' },
        { id: 'S004', province: 'Đà Nẵng', volume: 150, route: 'Multiple', type: 'Standard' },
        { id: 'S005', province: 'TP Hồ Chí Minh', volume: 800, route: 'HCM-DN', type: 'Direct' },
    ]
};

// UI Interactions
document.addEventListener('DOMContentLoaded', () => {
    // Menu switching
    const menuItems = document.querySelectorAll('.menu-item');
    const tabContents = document.querySelectorAll('.tab-content');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active classes
            menuItems.forEach(i => i.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked item and corresponding tab
            item.classList.add('active');
            const tabId = item.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Load Data
    loadOverviewData();
    loadRoutesData();
    loadShopsData();
    populateFilters();
});

function loadOverviewData() {
    document.getElementById('kpi-total-volume').innerText = mockData.overview.totalVolume.toLocaleString();
    document.getElementById('kpi-success-rate').innerText = mockData.overview.successRate + '%';
    document.getElementById('kpi-avg-leadtime').innerText = mockData.overview.avgLeadtime + 'h';

    // Simulate Chart with HTML bars
    const chartContainer = document.getElementById('chart-province');
    chartContainer.innerHTML = '';
    chartContainer.style.display = 'flex';
    chartContainer.style.flexDirection = 'column';
    chartContainer.style.gap = '12px';

    const maxVol = Math.max(...mockData.provinces.map(p => p.volume));

    mockData.provinces.forEach(p => {
        const percentage = (p.volume / maxVol) * 100;
        const barHtml = `
            <div style="display: flex; align-items: center; gap: 16px;">
                <div style="width: 120px; font-size: 0.9rem; color: #94a3b8;">${p.name}</div>
                <div style="flex: 1; height: 16px; background: rgba(59,130,246,0.2); border-radius: 8px; overflow: hidden;">
                    <div style="width: ${percentage}%; height: 100%; background: #3b82f6; border-radius: 8px;"></div>
                </div>
                <div style="width: 80px; text-align: right; font-weight: 600;">${p.volume.toLocaleString()}</div>
            </div>
        `;
        chartContainer.innerHTML += barHtml;
    });
}

function loadRoutesData() {
    const tbody = document.getElementById('routes-tbody');
    tbody.innerHTML = '';
    mockData.routes.forEach(r => {
        let statusColor = r.status === 'Nhanh' ? '#10b981' : (r.status === 'Ổn định' ? '#3b82f6' : '#ef4444');
        tbody.innerHTML += `
            <tr>
                <td>${r.route}</td>
                <td>${r.volume.toLocaleString()}</td>
                <td>${r.leadtime}h</td>
                <td style="color: ${statusColor}; font-weight: 600;">${r.status}</td>
            </tr>
        `;
    });
}

function loadShopsData() {
    const tbody = document.getElementById('shops-tbody');
    tbody.innerHTML = '';
    mockData.shops.forEach(s => {
        let typeHtml = s.type === 'Direct' ? 
            `<span style="background: rgba(16,185,129,0.2); color: #10b981; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Luân Chuyển Thẳng</span>` : 
            `<span style="background: rgba(245,158,11,0.2); color: #f59e0b; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Về KTC Lấy</span>`;

        tbody.innerHTML += `
            <tr>
                <td style="font-weight: 600;">${s.id}</td>
                <td>${s.province}</td>
                <td>${s.volume.toLocaleString()}</td>
                <td>${typeHtml}</td>
            </tr>
        `;
    });
}

function populateFilters() {
    const select = document.getElementById('filter-province');
    const provinces = [...new Set(mockData.shops.map(s => s.province))];
    provinces.forEach(p => {
        select.innerHTML += `<option value="${p}">${p}</option>`;
    });
}

function generateRouting() {
    const province = document.getElementById('filter-province').value;
    const directList = document.getElementById('direct-shops-list');
    const standardList = document.getElementById('standard-shops-list');
    
    directList.innerHTML = '';
    standardList.innerHTML = '';

    let filteredShops = mockData.shops;
    if (province) {
        filteredShops = filteredShops.filter(s => s.province === province);
    }

    const directShops = filteredShops.filter(s => s.type === 'Direct');
    const standardShops = filteredShops.filter(s => s.type === 'Standard');

    if (directShops.length === 0) {
        directList.innerHTML = '<li>Không có shop nào phù hợp.</li>';
    } else {
        directShops.forEach(s => {
            directList.innerHTML += `
                <li>
                    <strong>${s.id}</strong> - Sản lượng: ${s.volume} <br>
                    <span style="font-size: 0.85rem; color: #94a3b8;">Tuyến chính: ${s.route}</span>
                </li>
            `;
        });
    }

    if (standardShops.length === 0) {
        standardList.innerHTML = '<li>Không có shop nào phù hợp.</li>';
    } else {
        standardShops.forEach(s => {
            standardList.innerHTML += `
                <li>
                    <strong>${s.id}</strong> - Sản lượng: ${s.volume} <br>
                    <span style="font-size: 0.85rem; color: #94a3b8;">Phân tán, nhiều tuyến nhỏ</span>
                </li>
            `;
        });
    }
}
