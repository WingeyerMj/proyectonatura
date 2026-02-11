/**
 * SofiaModel.js
 * Manages import and processing of Sofia CSV data.
 */

const COLUMNS_MAP = {
    'Fecha': ['Fecha', 'Fecha Inicio Aplica', 'Fecha de Aplicación', 'Date'],
    'Labor': ['Labor', 'Labor Code', 'Faena', 'Tarea'],
    'Producto': ['Nombre Producto', 'Producto', 'Insumo', 'Product'],
    'Cantidad': ['Cantidad', 'Real Aplicado', 'Cantidad Periodo', 'Monto'],
    'Tipo': ['tipo', 'Tipo Registro', 'Tipo'],
    'Cuartel': ['Cuartel / Potrero', 'Cuartel', 'Cod Cuartel', 'Sector'],
    'Finca': ['Predio', 'Finca', 'Farm'],
    'Clasifica': ['Clasifica', 'Claseifica', 'Clasificacion', 'Sub-Predio'],
    'Dosis': ['Dosis', 'dosis', 'Dose'],
    'Variedad': ['Variedad', 'variedad', 'Variety'],
    'Costo': ['Total Producto', 'Costo', 'Cost', 'Importe']
};

const REQUIRED_KEYS = ['Fecha', 'Labor', 'Producto', 'Cantidad'];

const HERBICIDE_KEYWORDS = ['glifosato', 'gramoxone', 'roundup', 'panzer', 'herbicida', 'tordon', 'afalon', 'atrazina'];

export class SofiaImportModel {
    static REGISTROS = [];

    static importRows(rows) {
        this.REGISTROS.push(...rows);
    }

    static parseCSV(csvText, defaultFinca) {
        if (!csvText) return { error: "Archivo vacío" };
        const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) return { error: "Archivo sin datos" };

        const header = lines[0].split(';');
        const colMap = {};
        Object.keys(COLUMNS_MAP).forEach(key => {
            const possibleNames = COLUMNS_MAP[key];
            let idx = -1;

            // 1. Priority-based Exact Match
            for (const name of possibleNames) {
                idx = header.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
                if (idx !== -1) break;
            }

            // 2. Priority-based Partial Match (if exact not found)
            if (idx === -1) {
                for (const name of possibleNames) {
                    idx = header.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
                    if (idx !== -1) break;
                }
            }

            if (idx !== -1) colMap[key] = idx;
        });

        const missing = REQUIRED_KEYS.filter(k => colMap[k] === undefined);
        if (missing.length > 0) return { error: `Faltan columnas esenciales: ${missing.join(', ')}` };

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(';');
            if (cols.length < header.length) continue;

            const fecha = colMap['Fecha'] !== undefined ? cols[colMap['Fecha']] : '';
            const labor = colMap['Labor'] !== undefined ? cols[colMap['Labor']] : 'Desconocido';
            let producto = colMap['Producto'] !== undefined ? cols[colMap['Producto']] : '';

            // Product name normalization: remove extra spaces and unify common variants (e.g. 1075M -> 1075 M)
            if (producto) {
                producto = producto.trim().toUpperCase()
                    .replace(/\s+/g, ' ')
                    .replace(/(\d+)\s*([MV])\b/g, '$1 $2') // Standardize space before M/V suffixes
                    .trim();
            }
            // Clean numeric quantity (Strict Spanish: . = thousands, , = decimal)
            let rawCant = colMap['Cantidad'] !== undefined ? cols[colMap['Cantidad']] : '0';
            rawCant = rawCant.replace(/\./g, '').replace(',', '.');
            const cantidad = parseFloat(rawCant) || 0;

            // Clean Cost
            let rawCosto = colMap['Costo'] !== undefined ? cols[colMap['Costo']] : '0';
            // Remove '$' and spaces, handle Spanish format
            rawCosto = rawCosto.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
            const costo = parseFloat(rawCosto) || 0;

            const cuartel = colMap['Cuartel'] !== undefined ? cols[colMap['Cuartel']] : 'Sin Asignar';
            const dosis = colMap['Dosis'] !== undefined ? cols[colMap['Dosis']] : '';

            // Finca logic
            let finca = colMap['Finca'] !== undefined ? cols[colMap['Finca']] : '';
            const fLower = (finca || '').toLowerCase();
            if (fLower.includes('espejo')) {
                finca = 'El Espejo';
            } else if (fLower.includes('viejas') || fLower.includes('camino truncado') || fLower.includes('chimbera') || fLower.includes('puente alto')) {
                finca = 'Fincas Viejas';
            }

            if ((!finca || finca === 'Finca Desconocida') && defaultFinca) {
                finca = defaultFinca;
            } else if (!finca) {
                finca = 'Finca Desconocida';
            }

