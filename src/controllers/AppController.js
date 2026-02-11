/**
 * ═══════════════════════════════════════════════════════════
 * NATURALFOOD - Controller Layer
 * Handles all business logic, routing, and user interactions
 * ═══════════════════════════════════════════════════════════
 */

import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

import {
    UserModel, FincaModel, PredioModel, VariedadModel,
    EmpleadoModel, LaborModel, PresupuestoModel, AplicacionModel,
    NotificationModel
} from '../models/DataModels.js';

import { SofiaImportModel } from '../models/SofiaModel.js';
import { SofiaApiModel } from '../models/SofiaApiModel.js';

import {
    renderLandingPage, renderLoginPage, renderDashboardLayout,
    renderDashboardHome, renderFincasView, renderPrediosView,
    renderVariedadesView, renderEmpleadosView, renderLaboresView,
    renderCargaView, renderInformesView, renderInformePresupuesto,
    renderCosechaDashboard, renderSofiaJornalesStats,
    renderInformeParametros, renderAplicacionesView,
    renderPresupuestoView, renderUsuariosView,
    renderInformeAplicaciones, renderSofiaResumen, renderSofiaFoliares,
    renderSofiaHerbicidas, renderFertilizacionComparativa, formatCurrency
} from '../views/Views.js';

// ── Constants ──
const ROLE_MENUS = {
    'Administrador': [
        {
            id: 'informes', label: 'Informes', icon: '📈', section: 'Principal', submenu: [
                { id: 'jornales', label: 'Jornales', icon: '👷' },
                { id: 'cosecha', label: 'Cosecha', icon: '🍇' },
                { id: 'aplicaciones-sofia', label: 'Aplicaciones', icon: '🧪' },
            ]
        },
    ],
    'Ingeniero': [
        {
            id: 'informes', label: 'Informes', icon: '📈', section: 'Principal', submenu: [
                { id: 'jornales', label: 'Jornales', icon: '👷' },
                { id: 'cosecha', label: 'Cosecha', icon: '🍇' },
                { id: 'aplicaciones-sofia', label: 'Aplicaciones', icon: '🧪' },
            ]
        },
    ],
    'Sub-Admin': [
        {
            id: 'informes', label: 'Informes', icon: '📈', section: 'Consulta', submenu: [
                { id: 'jornales', label: 'Jornales', icon: '👷' },
                { id: 'cosecha', label: 'Cosecha', icon: '🍇' },
                { id: 'aplicaciones-sofia', label: 'Aplicaciones', icon: '🧪' },
            ]
        },
    ],
};

// ── App Controller ──
export class AppController {
    constructor() {
        this.app = document.getElementById('app');
        this.currentSection = null;
        this.currentUser = null;
        this.charts = {};
        this.sofiaFilters = { ciclo: '', finca: '', predio: '', cuartel: '' };
        this.sofiaSubTab = 'resumen';
    }

    init() {
        const user = UserModel.getCurrentUser();
        if (user) {
            this.loadDashboard(user);
        } else {
            this.loadLanding();
        }
    }

    // ── Navigation ──
    loadLanding() {
        this.app.innerHTML = renderLandingPage();
        this.bindLandingEvents();
    }

    loadLogin() {
        this.app.innerHTML = renderLoginPage();
        this.bindLoginEvents();
    }

    async loadDashboard(user, section = null) {
        this.currentUser = user;
        const menuItems = ROLE_MENUS[user.role] || [];

        // Load static Sofia files automatically
        this.loadStaticSofiaData();

        // Default section is always jornales
        if (!section) section = 'jornales';
        this.currentSection = section;

        // Render layout first so overlay exists
        this.app.innerHTML = renderDashboardLayout(user, menuItems, section);
        this.bindDashboardEvents(user);

        // -- PROGRESSIVE LOADING OF HISTORY --
        const overlay = document.getElementById('loading-overlay');
        const progressBar = document.getElementById('loading-progress');
        const progressMessage = document.getElementById('loading-message');
        const progressDetails = document.getElementById('loading-details');

        if (overlay) {
            overlay.classList.remove('hidden');

            const cycles = ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026'];

            try {
                for (let i = 0; i < cycles.length; i++) {
                    const cycle = cycles[i];
                    const percent = Math.round(((i) / cycles.length) * 100);

                    if (progressMessage) progressMessage.textContent = `Descargando ciclo ${cycle}...`;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (progressDetails) progressDetails.textContent = `${i}/${cycles.length} ciclos completados`;

                    // Force UI update
                    await new Promise(r => setTimeout(r, 50));

                    // Fetch Data Sequentially
                    await SofiaApiModel.fetchCycleData(cycle);
                }

                // Complete
                if (progressBar) progressBar.style.width = '100%';
                if (progressMessage) progressMessage.textContent = 'Procesando datos...';
                await new Promise(r => setTimeout(r, 500)); // Short delay for visual completion

            } catch (error) {
                console.error("Error loading historical data:", error);
                if (progressMessage) progressMessage.textContent = 'Error de conexión. Cargando modo offline...';
            } finally {
                overlay.classList.add('hidden');
            }
        }

        this.loadSection(section, user);
    }