            if (finca.toLowerCase() === 'el espejo') finca = 'El Espejo';
            if (finca.toLowerCase() === 'fincas viejas') finca = 'Fincas Viejas';

            // Clasifica (Sub-Predio) logic
            let clasifica = colMap['Clasifica'] !== undefined ? cols[colMap['Clasifica']] : '';
            if (!clasifica || clasifica.trim() === '') clasifica = 'General';

            let predioFull = finca;
            if (clasifica && clasifica !== finca && clasifica !== 'General') {
                predioFull = `${finca} - ${clasifica}`;
            }

            // Tipo cleaning
            let tipo = colMap['Tipo'] !== undefined ? cols[colMap['Tipo']] : 'Real';
            tipo = tipo.toLowerCase();
            if (tipo.includes('presupuestado')) {
                if (tipo.includes('pos')) tipo = 'Presupuestado-Pos';
                else tipo = 'Presupuestado-Pre';
            } else {
                tipo = 'Real';
            }

            rows.push({
                fecha_aplicacion: fecha,
                labor_codigo: labor,
                tipo_registro: tipo,
                producto,
                cantidad,
                cuartel,
                dosis,
                costo_total: costo,
                finca: predioFull,
                finca_original: finca,
                clasifica: clasifica,
                variedad: (colMap['Variedad'] !== undefined && cols[colMap['Variedad']]) ? cols[colMap['Variedad']] : ((cuartel.split('-')[2] || '').trim() || 'Sin Variedad'),
                categoria: this.classify(labor, producto),
                ciclo: this.getCycle(fecha)
            });
        }
        return { rows };
    }

    static classify(laborCode, producto) {
        const lab = (laborCode || '').toUpperCase().trim();
        const prod = (producto || '').toLowerCase();

        // 1. Foliares: Starts with "AF -" or is "FITOSANITARIO"
        if (lab.startsWith('AF -') || lab === 'AF' || lab.includes('FOLIAR') || lab === 'FITOSANITARIO') return 'Foliares';

        // 2. Herbicidas: Labour matches HERBICIDA or HERB, or product keywords
        if (lab.includes('HERBICIDA') || lab === 'HERB' || HERBICIDE_KEYWORDS.some(k => prod.includes(k))) return 'Herbicidas';

        // 3. Fertilización: Strictly "FERTILIZACION" or close variants
        if (lab.includes('FERTILIZACI') || lab.includes('FERTILIZANTE') || lab === 'FERT' || lab === 'ABONO') return 'Fertilizacion';

        // 4. Dynamic category: Take the name of the labor if not recognized above
        return lab || 'Otros';
    }

    static getCycle(fechaStr) {
        if (!fechaStr) return 'Unknown';
        let parts = fechaStr.split('/');
        let year, month;

        if (parts.length === 3) {
            // dd/mm/yyyy
            month = parseInt(parts[1]);
            year = parseInt(parts[2]);
        } else {
            // Try yyyy-mm-dd
            parts = fechaStr.split('-');
            if (parts.length === 3) {
                year = parseInt(parts[0]);
                month = parseInt(parts[1]);
            } else {
                return 'Unknown';
            }
        }

        if (isNaN(month) || isNaN(year)) return 'Unknown';

        // Ciclo Agrícola: May -> Apr
        if (month >= 5) return `${year}-${year + 1}`;
        return `${year - 1}-${year}`;
    }

    static getAvailableCycles() {
        const requested = ['2020-2021', '2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026'];
        const found = new Set(this.REGISTROS.map(r => r.ciclo).filter(c => c !== 'Unknown'));
        requested.forEach(c => found.add(c));
        return [...found].sort().reverse();
    }

    static getFincas() {
        return ['El Espejo', 'Fincas Viejas'];
    }

    static getPredios(finca) {
        const set = new Set(this.REGISTROS.filter(r => !finca || r.finca_original === finca).map(r => r.clasifica).filter(c => c && c !== 'General'));
        return [...set].sort();
    }

    static getVariedades(finca, predio) {
        const set = new Set(this.REGISTROS.filter(r => (!finca || r.finca_original === finca) && (!predio || r.clasifica === predio)).map(r => r.variedad).filter(v => v));
        return [...set].sort();
    }

    static applyFilters(data, filters = {}) {
        return data.filter(r => {
            if (filters.finca && r.finca_original !== filters.finca) return false;
            if (filters.ciclo && r.ciclo !== filters.ciclo) return false;
            if (filters.predio && r.clasifica !== filters.predio) return false;
            if (filters.variedad && r.variedad !== filters.variedad) return false;
            if (filters.cuartel && r.cuartel !== filters.cuartel) return false;
            return true;
        });
    }

    static getResumen(filters = {}) {
        const all = this.applyFilters(this.REGISTROS, filters);
        const distribution = {};
        const prodCounts = {};

        all.forEach(r => {
            distribution[r.categoria] = (distribution[r.categoria] || 0) + 1;
            const key = `${r.producto}|${r.labor_codigo}`;
            if (!prodCounts[key]) {
                prodCounts[key] = { producto: r.producto, labor: r.labor_codigo, totalCantidad: 0, count: 0, costo: 0 };
            }
            prodCounts[key].totalCantidad += r.cantidad;
            prodCounts[key].costo += (r.costo_total || 0);
            prodCounts[key].count++;
        });

        const topProducts = Object.values(prodCounts)
            .sort((a, b) => b.totalCantidad - a.totalCantidad)
            .slice(0, 10);

        const sumCost = (cat) => all.filter(r => r.categoria === cat).reduce((s, r) => s + (r.costo_total || 0), 0);

        return {
            totalApplications: all.length,
            foliares: { count: all.filter(r => r.categoria === 'Foliares').length, costo: sumCost('Foliares') },
            herbicidas: { count: all.filter(r => r.categoria === 'Herbicidas').length, costo: sumCost('Herbicidas') },
            fertilizacion: { count: all.filter(r => r.categoria === 'Fertilizacion').length, costo: sumCost('Fertilizacion') },
            distribution,
            topProducts
        };
    }

    static getFoliares(filters = {}) {
        return this.applyFilters(this.REGISTROS.filter(r => r.categoria === 'Foliares'), filters);
    }

    static getHerbicidas(filters = {}) {
        return this.applyFilters(this.REGISTROS.filter(r => r.categoria === 'Herbicidas'), filters);
    }

    static getFertilizacionComparativa(filters = {}) {
        const all = this.applyFilters(this.REGISTROS.filter(r => r.categoria === 'Fertilizacion'), filters);
        const groups = {};
        all.forEach(r => {
            const clasifica = r.clasifica || 'Sin Clasifica';
            const key = `${clasifica}|${r.producto}|${r.finca}`;
            if (!groups[key]) groups[key] = { cuartel: clasifica, finca: r.finca, producto: r.producto, clasifica, pre: 0, pos: 0, real: 0 };
            const tipo = (r.tipo_registro || '').toLowerCase();
            if (tipo.includes('pre')) groups[key].pre += r.cantidad;
            else if (tipo.includes('pos')) groups[key].pos += r.cantidad;
            else groups[key].real += r.cantidad;
        });

        return Object.values(groups).map(g => ({
            ...g,
            metaAnual: g.pre + g.pos,
            desvio: g.real - (g.pre + g.pos),
            desvioPct: (g.pre + g.pos) > 0 ? Math.round(((g.real - (g.pre + g.pos)) / (g.pre + g.pos)) * 100) : 0,
        }));
    }

    static getProductComparison(filters = {}) {
        const all = this.applyFilters(this.REGISTROS.filter(r => r.categoria === 'Fertilizacion'), filters);
        const groups = {};
        all.forEach(r => {
            const key = `${r.clasifica || 'Sin Clasifica'}|${r.producto}`;
            if (!groups[key]) groups[key] = { producto: r.producto, clasifica: r.clasifica || 'Sin Clasifica', pre: 0, real: 0 };
            const tipo = (r.tipo_registro || '').toLowerCase();
            if (tipo.includes('presupuestado')) groups[key].pre += r.cantidad;
            else if (tipo === 'real') groups[key].real += r.cantidad;
        });
        return Object.values(groups).sort((a, b) => {
            const clasDiff = a.clasifica.localeCompare(b.clasifica);
            if (clasDiff !== 0) return clasDiff;
            return a.producto.localeCompare(b.producto);
        });
    }

    static getWeeklyEvolution(filters = {}) {
        const all = this.applyFilters(this.REGISTROS.filter(r => r.categoria === 'Fertilizacion'), filters);

        // Group by Month (YYYY-MM) as a proxy for 'Evolution'
        const grouped = {};
        all.forEach(r => {
            if (!r.fecha_aplicacion) return;
            const parts = r.fecha_aplicacion.split('/');
            if (parts.length < 3) return;
            // Format YYYY-MM
            const key = `${parts[2]}-${parts[1].padStart(2, '0')}`;

            if (!grouped[key]) grouped[key] = { pre: 0, real: 0 };

            const tipo = (r.tipo_registro || '').toLowerCase();
            if (tipo.includes('presupuestado')) grouped[key].pre += r.cantidad;
            else grouped[key].real += r.cantidad;
        });

        const sortedKeys = Object.keys(grouped).sort();

        return {
            labels: sortedKeys,
            pptado: sortedKeys.map(k => grouped[k].pre),
            real: sortedKeys.map(k => grouped[k].real)
        };
    }
}