    loadSection(section, user) {
        const content = document.getElementById('page-content');
        const title = document.getElementById('page-title');

        // Destroy existing charts
        Object.values(this.charts).forEach(c => { try { c.destroy(); } catch (e) { } });
        this.charts = {};

        switch (section) {
            case 'jornales':
                title.textContent = 'Informe de Jornales';
                this.renderJornalesSection(content);
                break;
            case 'cosecha':
                title.textContent = 'Informe de Cosecha';
                this.renderCosechaSection(content);
                break;
            case 'aplicaciones-sofia':
                title.textContent = 'Informe de Aplicaciones';
                this.renderAplicacionesSofiaModule(content);
                break;
        }

        // Update active sidebar item
        document.querySelectorAll('.sidebar-item[data-section]').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });
    }

    // ── Sección 1: JORNALES ──
    async renderJornalesSection(container) {
        container.innerHTML = `
        <div class="sofia-filters animate-fade-in">
          <div class="filter-group">
            <label class="form-label">Ciclo Producción</label>
            <select class="form-select sofia-filter-select" id="filter-jornales-ciclo">
              <option value="2025-2026">2025-2026</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2023-2024">2023-2024</option>
              <option value="2022-2023">2022-2023</option>
              <option value="2021-2022">2021-2022</option>
              <option value="2020-2021">2020-2021</option>
            </select>
          </div>
          <div class="filter-group" style="min-width: 140px;">
            <label class="form-label">Finca</label>
            <select class="form-select sofia-filter-select" id="filter-jornales-finca">
              <option value="">Todas</option>
              <option value="El Espejo">El Espejo</option>
              <option value="Fincas Viejas">Fincas Viejas</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="form-label">Clasificación</label>
            <select class="form-select sofia-filter-select" id="filter-jornales-predio">
              <option value="">Todos</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="form-label">Variedad</label>
            <select class="form-select sofia-filter-select" id="filter-jornales-variedad">
              <option value="">Todas</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="form-label">Desde</label>
            <input type="date" class="form-input" id="filter-jornales-desde" style="background:var(--bg-tertiary); max-width: 130px;" />
          </div>
          <div class="filter-group">
            <label class="form-label">Hasta</label>
            <input type="date" class="form-input" id="filter-jornales-hasta" style="background:var(--bg-tertiary); max-width: 130px;" />
          </div>
        </div>

        <div id="jornales-content" class="animate-fade-in animate-delay-1">
            <div style="padding: var(--space-20); text-align: center; color: var(--text-tertiary);">
                <div class="spinner" style="margin: 0 auto var(--space-4);"></div>
                <p>Cargando datos de jornales desde Sofía...</p>
                <small>(Este proceso puede tardar mientras se reconstruyen los datos mes a mes)</small>
            </div>
        </div>
        `;

        const filters = {
            ciclo: document.getElementById('filter-jornales-ciclo').value,
            finca: '', predio: '', variedad: '', desde: '', hasta: ''
        };

        const updateView = async () => {
            const content = document.getElementById('jornales-content');
            if (!content) return;

            const data = await SofiaApiModel.fetchJornales(filters);
            const stats = SofiaApiModel.getJornalesStats(data);
            const efficiency = SofiaApiModel.getEfficiencyStats(data);

            content.innerHTML = renderSofiaJornalesStats(stats, efficiency, filters.ciclo);

            // Bind Table Cycle Selector to Sync
            document.getElementById('table-jornales-cycle')?.addEventListener('change', (e) => {
                const newVal = e.target.value;
                const mainFilter = document.getElementById('filter-jornales-ciclo');
                if (mainFilter) {
                    mainFilter.value = newVal;
                    filters.ciclo = newVal;
                    // Reset cache or force update might be needed if not handled by updateView
                    updateView();
                }
            });

            this.renderJornadasChart(stats);

            // Render Historical Comparison
            SofiaApiModel.getHistoricalComparison(filters).then(histData => {
                this.renderHistoricalChart(histData);
            });

            // Populate filter lists dynamically based on active data
            const updateFilterList = (id, key, allData) => {
                const sel = document.getElementById(id);
                if (!sel) return;
                const currentVal = filters[key];

                let subData = allData;
                if (filters.finca) subData = subData.filter(r => r.finca === filters.finca);

                const uniqueVals = [...new Set(subData.map(r => {
                    if (key === 'predio') return r.clasifica || r.clasificacion || r.Clasificacion || r.Clasifica;
                    if (key === 'variedad') return r.variedad || r.variedades || r.Variedad || r.Variedades;
                    return r[key];
                }))].filter(v => v !== null && v !== undefined && v !== '').sort();


                sel.innerHTML = `<option value="">${key === 'predio' ? 'Todos' : 'Todas'}</option>` +
                    uniqueVals.map(v => `<option value="${v}" ${v === currentVal ? 'selected' : ''}>${v}</option>`).join('');
            };

            updateFilterList('filter-jornales-predio', 'predio', SofiaApiModel.DATA_JORNALES);
            updateFilterList('filter-jornales-variedad', 'variedad', SofiaApiModel.DATA_JORNALES);

            document.getElementById('input-budget-csv')?.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) alert(`Archivo ${file.name} seleccionado. Lógica de comparación de presupuesto en desarrollo.`);
            });
        };

        const bind = (id, key) => {
            document.getElementById(id)?.addEventListener('change', (e) => {
                filters[key] = e.target.value;
                if (key === 'finca') { filters.predio = ''; filters.variedad = ''; }
                updateView();
            });
        };

        ['filter-jornales-ciclo', 'filter-jornales-finca', 'filter-jornales-predio',
            'filter-jornales-variedad', 'filter-jornales-desde', 'filter-jornales-hasta'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const key = id.split('-').pop();
                bind(id, key === 'ciclo' ? 'ciclo' : key);
            });

        await updateView();
    }

    renderHistoricalChart(histData) {
        const ctx = document.getElementById('chart-jornales-historico');
        if (!ctx) return;

        if (this.charts.historico) {
            this.charts.historico.destroy();
        }

        // @ts-ignore
        this.charts.historico = new Chart(ctx, {
            type: 'line',
            data: histData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { color: '#f1f5f9' } },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += new Intl.NumberFormat('es-AR').format(context.parsed.y) + ' Jor';
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false } },
                    y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false } }
                }
            }
        });
    }

    // ── Sección 2: COSECHA ──
    // ── Sección 2: COSECHA ──
    async renderCosechaSection(container) {
        container.innerHTML = `
        <div class="sofia-filters animate-fade-in">
          <div class="filter-group">
            <label class="form-label">Ciclo Producción</label>
            <select class="form-select sofia-filter-select" id="filter-cosecha-ciclo" style="padding-left:var(--space-4);">
              <option value="2025-2026">2025-2026</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2023-2024">2023-2024</option>
              <option value="2022-2023">2022-2023</option>
              <option value="2021-2022">2021-2022</option>
              <option value="2020-2021">2020-2021</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="form-label">Finca</label>
            <select class="form-select sofia-filter-select" id="filter-cosecha-finca" style="padding-left:var(--space-4);">
              <option value="">Todas</option>
              <option value="El Espejo">El Espejo</option>
              <option value="Fincas Viejas">Fincas Viejas</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="form-label">Clasificación</label>
            <select class="form-select sofia-filter-select" id="filter-cosecha-predio" style="padding-left:var(--space-4);">
              <option value="">Todos</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="form-label">Variedad</label>
            <select class="form-select sofia-filter-select" id="filter-cosecha-variedad" style="padding-left:var(--space-4);">
              <option value="">Todas</option>
            </select>
          </div>
        </div>

        <div id="cosecha-dashboard-container">
            <div style="padding: var(--space-20); text-align: center; color: var(--text-tertiary);">
                <div class="spinner" style="margin: 0 auto var(--space-4);"></div>
                <p>Cargando datos de cosecha desde Sofía...</p>
                <small>(Reconstruyendo historial de rendimiento...)</small>
            </div>
        </div>
        `;

        const filters = {
            ciclo: document.getElementById('filter-cosecha-ciclo').value,
            finca: '', predio: '', variedad: ''
        };

        const updateDashboard = async () => {
            const dashboard = document.getElementById('cosecha-dashboard-container');
            if (!dashboard) return;

            const data = await SofiaApiModel.fetchCosecha(filters);
            const stats = SofiaApiModel.getCosechaDashboardStats(data);
            dashboard.innerHTML = renderCosechaDashboard(stats);

            // Populate filter lists dynamically based on active data
            const updateFilterList = (id, key, allData) => {
                const sel = document.getElementById(id);
                if (!sel) return;
                const currentVal = filters[key];

                let subData = allData;
                if (filters.finca) subData = subData.filter(r => r.finca === filters.finca);

                const uniqueVals = [...new Set(subData.map(r => {
                    if (key === 'predio') return r.clasifica || r.clasificacion || r.Clasificacion || r.Clasifica;
                    if (key === 'variedad') return r.variedad || r.variedades || r.Variedad || r.Variedades;
                    return r[key];
                }))].filter(v => v !== null && v !== undefined && v !== '').sort();


                sel.innerHTML = `<option value="">${key === 'predio' ? 'Todos' : 'Todas'}</option>` +
                    uniqueVals.map(v => `<option value="${v}" ${v === currentVal ? 'selected' : ''}>${v}</option>`).join('');
            };

            updateFilterList('filter-cosecha-predio', 'predio', SofiaApiModel.DATA_COSECHA);
            updateFilterList('filter-cosecha-variedad', 'variedad', SofiaApiModel.DATA_COSECHA);

            // Historical Chart
            const historyStats = await SofiaApiModel.getHistoricalCosechaStats(filters);
            this.renderCosechaHistoryChart(historyStats);
        };

        const bind = (id, key) => {
            document.getElementById(id)?.addEventListener('change', (e) => {
                filters[key] = e.target.value;
                if (key === 'finca') { filters.predio = ''; filters.variedad = ''; }
                updateDashboard();
            });
        };

        bind('filter-cosecha-ciclo', 'ciclo');
        bind('filter-cosecha-finca', 'finca');
        bind('filter-cosecha-predio', 'predio');
        bind('filter-cosecha-variedad', 'variedad');

        await updateDashboard();
    }

    renderCosechaHistoryChart(stats) {
        const ctx = document.getElementById('chart-cosecha-historico');
        if (!ctx) return;

        if (this.charts.cosechaHistory) {
            this.charts.cosechaHistory.destroy();
        }

        // @ts-ignore
        this.charts.cosechaHistory = new Chart(ctx, {
            type: 'bar',
            data: stats,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += new Intl.NumberFormat('es-AR').format(context.parsed.y) + ' kg';
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#e2e8f0' }, grid: { display: false } },
                    y: {
                        ticks: { color: '#e2e8f0' },
                        grid: { color: 'rgba(255,255,255,0.1)', drawBorder: false },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // ── Dashboard Content ──
    renderDashboardContent(container) {
        const metrics = {
            totalHectares: FincaModel.getTotalHectares(),
            totalFincas: FincaModel.getActive().length,
            totalEmpleados: EmpleadoModel.getActive().length,
            budgetExecution: PresupuestoModel.getExecutionPercentage(),
            recentLabores: LaborModel.getAll().slice(0, 5)
        };

        container.innerHTML = renderDashboardHome(metrics);

        // Animated counters
        this.animateCounters();

        // Render charts after DOM update
        requestAnimationFrame(() => {
            this.renderBudgetChart();
            this.renderLaboresChart();
            this.renderHoursChart();
        });
    }

    // ── Animated Counters ──
    animateCounters() {
        document.querySelectorAll('.metric-value').forEach(el => {
            const text = el.textContent;
            const numericMatch = text.match(/(\d+)/);
            if (!numericMatch) return;

            const target = parseInt(numericMatch[0]);
            const suffix = text.replace(numericMatch[0], '').trim();
            const prefix = text.substring(0, text.indexOf(numericMatch[0]));
            const duration = 1200;
            const start = performance.now();

            const animate = (now) => {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
                const current = Math.round(target * eased);
                el.textContent = `${prefix}${current}${suffix}`;
                if (progress < 1) requestAnimationFrame(animate);
            };
            el.textContent = `${prefix}0${suffix}`;
            requestAnimationFrame(animate);
        });
    }

    // ── Chart Options Helper ──
    getChartOptions(yLabel = '') {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter', size: 12 },
                        padding: 14,
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                    grid: { color: 'rgba(148, 163, 184, 0.06)' }
                },
                y: {
                    beginAtZero: true,
                    title: yLabel ? { display: true, text: yLabel, color: '#64748b', font: { family: 'Inter', size: 12 } } : undefined,
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                    grid: { color: 'rgba(148, 163, 184, 0.06)' }
                }
            }
        };
    }

    // ── Chart Rendering ──
    renderBudgetChart() {
        const ctx = document.getElementById('chart-budget');
        if (!ctx) return;

        const data = PresupuestoModel.getByCategory();
        const categories = Object.keys(data);

        this.charts['budget'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [
                    {
                        label: 'Presupuestado',
                        data: categories.map(c => data[c].planned),
                        backgroundColor: 'rgba(16, 185, 129, 0.6)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        borderRadius: 6,
                    },
                    {
                        label: 'Ejecutado',
                        data: categories.map(c => data[c].executed),
                        backgroundColor: 'rgba(168, 85, 247, 0.6)',
                        borderColor: 'rgba(168, 85, 247, 1)',
                        borderWidth: 1,
                        borderRadius: 6,
                    }
                ]
            },
            options: this.getChartOptions('Monto ($)')
        });
    }

    renderLaboresChart() {
        const ctx = document.getElementById('chart-labores');
        if (!ctx) return;

        const data = LaborModel.getByType();
        const labels = Object.keys(data);
        const values = Object.values(data);

        const colors = [
            'rgba(16, 185, 129, 0.8)',
            'rgba(168, 85, 247, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(59, 130, 246, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(34, 197, 94, 0.8)',
        ];

        this.charts['labores'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 0,
                    hoverOffset: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            padding: 16,
                            font: { family: 'Inter', size: 12 }
                        }
                    }
                }
            }
        });
    }

    renderHoursChart() {
        const ctx = document.getElementById('chart-hours');
        if (!ctx) return;

        const data = LaborModel.getHoursByFinca();
        const labels = Object.keys(data);
        const values = Object.values(data);

        this.charts['hours'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(l => l.replace('Finca ', '')),
                datasets: [{
                    label: 'Horas Totales',
                    data: values,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1,
                    borderRadius: 6,
                }]
            },
            options: {
                ...this.getChartOptions('Horas'),
                indexAxis: 'y',
            }
        });
    }

    renderPresupuestoChart() {
        const ctx = document.getElementById('chart-presupuesto-mgmt');
        if (!ctx) return;

        const data = PresupuestoModel.getByCategory();
        const categories = Object.keys(data);

        this.charts['presupuesto-mgmt'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [
                    {
                        label: 'Presupuestado',
                        data: categories.map(c => data[c].planned),
                        backgroundColor: 'rgba(16, 185, 129, 0.6)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        borderRadius: 6,
                    },
                    {
                        label: 'Ejecutado',
                        data: categories.map(c => data[c].executed),
                        backgroundColor: 'rgba(245, 158, 11, 0.6)',
                        borderColor: 'rgba(245, 158, 11, 1)',
                        borderWidth: 1,
                        borderRadius: 6,
                    }
                ]
            },
            options: this.getChartOptions('Monto ($)')
        });
    }

    getChartOptions(yLabel = '') {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter', size: 12 }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    title: { display: !!yLabel, text: yLabel, color: '#64748b' },
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        };
    }

    // ── Informes Content ──
    renderInformesContent(container) {
        container.innerHTML = renderInformesView();
        this.renderInformeTab('presupuesto');
        this.bindInformeTabEvents();
    }

    renderInformeTab(tab) {
        const content = document.getElementById('informe-content');

        // Destroy existing charts
        Object.keys(this.charts).filter(k => k.includes('report')).forEach(k => {
            this.charts[k].destroy();
            delete this.charts[k];
        });

        switch (tab) {
            case 'presupuesto':
                content.innerHTML = renderInformePresupuesto(PresupuestoModel.getByCategory());
                requestAnimationFrame(() => this.renderBudgetReportChart());
                break;
            case 'labores':
                content.innerHTML = renderInformeLabores(LaborModel.getByType(), LaborModel.getHoursByFinca());
                requestAnimationFrame(() => {
                    this.renderLaboresReportChart();
                    this.renderHoursReportChart();
                });
                break;
            case 'parametros':
                content.innerHTML = renderInformeParametros(
                    FincaModel.getAll(), VariedadModel.getAll(), AplicacionModel.getAll()
                );
                break;
            case 'aplicaciones':
                this.renderAplicacionesSofiaModule(content);
                break;
        }
    }

    renderBudgetReportChart() {
        const ctx = document.getElementById('chart-budget-report');
        if (!ctx) return;

        const data = PresupuestoModel.getByCategory();
        const categories = Object.keys(data);

        this.charts['budget-report'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [
                    {
                        label: 'Presupuestado',
                        data: categories.map(c => data[c].planned),
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        borderRadius: 8,
                    },
                    {
                        label: 'Ejecutado',
                        data: categories.map(c => data[c].executed),
                        backgroundColor: 'rgba(168, 85, 247, 0.7)',
                        borderColor: 'rgba(168, 85, 247, 1)',
                        borderWidth: 1,
                        borderRadius: 8,
                    }
                ]
            },
            options: this.getChartOptions('Monto ($)')
        });
    }

    renderLaboresReportChart() {
        const ctx = document.getElementById('chart-labores-report');
        if (!ctx) return;

        const data = LaborModel.getByType();
        const colors = [
            'rgba(16, 185, 129, 0.8)', 'rgba(168, 85, 247, 0.8)',
            'rgba(245, 158, 11, 0.8)', 'rgba(59, 130, 246, 0.8)',
            'rgba(239, 68, 68, 0.8)', 'rgba(34, 197, 94, 0.8)',
        ];

        this.charts['labores-report'] = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    data: Object.values(data),
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 }, padding: 12 }
                    }
                }
            }
        });
    }

    renderHoursReportChart() {
        const ctx = document.getElementById('chart-hours-report');
        if (!ctx) return;

        const data = LaborModel.getHoursByFinca();

        this.charts['hours-report'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(data).map(l => l.replace('Finca ', '')),
                datasets: [{
                    label: 'Horas',
                    data: Object.values(data),
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.6)',
                        'rgba(168, 85, 247, 0.6)',
                        'rgba(245, 158, 11, 0.6)',
                        'rgba(59, 130, 246, 0.6)',
                    ],
                    borderWidth: 0,
                    borderRadius: 6,
                }]
            },
            options: this.getChartOptions('Horas')
        });
    }

    // ══════════════════════════════════════════════════
    // EVENT BINDING
    // ══════════════════════════════════════════════════

    bindLandingEvents() {
        document.getElementById('btn-login-nav')?.addEventListener('click', () => this.loadLogin());
        document.getElementById('btn-hero-login')?.addEventListener('click', () => this.loadLogin());
        document.getElementById('btn-hero-features')?.addEventListener('click', () => {
            document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
        });

        // Navbar scroll effect
        window.addEventListener('scroll', () => {
            const nav = document.getElementById('landing-nav');
            if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    bindLoginEvents() {
        const form = document.getElementById('login-form');
        const errorDiv = document.getElementById('login-error');

        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            const user = UserModel.authenticate(email, password);
            if (user) {
                this.loadDashboard(user);
            } else {
                errorDiv.classList.add('show');
                setTimeout(() => errorDiv.classList.remove('show'), 3000);
            }
        });

        document.getElementById('btn-back-landing')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadLanding();
        });
    }

    bindDashboardEvents(user) {
        // Sidebar dropdown toggle
        document.querySelectorAll('.sidebar-dropdown-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const menuId = toggle.dataset.toggle;
                const submenu = document.getElementById(`submenu-${menuId}`);
                const isOpen = submenu?.classList.contains('open');
                submenu?.classList.toggle('open', !isOpen);
                toggle.classList.toggle('expanded', !isOpen);
                const chevron = toggle.querySelector('.sidebar-chevron');
                if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
            });
        });

        // Sidebar sub-item navigation
        document.querySelectorAll('.sidebar-item[data-section]').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                this.currentSection = section;
                this.loadSection(section, user);
                // Close mobile sidebar
                document.getElementById('sidebar')?.classList.remove('open');
            });
        });

        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', () => {
            UserModel.logout();
            this.loadLanding();
        });

        // Mobile menu
        document.getElementById('btn-mobile-menu')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.toggle('open');
        });

        // Modal close
        document.getElementById('modal-close')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeModal();
        });

        // Notification bell
        this.bindNotificationBell();
    }

    // ── Notification Bell ──
    bindNotificationBell() {
        const bell = document.querySelector('.notification-bell');
        if (!bell) return;

        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            let dropdown = document.getElementById('notification-dropdown');

            if (dropdown) {
                dropdown.remove();
                return;
            }

            const notifications = NotificationModel.getAll();
            const unreadCount = NotificationModel.getUnread().length;
            const typeIcons = { warning: '⚠️', error: '🔴', success: '✅', info: 'ℹ️' };

            dropdown = document.createElement('div');
            dropdown.id = 'notification-dropdown';
            dropdown.className = 'notification-dropdown animate-fade-in';
            dropdown.innerHTML = `
                <div class="notif-header">
                    <h4>Notificaciones</h4>
                    ${unreadCount > 0 ? `<button class="btn btn-ghost btn-sm" id="btn-mark-all-read">Marcar todas leídas</button>` : ''}
                </div>
                <div class="notif-list">
                    ${notifications.length === 0 ? '<div class="notif-empty">No hay notificaciones</div>' :
                    notifications.map(n => `
                        <div class="notif-item ${n.read ? 'read' : 'unread'}" data-id="${n.id}">
                            <span class="notif-icon">${typeIcons[n.type] || 'ℹ️'}</span>
                            <div class="notif-content">
                                <div class="notif-title">${n.title}</div>
                                <div class="notif-message">${n.message}</div>
                                <div class="notif-time">${n.time}</div>
                            </div>
                            ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
                        </div>
                    `).join('')}
                </div>
            `;

            bell.parentElement.appendChild(dropdown);

            // Mark all as read
            document.getElementById('btn-mark-all-read')?.addEventListener('click', () => {
                NotificationModel.markAllRead();
                this.updateNotifBadge();
                dropdown.remove();
                this.showToast('Todas las notificaciones marcadas como leídas', 'info');
            });

            // Mark single as read
            dropdown.querySelectorAll('.notif-item.unread').forEach(item => {
                item.addEventListener('click', () => {
                    NotificationModel.markAsRead(parseInt(item.dataset.id));
                    item.classList.remove('unread');
                    item.classList.add('read');
                    const dot = item.querySelector('.notif-unread-dot');
                    if (dot) dot.remove();
                    this.updateNotifBadge();
                });
            });

            // Close on outside click
            const closeHandler = (ev) => {
                if (!dropdown.contains(ev.target) && ev.target !== bell) {
                    dropdown.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        });
    }

    updateNotifBadge() {
        const count = NotificationModel.getUnread().length;
        const badge = document.querySelector('.notification-count');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    bindInformeTabEvents() {
        document.querySelectorAll('#informes-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#informes-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderInformeTab(btn.dataset.tab);
            });
        });
    }

    bindLaboresEvents() {
        document.querySelectorAll('#labores-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#labores-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const filter = btn.dataset.tab;
                document.querySelectorAll('#table-labores tbody tr').forEach(row => {
                    if (filter === 'all') {
                        row.style.display = '';
                    } else {
                        row.style.display = row.dataset.status === filter ? '' : 'none';
                    }
                });
            });
        });

        document.getElementById('btn-add-labor')?.addEventListener('click', () => {
            this.showNewLaborModal();
        });
    }

    bindCargaEvents() {
        const fincaSelect = document.getElementById('labor-finca');
        const predioSelect = document.getElementById('labor-predio');

        fincaSelect?.addEventListener('change', () => {
            const fincaName = fincaSelect.value;
            const finca = FincaModel.getAll().find(f => f.name === fincaName);
            const predios = finca ? PredioModel.getByFinca(finca.id) : [];

            predioSelect.innerHTML = predios.length
                ? predios.map(p => `<option value="${p.name}">${p.name}</option>`).join('')
                : '<option value="">Sin predios disponibles</option>';
        });

        document.getElementById('form-nueva-labor')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = this.currentUser;
            const date = document.getElementById('labor-date').value;
            const type = document.getElementById('labor-type').value;
            const finca = document.getElementById('labor-finca').value;
            const predio = document.getElementById('labor-predio').value;
            const hours = parseInt(document.getElementById('labor-hours').value);
            const notes = document.getElementById('labor-notes').value;

            if (!type || !finca || !predio || !hours) {
                this.showToast('Por favor complete todos los campos obligatorios', 'warning');
                return;
            }

            LaborModel.add({
                date,
                type,
                predio,
                finca,
                employee: user?.name || 'Operador',
                hours,
                notes,
                status: 'completed'
            });

            this.showToast('✅ Labor registrada exitosamente', 'success');
            // Refresh the view
            this.loadSection('carga', user);
        });
    }

    bindTableSearch(inputId, tableId) {
        const input = document.getElementById(inputId);
        const table = document.getElementById(tableId);
        if (!input || !table) return;

        input.addEventListener('input', () => {
            const query = input.value.toLowerCase();
            table.querySelectorAll('tbody tr').forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }

    // ══════════════════════════════════════════════════
    // CRUD MODAL BINDINGS
    // ══════════════════════════════════════════════════

    // ── Finca CRUD ──
    bindFincaCRUD(user) {
        document.getElementById('btn-add-finca')?.addEventListener('click', () => {
            const body = `
                <form id="modal-finca-form">
                    <div class="form-group">
                        <label class="form-label">Nombre de la Finca</label>
                        <input type="text" class="form-input" id="finca-name" style="padding-left: var(--space-4);" placeholder="Ej: Finca El Dorado" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Ubicación</label>
                        <input type="text" class="form-input" id="finca-location" style="padding-left: var(--space-4);" placeholder="Ej: San Martín, Mendoza" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Hectáreas</label>
                        <input type="number" class="form-input" id="finca-hectares" style="padding-left: var(--space-4);" min="1" placeholder="100" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Cantidad de Predios</label>
                        <input type="number" class="form-input" id="finca-predios" style="padding-left: var(--space-4);" min="0" placeholder="5" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Encargado</label>
                        <input type="text" class="form-input" id="finca-manager" style="padding-left: var(--space-4);" placeholder="Nombre del encargado" required />
                    </div>
                </form>
            `;
            const footer = `
                <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary" id="modal-save">💾 Guardar Finca</button>
            `;
            this.showModal('🏘️ Nueva Finca', body, footer);
            document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('modal-save')?.addEventListener('click', () => {
                const name = document.getElementById('finca-name').value;
                const location = document.getElementById('finca-location').value;
                const hectares = parseInt(document.getElementById('finca-hectares').value);
                const predios = parseInt(document.getElementById('finca-predios').value);
                const manager = document.getElementById('finca-manager').value;
                if (!name || !location || !hectares || !manager) {
                    this.showToast('Complete todos los campos', 'warning');
                    return;
                }
                FincaModel.add({ name, location, hectares, predios: predios || 0, manager });
                this.showToast(`Finca "${name}" creada exitosamente`, 'success');
                this.closeModal();
                this.loadSection('fincas', user);
            });
        });
    }

    // ── Predio CRUD ──
    bindPredioCRUD(user) {
        document.getElementById('btn-add-predio')?.addEventListener('click', () => {
            const fincas = FincaModel.getActive();
            const body = `
                <form id="modal-predio-form">
                    <div class="form-group">
                        <label class="form-label">Nombre del Predio</label>
                        <input type="text" class="form-input" id="predio-name" style="padding-left: var(--space-4);" placeholder="Ej: Parcela Este B" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Finca</label>
                        <select class="form-select" id="predio-finca" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            ${fincas.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Hectáreas</label>
                        <input type="number" class="form-input" id="predio-hectares" style="padding-left: var(--space-4);" min="1" placeholder="15" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Variedad</label>
                        <select class="form-select" id="predio-variety" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            ${VariedadModel.getActive().map(v => `<option value="${v.name}">${v.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tipo de Riego</label>
                        <select class="form-select" id="predio-riego" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            <option>Goteo</option>
                            <option>Aspersión</option>
                            <option>Surco</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tipo de Suelo</label>
                        <select class="form-select" id="predio-suelo" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            <option>Franco</option>
                            <option>Franco-arenoso</option>
                            <option>Franco-arcilloso</option>
                            <option>Arenoso</option>
                            <option>Arcilloso</option>
                        </select>
                    </div>
                </form>
            `;
            const footer = `
                <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary" id="modal-save">💾 Guardar Predio</button>
            `;
            this.showModal('🌾 Nuevo Predio', body, footer);
            document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('modal-save')?.addEventListener('click', () => {
                const name = document.getElementById('predio-name').value;
                const fincaId = parseInt(document.getElementById('predio-finca').value);
                const hectares = parseInt(document.getElementById('predio-hectares').value);
                const variety = document.getElementById('predio-variety').value;
                const irrigationType = document.getElementById('predio-riego').value;
                const soilType = document.getElementById('predio-suelo').value;
                if (!name || !fincaId || !hectares || !variety || !irrigationType || !soilType) {
                    this.showToast('Complete todos los campos', 'warning');
                    return;
                }
                PredioModel.add({ name, fincaId, hectares, variety, irrigationType, soilType });
                this.showToast(`Predio "${name}" creado exitosamente`, 'success');
                this.closeModal();
                this.loadSection('predios', user);
            });
        });
    }

    // ── Variedad CRUD ──
    bindVariedadCRUD(user) {
        document.getElementById('btn-add-variedad')?.addEventListener('click', () => {
            const body = `
                <form id="modal-variedad-form">
                    <div class="form-group">
                        <label class="form-label">Nombre de la Variedad</label>
                        <input type="text" class="form-input" id="variedad-name" style="padding-left: var(--space-4);" placeholder="Ej: Muscat de Alejandría" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tipo</label>
                        <select class="form-select" id="variedad-type" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            <option>Roja</option>
                            <option>Verde</option>
                            <option>Negra</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Días a Cosecha</label>
                        <input type="number" class="form-input" id="variedad-days" style="padding-left: var(--space-4);" min="60" max="200" placeholder="120" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Contenido de Azúcar</label>
                        <input type="text" class="form-input" id="variedad-sugar" style="padding-left: var(--space-4);" placeholder="Ej: 18-20°Brix" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Uso</label>
                        <select class="form-select" id="variedad-usage" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            <option>Pasa</option>
                            <option>Mesa</option>
                            <option>Pasa / Mesa</option>
                            <option>Mesa / Pasa</option>
                        </select>
                    </div>
                </form>
            `;
            const footer = `
                <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary" id="modal-save">💾 Guardar Variedad</button>
            `;
            this.showModal('🍇 Nueva Variedad', body, footer);
            document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('modal-save')?.addEventListener('click', () => {
                const name = document.getElementById('variedad-name').value;
                const type = document.getElementById('variedad-type').value;
                const daysToHarvest = parseInt(document.getElementById('variedad-days').value);
                const sugarContent = document.getElementById('variedad-sugar').value;
                const usage = document.getElementById('variedad-usage').value;
                if (!name || !type || !daysToHarvest || !sugarContent || !usage) {
                    this.showToast('Complete todos los campos', 'warning');
                    return;
                }
                VariedadModel.add({ name, type, daysToHarvest, sugarContent, usage });
                this.showToast(`Variedad "${name}" agregada exitosamente`, 'success');
                this.closeModal();
                this.loadSection('variedades', user);
            });
        });
    }

    // ── Empleado CRUD ──
    bindEmpleadoCRUD(user) {
        document.getElementById('btn-add-empleado')?.addEventListener('click', () => {
            const fincas = FincaModel.getActive();
            const body = `
                <form id="modal-empleado-form">
                    <div class="form-group">
                        <label class="form-label">Nombre Completo</label>
                        <input type="text" class="form-input" id="empleado-name" style="padding-left: var(--space-4);" placeholder="Nombre y Apellido" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">DNI</label>
                        <input type="text" class="form-input" id="empleado-dni" style="padding-left: var(--space-4);" placeholder="12345678" pattern="[0-9]{7,8}" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Cargo</label>
                        <select class="form-select" id="empleado-position" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            <option>Peón Rural</option>
                            <option>Capataz</option>
                            <option>Encargada de Poda</option>
                            <option>Técnica Agrónoma</option>
                            <option>Operador de Maquinaria</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Finca</label>
                        <select class="form-select" id="empleado-finca" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            ${fincas.map(f => `<option value="${f.name}">${f.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Fecha de Ingreso</label>
                        <input type="date" class="form-input" id="empleado-date" style="padding-left: var(--space-4);" value="${new Date().toISOString().split('T')[0]}" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Salario ($)</label>
                        <input type="number" class="form-input" id="empleado-salary" style="padding-left: var(--space-4);" min="100000" placeholder="250000" required />
                    </div>
                </form>
            `;
            const footer = `
                <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary" id="modal-save">💾 Guardar Empleado</button>
            `;
            this.showModal('👥 Nuevo Empleado', body, footer);
            document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('modal-save')?.addEventListener('click', () => {
                const name = document.getElementById('empleado-name').value;
                const dni = document.getElementById('empleado-dni').value;
                const position = document.getElementById('empleado-position').value;
                const finca = document.getElementById('empleado-finca').value;
                const startDate = document.getElementById('empleado-date').value;
                const salary = parseInt(document.getElementById('empleado-salary').value);
                if (!name || !dni || !position || !finca || !startDate || !salary) {
                    this.showToast('Complete todos los campos', 'warning');
                    return;
                }
                EmpleadoModel.add({ name, dni, position, finca, startDate, salary });
                this.showToast(`Empleado "${name}" registrado exitosamente`, 'success');
                this.closeModal();
                this.loadSection('empleados', user);
            });
        });
    }

    // ── Aplicación CRUD ──
    bindAplicacionCRUD(user) {
        document.getElementById('btn-add-aplicacion')?.addEventListener('click', () => {
            const predios = PredioModel.getAll().filter(p => p.status === 'active');
            const body = `
                <form id="modal-aplicacion-form">
                    <div class="form-group">
                        <label class="form-label">Producto</label>
                        <input type="text" class="form-input" id="app-product" style="padding-left: var(--space-4);" placeholder="Ej: Fungicida Mancozeb" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Dosis</label>
                        <input type="text" class="form-input" id="app-dose" style="padding-left: var(--space-4);" placeholder="Ej: 2.5 kg/ha" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Predio</label>
                        <select class="form-select" id="app-predio" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            ${predios.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Fecha</label>
                        <input type="date" class="form-input" id="app-date" style="padding-left: var(--space-4);" value="${new Date().toISOString().split('T')[0]}" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Estado</label>
                        <select class="form-select" id="app-status" style="padding-left: var(--space-4);" required>
                            <option value="scheduled">Programado</option>
                            <option value="pending">Pendiente</option>
                            <option value="applied">Aplicado</option>
                        </select>
                    </div>
                </form>
            `;
            const footer = `
                <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary" id="modal-save">💾 Guardar Aplicación</button>
            `;
            this.showModal('🧪 Nueva Aplicación', body, footer);
            document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('modal-save')?.addEventListener('click', () => {
                const product = document.getElementById('app-product').value;
                const dose = document.getElementById('app-dose').value;
                const predio = document.getElementById('app-predio').value;
                const date = document.getElementById('app-date').value;
                const status = document.getElementById('app-status').value;
                if (!product || !dose || !predio || !date) {
                    this.showToast('Complete todos los campos', 'warning');
                    return;
                }
                AplicacionModel.add({ product, dose, predio, date, status, engineer: this.currentUser?.name || 'Ingeniero' });
                this.showToast(`Aplicación de "${product}" registrada`, 'success');
                this.closeModal();
                this.loadSection('aplicaciones', user);
            });
        });
    }

    // ── Usuario CRUD ──
    bindUsuarioCRUD(user) {
        document.getElementById('btn-add-usuario')?.addEventListener('click', () => {
            const body = `
                <form id="modal-usuario-form">
                    <div class="form-group">
                        <label class="form-label">Nombre Completo</label>
                        <input type="text" class="form-input" id="user-name" style="padding-left: var(--space-4);" placeholder="Nombre y Apellido" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="email" class="form-input" id="user-email" style="padding-left: var(--space-4);" placeholder="usuario@naturalfood.com" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Contraseña</label>
                        <input type="password" class="form-input" id="user-password" style="padding-left: var(--space-4);" placeholder="Mínimo 6 caracteres" minlength="6" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Rol</label>
                        <select class="form-select" id="user-role" style="padding-left: var(--space-4);" required>
                            <option value="">Seleccionar...</option>
                            <option value="Administrador">Administrador</option>
                            <option value="Ingeniero">Ingeniero</option>
                            <option value="RRHH">RRHH</option>
                            <option value="Carga">Carga</option>
                            <option value="Sub-Admin">Sub-Admin</option>
                        </select>
                    </div>
                </form>
            `;
            const footer = `
                <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
                <button class="btn btn-primary" id="modal-save">💾 Crear Usuario</button>
            `;
            this.showModal('⚙️ Nuevo Usuario', body, footer);
            document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
            document.getElementById('modal-save')?.addEventListener('click', () => {
                const name = document.getElementById('user-name').value;
                const email = document.getElementById('user-email').value;
                const password = document.getElementById('user-password').value;
                const role = document.getElementById('user-role').value;
                if (!name || !email || !password || !role) {
                    this.showToast('Complete todos los campos', 'warning');
                    return;
                }
                if (password.length < 6) {
                    this.showToast('La contraseña debe tener al menos 6 caracteres', 'warning');
                    return;
                }
                UserModel.add({ name, email, password, role });
                this.showToast(`Usuario "${name}" creado exitosamente`, 'success');
                this.closeModal();
                this.loadSection('usuarios', user);
            });
        });
    }

    // ── Modal ──
    showModal(title, bodyHtml, footerHtml = '') {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        document.getElementById('modal-footer').innerHTML = footerHtml;
        document.getElementById('modal-overlay').classList.add('show');
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('show');
    }

    showNewLaborModal() {
        const fincas = FincaModel.getActive();
        const empleados = EmpleadoModel.getActive();
        const body = `
      <form id="modal-labor-form">
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input type="date" class="form-input" id="modal-labor-date" style="padding-left: var(--space-4);" value="${new Date().toISOString().split('T')[0]}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Labor</label>
          <select class="form-select" id="modal-labor-type" style="padding-left: var(--space-4);" required>
            <option value="">Seleccionar...</option>
            <option>Poda</option><option>Riego</option>
            <option>Fumigación</option><option>Cosecha</option>
            <option>Desmalezado</option><option>Fertilización</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Finca</label>
          <select class="form-select" id="modal-labor-finca" style="padding-left: var(--space-4);" required>
            <option value="">Seleccionar...</option>
            ${fincas.map(f => `<option value="${f.name}">${f.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Predio</label>
          <select class="form-select" id="modal-labor-predio" style="padding-left: var(--space-4);" required>
            <option value="">Seleccionar finca primero...</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Empleado</label>
          <select class="form-select" id="modal-labor-employee" style="padding-left: var(--space-4);" required>
            <option value="">Seleccionar...</option>
            ${empleados.map(e => `<option value="${e.name}">${e.name} - ${e.position}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Horas</label>
          <input type="number" class="form-input" id="modal-labor-hours" style="padding-left: var(--space-4);" min="1" max="24" placeholder="8" required />
        </div>
        <div class="form-group">
          <label class="form-label">Observaciones</label>
          <textarea class="form-input" id="modal-labor-notes" style="padding-left: var(--space-4); min-height: 60px;"></textarea>
        </div>
      </form>
    `;
        const footer = `
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save-labor">💾 Guardar Labor</button>
    `;
        this.showModal('🔧 Nueva Labor de Campo', body, footer);

        // Dynamic predio loading
        const fincaSelect = document.getElementById('modal-labor-finca');
        const predioSelect = document.getElementById('modal-labor-predio');
        fincaSelect?.addEventListener('change', () => {
            const finca = FincaModel.getAll().find(f => f.name === fincaSelect.value);
            const predios = finca ? PredioModel.getByFinca(finca.id) : [];
            predioSelect.innerHTML = predios.length
                ? predios.map(p => `<option value="${p.name}">${p.name}</option>`).join('')
                : '<option value="">Sin predios</option>';
        });

        document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modal-save-labor')?.addEventListener('click', () => {
            const date = document.getElementById('modal-labor-date').value;
            const type = document.getElementById('modal-labor-type').value;
            const finca = document.getElementById('modal-labor-finca').value;
            const predio = document.getElementById('modal-labor-predio').value;
            const employee = document.getElementById('modal-labor-employee').value;
            const hours = parseInt(document.getElementById('modal-labor-hours').value);
            const notes = document.getElementById('modal-labor-notes').value;

            if (!type || !finca || !predio || !employee || !hours) {
                this.showToast('Complete todos los campos obligatorios', 'warning');
                return;
            }

            LaborModel.add({ date, type, predio, finca, employee, hours, notes, status: 'completed' });
            this.showToast('Labor registrada correctamente', 'success');
            this.closeModal();
            this.loadSection('labores', this.currentUser);
        });
    }

    // ══════════════════════════════════════════════════
    // MÓDULO APLICACIONES SOFÍA
    // ══════════════════════════════════════════════════

    renderAplicacionesSofiaModule(container) {
        // Destroy sofia charts
        Object.keys(this.charts).filter(k => k.startsWith('sofia')).forEach(k => {
            this.charts[k].destroy();
            delete this.charts[k];
        });

        const cycles = SofiaImportModel.getAvailableCycles();
        const fincas = SofiaImportModel.getFincas();

        // Dynamic lists based on current selected finca
        const predios = SofiaImportModel.getPredios(this.sofiaFilters.finca);
        const variedades = SofiaImportModel.getVariedades(this.sofiaFilters.finca, this.sofiaFilters.predio);
        const userRole = this.currentUser?.role || '';

        // Default to latest cycle if current filter is invalid
        if (cycles.length > 0 && (!this.sofiaFilters.ciclo || !cycles.includes(this.sofiaFilters.ciclo))) {
            this.sofiaFilters.ciclo = cycles[0];
        }

        // Pass available varieties to the view
        const viewFilters = { ...this.sofiaFilters, variedades };

        container.innerHTML = renderInformeAplicaciones(cycles, fincas, predios, [], userRole, viewFilters);
        this.bindSofiaEvents();
        this.renderSofiaSubTab(this.sofiaSubTab);
    }

    async loadStaticSofiaData() {
        if (SofiaImportModel.REGISTROS.length > 0) return; // Already loaded

        const files = [
            { name: 'EE_aplicaciones.csv', finca: 'El Espejo' },
            { name: 'FV_aplicaciones.csv', finca: 'Fincas Viejas' }
        ];

        for (const file of files) {
            try {
                const response = await fetch(`/Fuentes/${file.name}`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const csvText = await response.text();
                const result = SofiaImportModel.parseCSV(csvText, file.finca);
                if (!result.error) {
                    SofiaImportModel.importRows(result.rows);
                    console.log(`Auto-loaded ${file.name} (${file.finca})`);
                }
            } catch (e) {
                console.error(`Error auto-loading ${file.name}:`, e);
            }
        }

        // If we are already in the aplicaciones section, refresh it
        if (this.currentSection === 'aplicaciones-sofia') {
            const container = document.getElementById('page-content');
            if (container) this.renderAplicacionesSofiaModule(container);
        }
    }

    bindSofiaEvents() {
        // Standardized Filters Logic
        const filterIds = ['filter-ciclo', 'filter-finca', 'filter-predio', 'filter-variedad'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            el.addEventListener('change', () => {
                const val = el.value;
                if (id === 'filter-ciclo') this.sofiaFilters.ciclo = val;
                if (id === 'filter-finca') {
                    this.sofiaFilters.finca = val;
                    this.sofiaFilters.predio = '';
                    this.sofiaFilters.variedad = '';
                    this.renderAplicacionesSofiaModule(document.getElementById('sofia-module-container') || this.app.querySelector('.dashboard-content'));
                    return;
                }
                if (id === 'filter-predio') {
                    this.sofiaFilters.predio = val;
                    this.sofiaFilters.variedad = '';
                    this.renderAplicacionesSofiaModule(document.getElementById('sofia-module-container') || this.app.querySelector('.dashboard-content'));
                    return;
                }
                if (id === 'filter-variedad') this.sofiaFilters.variedad = val;

                this.renderSofiaSubTab(this.sofiaSubTab);
            });
        });

        // Sub-tabs
        document.querySelectorAll('#sofia-subtabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#sofia-subtabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.sofiaSubTab = btn.dataset.subtab;
                this.renderSofiaSubTab(this.sofiaSubTab);
            });
        });
    }

    renderSofiaSubTab(tab) {
        const content = document.getElementById('sofia-subtab-content');
        if (!content) return;

        // Destroy existing sofia charts
        Object.keys(this.charts).filter(k => k.startsWith('sofia')).forEach(k => {
            this.charts[k].destroy();
            delete this.charts[k];
        });

        const filters = this.sofiaFilters;

        switch (tab) {
            case 'resumen': {
                const resumen = SofiaImportModel.getResumen(filters);
                content.innerHTML = renderSofiaResumen(resumen);
                requestAnimationFrame(() => {
                    this.renderSofiaDistChart(resumen.distribution);
                    this.renderSofiaCostChart(resumen.topProducts);
                });
                break;
            }
            case 'foliares':
                content.innerHTML = renderSofiaFoliares(SofiaImportModel.getFoliares(filters));
                break;
            case 'herbicidas':
                content.innerHTML = renderSofiaHerbicidas(SofiaImportModel.getHerbicidas(filters));
                break;
            case 'fertilizacion': {
                const comparativa = SofiaImportModel.getFertilizacionComparativa(filters);
                content.innerHTML = renderFertilizacionComparativa(comparativa);
                requestAnimationFrame(() => this.renderFertComparativaChart(comparativa));
                break;
            }
        }
    }

    renderSofiaDistChart(distribution) {
        const ctx = document.getElementById('chart-sofia-dist');
        if (!ctx) return;
        const colors = [
            'rgba(59, 130, 246, 0.8)', // Foliares (Blue)
            'rgba(245, 158, 11, 0.8)', // Herbicidas (Amber)
            'rgba(168, 85, 247, 0.8)', // Fertilizacion (Purple)
            'rgba(148, 163, 184, 0.8)' // Otros (Gray)
        ];
        this.charts['sofia-dist'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(distribution),
                datasets: [{ data: Object.values(distribution), backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 }, padding: 14 } } }
            }
        });
    }

    renderSofiaCostChart(topProducts) {
        const ctx = document.getElementById('chart-sofia-cost');
        if (!ctx) return;
        const colors = ['rgba(16,185,129,0.7)', 'rgba(168,85,247,0.7)', 'rgba(245,158,11,0.7)',
            'rgba(59,130,246,0.7)', 'rgba(239,68,68,0.7)', 'rgba(34,197,94,0.7)',
            'rgba(192,132,252,0.7)', 'rgba(251,191,36,0.7)'];
        this.charts['sofia-cost'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topProducts.map(p => p.producto),
                datasets: [{
                    label: 'Costo Total ($)', data: topProducts.map(p => p.costo),
                    backgroundColor: colors.slice(0, topProducts.length), borderWidth: 0, borderRadius: 6
                }]
            },
            options: { ...this.getChartOptions('Costo ($)'), indexAxis: 'y' }
        });
    }

    renderFertComparativaChart(data) {
        // 0. Gráficos Comparativos por Finca (Espejo y Fincas Viejas)
        const renderSplitChart = (canvasId, fincaName, chartKey, colorPre, colorReal) => {
            const ctx = document.getElementById(canvasId);
            if (!ctx) return;

            // Get data filtering by CURRENT filters + specifically this Finca
            const specificFilters = { ...this.sofiaFilters, finca: fincaName };

            // If the currently selected predio doesn't belong to this fincaName, 
            // ignore it for this specific chart to avoid showing an empty graph
            if (specificFilters.predio) {
                const subPredios = SofiaImportModel.getPredios(fincaName);
                if (!subPredios.includes(specificFilters.predio)) {
                    specificFilters.predio = '';
                    specificFilters.variedad = '';
                }
            }

            const prodData = SofiaImportModel.getProductComparison(specificFilters);
            console.log(`[Chart Sort] ${fincaName}:`, prodData.map(d => `${d.clasifica}-${d.producto}`).slice(0, 3));

            this.charts[chartKey] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: prodData.map(d => `${d.clasifica} - ${d.producto}`),
                    datasets: [
                        {
                            label: 'Comprado (Pre)', data: prodData.map(d => d.pre),
                            backgroundColor: colorPre, borderColor: colorPre.replace('0.7', '1'),
                            borderWidth: 1, borderRadius: 4
                        },
                        {
                            label: 'Real Aplicado', data: prodData.map(d => d.real),
                            backgroundColor: colorReal, borderColor: colorReal.replace('0.7', '1'),
                            borderWidth: 1, borderRadius: 4
                        }
                    ]
                },
                options: {
                    ...this.getChartOptions('Litros (L)'),
                    indexAxis: 'y',
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.x)} L` } }
                    }
                }
            });
        };

        renderSplitChart('chart-fert-prod-espejo', 'El Espejo', 'sofia-fert-espejo', 'rgba(59, 130, 246, 0.7)', 'rgba(236, 72, 153, 0.7)');
        renderSplitChart('chart-fert-prod-fincasviejas', 'Fincas Viejas', 'sofia-fert-fincasviejas', 'rgba(245, 158, 11, 0.7)', 'rgba(16, 185, 129, 0.7)');

        // 1. Bar Chart (Product/Cuartel Detail)
        const ctx = document.getElementById('chart-fert-comparativa');
        if (ctx) {
            const labels = data.map(d => {
                const prod = d.producto.split(' ')[0];
                const cuartel = d.cuartel.replace('Cuartel ', '').replace('Sector ', '').replace('Parcela ', '');
                const finca = d.finca.split(' ').pop(); // Shorten Finca name
                return `${finca} - ${prod} (${cuartel})`;
            });
            this.charts['sofia-fert'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Comprado (Total)', data: data.map(d => d.metaAnual),
                            backgroundColor: 'rgba(52, 211, 153, 0.7)', borderColor: 'rgba(52, 211, 153, 1)',
                            borderWidth: 1, borderRadius: 4, categoryPercentage: 0.6, barPercentage: 0.8
                        },
                        {
                            label: 'Real Aplicado', data: data.map(d => d.real),
                            backgroundColor: 'rgba(167, 139, 250, 0.7)', borderColor: 'rgba(124, 58, 237, 1)',
                            borderWidth: 1, borderRadius: 4, categoryPercentage: 0.6, barPercentage: 0.8
                        }
                    ]
                },
                options: {
                    ...this.getChartOptions('Litros (L)'),
                    interaction: { mode: 'index', intersect: false },
                    scales: { x: { ticks: { maxRotation: 45, minRotation: 45, font: { size: 10 } } } }
                }
            });
        }

        // 2. Timeline Chart (Weekly Evolution)
        const ctxWeekly = document.getElementById('chart-fert-weekly');
        if (ctxWeekly) {
            const weeklyData = SofiaImportModel.getWeeklyEvolution(this.sofiaFilters);
            this.charts['sofia-fert-weekly'] = new Chart(ctxWeekly, {
                type: 'line',
                data: {
                    labels: weeklyData.labels,
                    datasets: [
                        {
                            label: 'Presupuestado (Semanal)',
                            data: weeklyData.pptado,
                            borderColor: 'rgba(52, 211, 153, 1)',
                            backgroundColor: 'rgba(52, 211, 153, 0.2)',
                            tension: 0.3, fill: true
                        },
                        {
                            label: 'Real Aplicado (Semanal)',
                            data: weeklyData.real,
                            borderColor: 'rgba(167, 139, 250, 1)',
                            backgroundColor: 'rgba(167, 139, 250, 0.2)',
                            tension: 0.3, fill: true
                        }
                    ]
                },
                options: {
                    ...this.getChartOptions('Litros (L)'),
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y)} L` } }
                    }
                }
            });
        }
    }

    // ── Toast Notifications ──
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close">✕</button>
    `;

        container.appendChild(toast);

        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            toast.style.transition = '0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // -- Jornadas Chart --
    renderJornadasChart(stats) {
        const ctx = document.getElementById('chart-jornadas-consumidas');
        if (!ctx) return;

        // Take top 6 labors for clarity
        const topStats = stats.slice(0, 6);

        if (this.charts['jornadas']) {
            this.charts['jornadas'].destroy();
        }

        this.charts['jornadas'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topStats.map(s => s.labor),
                datasets: [{
                    label: 'Jornadas Consumidas',
                    data: topStats.map(s => s.totalJornadas),
                    backgroundColor: [
                        'rgba(167, 139, 250, 0.8)',
                        'rgba(52, 211, 153, 0.8)',
                        'rgba(251, 191, 36, 0.8)',
                        'rgba(96, 165, 250, 0.8)',
                        'rgba(248, 113, 113, 0.8)',
                        'rgba(168, 162, 158, 0.8)'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: { size: 10 },
                            callback: function (val) {
                                const label = this.getLabelForValue(val);
                                return label.length > 10 ? label.substr(0, 10) + '...' : label;
                            }
                        }
                    }
                }
            }
        });
    }
}
