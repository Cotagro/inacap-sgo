// ==========================================
// FIREBASE CONFIG & INIT
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
    deleteDoc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDnK5Ql0DzM9THRueY2JHzDbnUZDO87sBA",
    authDomain: "inacap-sgo.firebaseapp.com",
    projectId: "inacap-sgo",
    storageBucket: "inacap-sgo.firebasestorage.app",
    messagingSenderId: "1045872472763",
    appId: "1:1045872472763:web:6dadee82cd9d81f8546f9e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Status UI
function setSyncStatus(msg, color = '#ffc107') {
    const el = document.getElementById('sync-status');
    if (el) { el.textContent = msg; el.style.background = color; }
}

// ==========================================
// HELPERS FIRESTORE
// ==========================================
async function fsGetAll(col) {
    const snap = await getDocs(collection(db, col));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fsAdd(col, data) {
    const ref = await addDoc(collection(db, col), { ...data, _ts: serverTimestamp() });
    return ref.id;
}
async function fsSet(col, id, data) {
    await setDoc(doc(db, col, id), { ...data, _ts: serverTimestamp() }, { merge: true });
}
async function fsUpdate(col, id, data) {
    await updateDoc(doc(db, col, id), data);
}
async function fsDelete(col, id) {
    await deleteDoc(doc(db, col, id));
}
async function fsGet(col, id) {
    const snap = await getDoc(doc(db, col, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ==========================================
// CONSTANTES
// ==========================================
const EDIT_PASSWORD = 'admin';
let isEditModeUnlocked = false;
const LISTA_VAJILLA = [
    "Plato hondo", "Tabla sushi madera", "Barco sushi madera", "Plato principal grande",
    "Plato hondo lágrima", "Plato sombrero / pasta", "Plato cuadrado 4 divisiones / ceviche",
    "Plato pizza", "Plato cuadrado sushi 30 cm", "Plato de presentacion", "Puente sushi 43x22cm",
    "Librillos de greda 16x6cm", "Librillos de greda 8cm", "Pocillos de vidrio 12x6cm",
    "Dispensador de azucar", "Ramequín", "Tazón consomé", "Plato cuadrado", "Taza té",
    "Taza café", "Pocillo dividido", "Pocillo salsa", "Bowl osaka (cerámico blanco)",
    "Mantequillero", "Plato triangular 12x17cm", "Cuchara coctel cerámica", "Plato ovalado",
    "Plato coctel vidrio 12cm", "Salsero / Cremero", "Plato ensalada", "Salero", "Pimentero",
    "Piedra pizarra cuadrada", "Piedra pizarra rectangular", "Copa vino tinto", "Copa vino blanco",
    "Copa de agua", "Copa flauta", "Copa margarita", "Copa martini", "Copa cognac",
    "Vaso tumbler / largo", "Vaso whisky / rock", "Vaso shot", "Taza de capuccino",
    "Jarra de vidrio", "Florero", "Plato sombrero grande", "Plato sombrero pequeño"
];

let calendar;
let datosConsolidadoGlobal = { total: null, detalle: null, range: '' };
let cacheHorario = [];
let ingredientesTemporales = [];
let utensiliosTemporales = [];
let bodegaOperador = '';
let bodegaUnsubscribe = null;

// ==========================================
// HELPERS DE FORMATO
// ==========================================
function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

async function getWeekNumber(dateStr) {
    const semanas = await fsGetAll('semanas');
    semanas.sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
    const target = new Date(dateStr);
    const found = semanas.find(s => new Date(s.fechaInicio) <= target);
    return found ? found.numero : null;
}

// ==========================================
// NAVEGACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setSyncStatus('🟢 Conectado a Firebase', '#28a745');

    const navButtons = document.querySelectorAll('nav button');
    navButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const sectionId = button.dataset.section;
            if (sectionId === 'configuracion' && !isEditModeUnlocked) {
                const pass = prompt('Ingrese clave de administrador:');
                if (pass === EDIT_PASSWORD) {
                    isEditModeUnlocked = true;
                    document.getElementById('configuracion').classList.remove('locked');
                } else return;
            }
            if (sectionId === 'configuracion') await renderOpCopySelect();
            if (sectionId === 'consolidado') await renderConsolidadoWeekSelectors();
            if (sectionId === 'calendario') await renderCalendar();
            if (sectionId === 'gestion-docente') await renderGestionDocente();
            if (sectionId === 'ingredientes') await renderIngredientesDB();
            if (sectionId === 'ver-ops') await renderGroupedOPs();
            if (sectionId === 'horario') { await renderWeekFilter(); await renderHorario(); }
            if (sectionId === 'etiquetas') { await renderEtiquetaWeekFilter(); }
            if (sectionId === 'bodega') { await renderBodegaWeekFilter(); }

            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            document.querySelectorAll('main section').forEach(sec => sec.classList.remove('active-section'));
            document.getElementById(sectionId).classList.add('active-section');
            if (sectionId === 'calendario' && calendar) setTimeout(() => calendar.render(), 100);
        });
    });

    initAll();
});

async function initAll() {
    await Promise.all([
        renderSemanas(), renderProfesores(), renderAsignaturas(),
        renderIngredientesDB(), renderGroupedOPs(), renderHorario(),
        renderBloqueos(), renderOpCopySelect()
    ]);
    await renderCalendar();
    await renderCalendarioFiltroProfesor();
}

// ==========================================
// RENDERIZADO — SEMANAS
// ==========================================
async function renderSemanas() {
    const lista = document.getElementById('lista-semanas');
    if (!lista) return;
    lista.innerHTML = '';
    const semanas = await fsGetAll('semanas');
    semanas.sort((a, b) => a.numero - b.numero);
    semanas.forEach(s => {
        const li = document.createElement('li');
        li.innerHTML = `<span><b>Semana ${s.numero}</b> (${formatDate(s.fechaInicio)})</span>
            <button class="delete-btn" onclick="deleteItem('semanas','${s.id}')">🗑️</button>`;
        lista.appendChild(li);
    });
    await renderWeekFilter();
}

// ==========================================
// RENDERIZADO — PROFESORES
// ==========================================
async function renderProfesores() {
    const lista = document.getElementById('lista-profesores');
    const profesores = await fsGetAll('profesores');
    profesores.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (lista) {
        lista.innerHTML = profesores.map(p =>
            `<li><span>${p.nombre}</span>
            <button class="delete-btn" onclick="deleteItem('profesores','${p.id}')">🗑️</button></li>`
        ).join('');
    }
    ['schedule-profesor', 'edit-schedule-reemplazo'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
            const val = sel.value;
            sel.innerHTML = '<option value="">Seleccione Profesor</option>';
            profesores.forEach(p => sel.innerHTML += `<option value="${p.id}">${p.nombre}</option>`);
            if (val) sel.value = val;
        }
    });
}

// ==========================================
// RENDERIZADO — ASIGNATURAS
// ==========================================
async function renderAsignaturas() {
    const lista = document.getElementById('lista-asignaturas');
    const asignaturas = await fsGetAll('asignaturas');
    asignaturas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (lista) {
        lista.innerHTML = asignaturas.map(a =>
            `<li><span>${a.nombre} (${a.totalClases} clases)</span>
            <button class="delete-btn" onclick="deleteItem('asignaturas','${a.id}')">🗑️</button></li>`
        ).join('');
    }
    ['op-asignatura', 'schedule-asignatura'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
            const currentVal = sel.value;
            sel.innerHTML = '<option value="">Seleccione Asignatura</option>';
            asignaturas.forEach(a => sel.innerHTML += `<option value="${a.id}">${a.nombre}</option>`);
            if (currentVal) sel.value = currentVal;
        }
    });
}

// ==========================================
// RENDERIZADO — BLOQUEOS
// ==========================================
async function renderBloqueos() {
    const lista = document.getElementById('lista-bloqueos');
    if (!lista) return;
    const bloqueos = await fsGetAll('bloqueos');
    lista.innerHTML = bloqueos.map(b =>
        `<li><span>📅 ${formatDate(b.fecha)} - ${b.horario}</span>
        <button class="delete-btn" onclick="deleteItem('bloqueos','${b.id}')">🗑️</button></li>`
    ).join('');
}

// ==========================================
// RENDERIZADO — INGREDIENTES BD
// ==========================================
async function renderIngredientesDB() {
    const ings = await fsGetAll('ingredientes');
    ings.sort((a, b) => a.nombre.localeCompare(b.nombre));
    const datalist = document.getElementById('ingredientes-datalist');
    if (datalist) datalist.innerHTML = ings.map(i => `<option value="${i.nombre}">`).join('');
    const listaDB = document.getElementById('ingredientes-db-list');
    if (listaDB) {
        listaDB.innerHTML = ings.map(i =>
            `<li><span><b>${i.nombre}</b> <small>(${i.familia})</small> - <span style="color:#666">U.Def: ${i.unidadDefault || 'Libre'}</span></span>
            <button class="delete-btn" onclick="deleteItem('ingredientes','${i.id}')">🗑️</button></li>`
        ).join('');
    }
}

// ==========================================
// RENDERIZADO — VER OPs
// ==========================================
async function renderGroupedOPs(search = '') {
    const container = document.getElementById('op-viewer-container');
    if (!container) return;
    container.innerHTML = '';
    const [asignaturas, ops] = await Promise.all([fsGetAll('asignaturas'), fsGetAll('ops')]);
    asignaturas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (asignaturas.length === 0) { container.innerHTML = "<p>No hay asignaturas creadas.</p>"; return; }
    asignaturas.forEach(asig => {
        let opsAsig = ops.filter(o => o.asignaturaId === asig.id).sort((a, b) => a.numeroClase - b.numeroClase);
        if (search) {
            const term = search.toLowerCase();
            opsAsig = opsAsig.filter(o =>
                (o.nombreReceta || '').toLowerCase().includes(term) ||
                (o.ingredientes || []).some(i => i.nombre.toLowerCase().includes(term))
            );
        }
        if (opsAsig.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'asignatura-group';
            const opsHTML = opsAsig.map(op => `
                <div class="op-list-item">
                    <div class="actions">
                        <button class="edit-btn" onclick="editOP('${op.id}')">✏️</button>
                        <button class="delete-btn" onclick="deleteItem('ops','${op.id}')">🗑️</button>
                    </div>
                    <h5>Clase ${op.numeroClase}: ${op.sinPedido ? 'Teórica' : op.nombreReceta}</h5>
                    <small>Ings: ${(op.ingredientes || []).length} | Utensilios: ${(op.utensilios || []).length}</small>
                </div>`).join('');
            groupDiv.innerHTML = `
                <div class="asignatura-header" onclick="this.nextElementSibling.classList.toggle('active')">
                    <h3>${asig.nombre} (${opsAsig.length} OPs)</h3>
                    <button type="button" class="export-btn" style="padding:5px; font-size:12px;" onclick="exportarExcelAsignatura('${asig.id}')">📥 Excel Curso</button>
                </div>
                <div class="ops-list ${search ? 'active' : ''}">${opsHTML}</div>`;
            container.appendChild(groupDiv);
        }
    });
}

const opSearchInput = document.getElementById('op-search-input');
if (opSearchInput) opSearchInput.addEventListener('input', e => renderGroupedOPs(e.target.value));

// ==========================================
// RENDERIZADO — COPIAR OP
// ==========================================
async function renderOpCopySelect() {
    const sel = document.getElementById('op-copy-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccione una OP para copiar --</option>';
    const [allOps, asigs] = await Promise.all([fsGetAll('ops'), fsGetAll('asignaturas')]);
    allOps.sort((a, b) => {
        const na = asigs.find(x => x.id === a.asignaturaId)?.nombre || '';
        const nb = asigs.find(x => x.id === b.asignaturaId)?.nombre || '';
        return na.localeCompare(nb) || a.numeroClase - b.numeroClase;
    });
    allOps.forEach(op => {
        const asigName = asigs.find(a => a.id === op.asignaturaId)?.nombre || '???';
        sel.innerHTML += `<option value="${op.id}">[${asigName}] C${op.numeroClase}: ${op.nombreReceta}</option>`;
    });
}

document.getElementById('btn-copy-op')?.addEventListener('click', async () => {
    const id = document.getElementById('op-copy-select').value;
    if (!id) { alert('Seleccione una OP primero.'); return; }
    const sourceOp = await fsGet('ops', id);
    if (!sourceOp) return;
    if (confirm(`¿Copiar receta, ingredientes y utensilios de "${sourceOp.nombreReceta}"?`)) {
        document.getElementById('op-nombre-receta').value = sourceOp.nombreReceta;
        document.getElementById('op-docente-panol').value = sourceOp.docentePanol || '';
        ingredientesTemporales = JSON.parse(JSON.stringify(sourceOp.ingredientes || []));
        utensiliosTemporales = JSON.parse(JSON.stringify(sourceOp.utensilios || []));
        renderTempIngredientes();
        renderTempUtensilios();
        alert('Datos copiados exitosamente.');
    }
});

// ==========================================
// CALENDARIO
// ==========================================
async function renderCalendarioFiltroProfesor() {
    const sel = document.getElementById('calendario-filtro-profesor');
    if (!sel) return;
    const profesores = await fsGetAll('profesores');
    profesores.sort((a, b) => a.nombre.localeCompare(b.nombre));
    sel.innerHTML = '<option value="">— Todos los profesores —</option>';
    profesores.forEach(p => sel.innerHTML += `<option value="${p.id}">${p.nombre}</option>`);
}

document.getElementById('calendario-filtro-profesor')?.addEventListener('change', () => renderCalendar());
document.getElementById('btn-limpiar-filtro-cal')?.addEventListener('click', () => {
    document.getElementById('calendario-filtro-profesor').value = '';
    renderCalendar();
});

async function renderCalendar() {
    const filtroProf = document.getElementById('calendario-filtro-profesor')?.value || '';
    let eventsData = await fsGetAll('horario');
    if (filtroProf) {
        eventsData = eventsData.filter(e => e.profesorId === filtroProf || e.reemplazoId === filtroProf);
    }
    const [asigs, profs, ops] = await Promise.all([fsGetAll('asignaturas'), fsGetAll('profesores'), fsGetAll('ops')]);
    const events = eventsData.map(ev => {
        const asigName = asigs.find(a => a.id === ev.asignaturaId)?.nombre || 'Clase';
        const op = ops.find(o => o.asignaturaId === ev.asignaturaId && o.numeroClase === ev.clase);
        const receta = op ? (op.sinPedido ? "Teórica" : op.nombreReceta) : "Sin OP";
        let profName = profs.find(p => p.id === ev.profesorId)?.nombre || 'Sin Profesor';
        if (ev.reemplazoId) {
            const reemName = profs.find(p => p.id === ev.reemplazoId)?.nombre;
            profName += ` (Reemplazo: ${reemName})`;
        }
        const [startH, endH] = ev.horario.split(' - ');
        return {
            title: `${asigName} (C${ev.clase})`,
            start: `${ev.fecha}T${startH}:00`,
            end: `${ev.fecha}T${endH}:00`,
            classNames: [`sala-${ev.sala}`],
            backgroundColor: ev.reemplazoId ? '#ffc107' : '',
            borderColor: ev.reemplazoId ? '#e0a800' : '',
            textColor: '#000000',
            extendedProps: { profesor: profName, sala: ev.sala, horario: ev.horario, receta, claseNum: ev.clase, asignatura: asigName }
        };
    });
    const el = document.getElementById('calendar-container');
    if (!el) return;
    if (calendar) calendar.destroy();
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'timeGridWeek', locale: 'es', events,
        slotMinTime: '08:00', slotMaxTime: '23:00', height: 'auto', allDaySlot: false, hiddenDays: [0],
        eventDidMount(info) {
            const p = info.event.extendedProps;
            info.el.setAttribute('title', `CLASE N° ${p.claseNum}\nAsignatura: ${p.asignatura}\nReceta: ${p.receta}\nProfesor: ${p.profesor}\nHorario: ${p.horario}\nSala: ${p.sala}`);
        }
    });
    calendar.render();
    await renderCalendarioFiltroProfesor();
}

// ==========================================
// HORARIO Y FILTROS
// ==========================================
async function renderWeekFilter() {
    const sel = document.getElementById('semana-filter');
    if (!sel) return;
    const currentValue = sel.value;
    const semanas = await fsGetAll('semanas');
    semanas.sort((a, b) => a.numero - b.numero);
    sel.innerHTML = '<option value="TODAS">Mostrar Todas</option>';
    semanas.forEach(s => sel.innerHTML += `<option value="${s.numero}">Semana ${s.numero}</option>`);
    if (currentValue) sel.value = currentValue;
}

document.getElementById('semana-filter')?.addEventListener('change', () => renderHorario());
document.querySelectorAll('#dias-filter-container input').forEach(input =>
    input.addEventListener('change', () => renderHorario())
);

async function renderHorario() {
    const container = document.getElementById('horario-output');
    if (!container) return;
    container.innerHTML = '';
    const semanaVal = document.getElementById('semana-filter')?.value || 'TODAS';
    const diasChecks = [...document.querySelectorAll('#dias-filter-container input:checked')].map(cb => parseInt(cb.value));
    let clases = await fsGetAll('horario');
    if (semanaVal !== 'TODAS') clases = clases.filter(x => x.semana === parseInt(semanaVal));
    if (diasChecks.length > 0) clases = clases.filter(c => diasChecks.includes(new Date(c.fecha + 'T12:00:00').getDay()));
    clases.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const [profs, asigs] = await Promise.all([fsGetAll('profesores'), fsGetAll('asignaturas')]);
    if (clases.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">No hay clases con los filtros actuales.</div>';
        return;
    }
    clases.forEach(c => {
        const titular = profs.find(p => p.id === c.profesorId)?.nombre || 'N/A';
        const asig = asigs.find(a => a.id === c.asignaturaId)?.nombre || 'N/A';
        let profDisplay = `👨‍🏫 ${titular}`;
        if (c.reemplazoId) {
            const r = profs.find(p => p.id === c.reemplazoId)?.nombre || 'N/A';
            profDisplay = `<span style="text-decoration:line-through;">${titular}</span> ➡️ <b>Reemplazo: ${r}</b>`;
        }
        container.innerHTML += `
            <div class="horario-item" style="${c.reemplazoId ? 'border-left:5px solid #ffc107;' : ''}">
                <div class="actions">
                    <button class="delete-btn" onclick="deleteItem('horario','${c.id}')">🗑️</button>
                </div>
                <strong>${asig} - Clase ${c.clase} (Semana ${c.semana})</strong><br>
                <span>📅 ${formatDate(c.fecha)} | ⏰ ${c.horario} | 📍 ${c.sala}</span><br>
                <small>${profDisplay}</small>
            </div>`;
    });
}

// ==========================================
// GESTIÓN DOCENTE
// ==========================================
async function renderGestionDocente() {
    const selDocente = document.getElementById('selDocente');
    if (!selDocente) return;
    const profesores = await fsGetAll('profesores');
    profesores.sort((a, b) => a.nombre.localeCompare(b.nombre));
    selDocente.innerHTML = '<option value="">Seleccione Docente...</option>';
    profesores.forEach(p => selDocente.innerHTML += `<option value="${p.id}">${p.nombre}</option>`);
    document.getElementById('selAsignatura').innerHTML = '<option value="">Esperando Docente...</option>';
    document.getElementById('selAsignatura').disabled = true;
    document.getElementById('selDia').innerHTML = '<option value="">Esperando Asignatura...</option>';
    document.getElementById('selDia').disabled = true;
    cacheHorario = await fsGetAll('horario');
    filtrarYRenderizarTabla();
}

window.cambioDocente = async () => {
    const docId = document.getElementById('selDocente').value;
    const selAsig = document.getElementById('selAsignatura');
    const selDia = document.getElementById('selDia');
    selAsig.innerHTML = '<option value="">Cargando...</option>';
    selAsig.disabled = true;
    selDia.innerHTML = '<option value="">Esperando Asignatura...</option>';
    selDia.disabled = true;
    if (!docId) { selAsig.innerHTML = '<option value="">Esperando Docente...</option>'; filtrarYRenderizarTabla(); return; }
    const clasesDocente = cacheHorario.filter(c => c.profesorId === docId || c.reemplazoId === docId);
    const asigIds = [...new Set(clasesDocente.map(c => c.asignaturaId))];
    const todasAsig = await fsGetAll('asignaturas');
    const asignaturas = todasAsig.filter(a => asigIds.includes(a.id));
    selAsig.innerHTML = '<option value="">Seleccione Asignatura...</option>';
    asignaturas.forEach(a => selAsig.innerHTML += `<option value="${a.id}">${a.nombre}</option>`);
    selAsig.disabled = false;
    filtrarYRenderizarTabla();
};

window.cambioAsignatura = async () => {
    const docId = document.getElementById('selDocente').value;
    const asigId = document.getElementById('selAsignatura').value;
    const selDia = document.getElementById('selDia');
    selDia.innerHTML = '<option value="">Cargando...</option>';
    selDia.disabled = true;
    if (!asigId) { selDia.innerHTML = '<option value="">Esperando Asignatura...</option>'; filtrarYRenderizarTabla(); return; }
    const clasesFiltradas = cacheHorario.filter(c => (c.profesorId === docId || c.reemplazoId === docId) && c.asignaturaId === asigId);
    const fechasMap = new Map();
    clasesFiltradas.forEach(c => { if (!fechasMap.has(c.fecha)) fechasMap.set(c.fecha, c.semana); });
    const fechasOrdenadas = Array.from(fechasMap.keys()).sort();
    selDia.innerHTML = '<option value="">Todos los días</option>';
    fechasOrdenadas.forEach(fecha => {
        const dateObj = new Date(fecha + 'T12:00:00');
        const diaSemana = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
        selDia.innerHTML += `<option value="${fecha}">${diaSemana} ${formatDate(fecha)}</option>`;
    });
    selDia.disabled = false;
    filtrarYRenderizarTabla();
};

window.aplicarFiltroFinal = () => filtrarYRenderizarTabla();
window.limpiarFiltros = () => { document.getElementById('selDocente').value = ""; renderGestionDocente(); };

async function filtrarYRenderizarTabla() {
    const container = document.getElementById('gestion-docente-output');
    if (!container) return;
    const docId = document.getElementById('selDocente').value;
    const asigId = document.getElementById('selAsignatura').value;
    const fechaSel = document.getElementById('selDia').value;
    let resultados = cacheHorario;
    if (docId) resultados = resultados.filter(c => c.profesorId === docId || c.reemplazoId === docId);
    if (asigId) resultados = resultados.filter(c => c.asignaturaId === asigId);
    if (fechaSel) resultados = resultados.filter(c => c.fecha === fechaSel);
    resultados.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    if (resultados.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">No se encontraron clases con estos filtros.</div>';
        return;
    }
    const [profs, asigs] = await Promise.all([fsGetAll('profesores'), fsGetAll('asignaturas')]);
    let html = `<table class="consolidado-table"><thead><tr><th>Fecha</th><th>Semana</th><th>Asignatura</th><th>Clase</th><th>Docente</th><th>Acción</th></tr></thead><tbody>`;
    resultados.forEach(x => {
        const asig = asigs.find(y => y.id === x.asignaturaId)?.nombre || '---';
        const titular = profs.find(p => p.id === x.profesorId)?.nombre || '---';
        let docCell = `<b>${titular}</b>`;
        let rowStyle = '';
        if (x.reemplazoId) {
            const r = profs.find(p => p.id === x.reemplazoId)?.nombre;
            docCell = `<span style="color:gray;text-decoration:line-through;">${titular}</span><br><span class="tag-reemplazo">Reemplazo: ${r}</span>`;
            rowStyle = 'background-color:#fff3cd;';
        }
        html += `<tr style="${rowStyle}"><td>${formatDate(x.fecha)}</td><td>${x.semana}</td><td>${asig}</td><td>${x.clase}</td><td>${docCell}</td>
            <td>
                <button class="edit-btn" onclick="openEditScheduleModal('${x.id}')" style="margin-right:5px;">✏️</button>
                <button class="delete-btn" onclick="deleteItem('horario','${x.id}')">🗑️</button>
            </td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ==========================================
// FUNCIONES GLOBALES
// ==========================================
window.deleteItem = async (store, id) => {
    if (confirm('¿Eliminar este elemento permanentemente?')) {
        await fsDelete(store, id);
        if (store === 'profesores') { await renderProfesores(); renderGestionDocente(); }
        if (store === 'asignaturas') await renderAsignaturas();
        if (store === 'semanas') await renderSemanas();
        if (store === 'bloqueos') await renderBloqueos();
        if (store === 'ingredientes') await renderIngredientesDB();
        if (store === 'ops') await renderGroupedOPs();
        if (store === 'horario') { await renderHorario(); await renderGestionDocente(); await renderCalendar(); }
    }
};

window.editOP = async (id) => {
    const op = await fsGet('ops', id);
    if (!op) return;
    document.querySelector('button[data-section="configuracion"]').click();
    document.getElementById('op-edit-id').value = op.id;
    document.getElementById('op-asignatura').value = op.asignaturaId;
    await updateClassSelect.call(document.getElementById('op-asignatura'));
    document.getElementById('op-clase-numero').value = op.numeroClase;
    document.getElementById('op-sin-pedido').checked = op.sinPedido;
    const details = document.getElementById('op-details-section');
    if (details) details.style.display = op.sinPedido ? 'none' : 'block';
    document.getElementById('op-nombre-receta').value = op.nombreReceta || '';
    document.getElementById('op-docente-panol').value = op.docentePanol || '';
    ingredientesTemporales = op.ingredientes || [];
    utensiliosTemporales = op.utensilios || [];
    renderTempIngredientes();
    renderTempUtensilios();
    document.getElementById('op-form-submit-btn').textContent = 'Actualizar OP';
    document.getElementById('op-form').scrollIntoView({ behavior: 'smooth' });
};

window.openEditScheduleModal = async (id) => {
    const c = await fsGet('horario', id);
    if (!c) return;
    document.getElementById('edit-schedule-modal').style.display = 'block';
    document.getElementById('edit-schedule-id').value = c.id;
    document.getElementById('edit-schedule-fecha').value = c.fecha;
    document.getElementById('edit-schedule-horario').value = c.horario;
    document.getElementById('edit-schedule-sala').value = c.sala;
    const sel = document.getElementById('edit-schedule-reemplazo');
    sel.innerHTML = '<option value="">-- Sin Reemplazo --</option>';
    const ps = await fsGetAll('profesores');
    ps.forEach(p => { if (p.id !== c.profesorId) sel.innerHTML += `<option value="${p.id}">${p.nombre}</option>`; });
    if (c.reemplazoId) sel.value = c.reemplazoId;
};

window.removeTempIng = (id) => { ingredientesTemporales = ingredientesTemporales.filter(i => i.id !== id); renderTempIngredientes(); };
window.removeTempUtensilio = (id) => { utensiliosTemporales = utensiliosTemporales.filter(u => u.id !== id); renderTempUtensilios(); };

function renderTempIngredientes() {
    document.getElementById('ingredientes-container').innerHTML = ingredientesTemporales.map(i =>
        `<span style="background:#dee2e6;padding:4px 8px;border-radius:10px;margin:2px;display:inline-block;font-size:0.9em;">
            ${i.nombre} (${i.cantidad} ${i.unidad}) <b style="cursor:pointer;color:red;" onclick="removeTempIng(${i.id})">x</b>
        </span>`
    ).join('');
}

function renderTempUtensilios() {
    document.getElementById('utensilios-container').innerHTML = utensiliosTemporales.map(u =>
        `<span style="background:#ffdae9;padding:4px 8px;border-radius:10px;margin:2px;display:inline-block;font-size:0.9em;">
            ${u.nombre} (${u.cantidad}) <b style="cursor:pointer;color:red;" onclick="removeTempUtensilio(${u.id})">x</b>
        </span>`
    ).join('');
}

// ==========================================
// ETIQUETAS CON QR
// ==========================================
async function renderEtiquetaWeekFilter() {
    const sel = document.getElementById('etiqueta-semana-filter');
    if (!sel) return;
    const semanas = await fsGetAll('semanas');
    semanas.sort((a, b) => a.numero - b.numero);
    sel.innerHTML = '<option value="TODAS">Todas las semanas</option>';
    semanas.forEach(s => sel.innerHTML += `<option value="${s.numero}">Semana ${s.numero}</option>`);
}

document.getElementById('btn-generar-etiquetas')?.addEventListener('click', async () => {
    const semanaVal = document.getElementById('etiqueta-semana-filter').value;
    let clases = await fsGetAll('horario');
    if (semanaVal !== 'TODAS') clases = clases.filter(c => c.semana === parseInt(semanaVal));
    clases.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const [profs, asigs, ops] = await Promise.all([fsGetAll('profesores'), fsGetAll('asignaturas'), fsGetAll('ops')]);
    const container = document.getElementById('etiquetas-preview');
    container.innerHTML = '';

    for (const c of clases) {
        const asig = asigs.find(a => a.id === c.asignaturaId);
        const prof = profs.find(p => p.id === c.profesorId);
        const op = ops.find(o => o.asignaturaId === c.asignaturaId && o.numeroClase === c.clase);
        if (!asig || !prof) continue;

        // URL que abrirá el profe al escanear
        const baseUrl = window.location.href.replace(/\?.*$/, '').replace(/#.*$/, '');
        const qrUrl = `${baseUrl}?bodega_scan=1&horarioId=${c.id}`;

        // Wrapper de etiquetas para esta clase
        const wrapper = document.createElement('div');
        wrapper.className = 'etiqueta-grupo';
        wrapper.innerHTML = `<h4 style="color:#0056b3; margin:15px 0 8px 0;">
            ${asig.nombre} — Clase ${c.clase} | ${formatDate(c.fecha)} | ${c.horario} | Sala ${c.sala}
        </h4>`;

        // Etiqueta principal de la canasta
        const etiquetaClase = document.createElement('div');
        etiquetaClase.className = 'etiqueta-clase';
        etiquetaClase.innerHTML = `
            <div class="etiqueta-header">INACAP SGO — Gastronomía</div>
            <div class="etiqueta-semana">Semana ${c.semana}</div>
            <div class="etiqueta-asignatura">${asig.nombre}</div>
            <div class="etiqueta-clase-num">Clase ${c.clase}</div>
            <div class="etiqueta-receta">${op ? (op.sinPedido ? 'Clase Teórica' : op.nombreReceta) : 'Sin OP asignada'}</div>
            <div class="etiqueta-info">Prof: ${prof.nombre}</div>
            <div class="etiqueta-info">Sala ${c.sala} | ${c.horario}</div>
            <div class="etiqueta-info">${formatDate(c.fecha)}</div>
            <canvas class="qr-canvas" id="qr-${c.id}" style="margin-top:8px;"></canvas>
            <div style="font-size:7pt;color:#666;margin-top:2px;">Escanear para verificar pedido</div>
        `;
        wrapper.appendChild(etiquetaClase);

        // Etiquetas por ingrediente
        if (op && !op.sinPedido && op.ingredientes?.length > 0) {
            const ingsGrid = document.createElement('div');
            ingsGrid.className = 'etiquetas-ingredientes-grid';
            op.ingredientes.forEach(ing => {
                const etIng = document.createElement('div');
                etIng.className = 'etiqueta-ingrediente';
                etIng.innerHTML = `
                    <div class="ei-nombre">${ing.nombre}</div>
                    <div class="ei-cantidad">${ing.cantidad} ${ing.unidad}</div>
                    <div class="ei-clase">${asig.nombre} — Clase ${c.clase}</div>
                    <div class="ei-sala">Sala ${c.sala} | ${formatDate(c.fecha)}</div>
                `;
                ingsGrid.appendChild(etIng);
            });
            wrapper.appendChild(ingsGrid);
        }
        container.appendChild(wrapper);

        // Generar QR después de insertar en DOM
        setTimeout(() => {
    const div = document.getElementById(`qr-${c.id}`);
    if (div && typeof QRCode !== 'undefined') {
        new QRCode(div, {
            text: qrUrl,
            width: 90,
            height: 90,
            correctLevel: QRCode.CorrectLevel.M
        });
    }
}, 300);
    }

    document.getElementById('btn-imprimir-etiquetas').style.display = 'inline-block';
});

document.getElementById('btn-imprimir-etiquetas')?.addEventListener('click', () => window.print());

// ==========================================
// BODEGA — TIEMPO REAL
// ==========================================
async function renderBodegaWeekFilter() {
    const sel = document.getElementById('bodega-semana-filter');
    if (!sel) return;
    const semanas = await fsGetAll('semanas');
    semanas.sort((a, b) => a.numero - b.numero);
    sel.innerHTML = '<option value="TODAS">Todas</option>';
    semanas.forEach(s => sel.innerHTML += `<option value="${s.numero}">Semana ${s.numero}</option>`);
}

document.getElementById('btn-bodega-login')?.addEventListener('click', () => {
    const nombre = document.getElementById('bodega-nombre-input').value.trim();
    if (!nombre) { alert('Ingresa tu nombre para continuar.'); return; }
    bodegaOperador = nombre;
    document.getElementById('bodega-login').style.display = 'none';
    document.getElementById('bodega-panel').style.display = 'block';
    document.getElementById('bodega-operador-display').textContent = bodegaOperador;
    iniciarListenerBodega();
});

window.cerrarSesionBodega = () => {
    bodegaOperador = '';
    if (bodegaUnsubscribe) { bodegaUnsubscribe(); bodegaUnsubscribe = null; }
    document.getElementById('bodega-login').style.display = 'block';
    document.getElementById('bodega-panel').style.display = 'none';
    document.getElementById('bodega-nombre-input').value = '';
};

function iniciarListenerBodega() {
    if (bodegaUnsubscribe) bodegaUnsubscribe();
    // Escucha cambios en tiempo real en la colección 'despachos'
    bodegaUnsubscribe = onSnapshot(collection(db, 'despachos'), async () => {
        await renderBodegaPedidos();
    });
}

document.getElementById('bodega-semana-filter')?.addEventListener('change', () => renderBodegaPedidos());
document.getElementById('bodega-estado-filter')?.addEventListener('change', () => renderBodegaPedidos());

async function renderBodegaPedidos() {
    const container = document.getElementById('bodega-pedidos-container');
    const statsEl = document.getElementById('bodega-stats');
    if (!container) return;

    const semanaVal = document.getElementById('bodega-semana-filter')?.value || 'TODAS';
    const estadoVal = document.getElementById('bodega-estado-filter')?.value || 'TODOS';

    let despachos = await fsGetAll('despachos');
    if (semanaVal !== 'TODAS') despachos = despachos.filter(d => d.semana === parseInt(semanaVal));

    // Filtro estado
    despachos = despachos.filter(d => {
        const tieneFaltante = (d.ingredientes || []).some(i => i.estado === 'FALTA');
        const todosOK = (d.ingredientes || []).every(i => i.estado === 'OK');
        if (estadoVal === 'PENDIENTE') return !d.verificado;
        if (estadoVal === 'VERIFICADO') return d.verificado && !tieneFaltante;
        if (estadoVal === 'ALERTA') return tieneFaltante;
        return true;
    });

    despachos.sort((a, b) => (b.timestampEscaneo || 0) - (a.timestampEscaneo || 0));

    const [profs, asigs] = await Promise.all([fsGetAll('profesores'), fsGetAll('asignaturas')]);

    // Stats
    const totalDespachos = despachos.length;
    const conAlertas = despachos.filter(d => (d.ingredientes || []).some(i => i.estado === 'FALTA')).length;
    const verificados = despachos.filter(d => d.verificado).length;
    const pendientes = despachos.filter(d => !d.verificado).length;

    if (statsEl) {
        statsEl.innerHTML = `
            <div class="stat-card stat-total"><div class="stat-num">${totalDespachos}</div><div class="stat-label">Total</div></div>
            <div class="stat-card stat-pendiente"><div class="stat-num">${pendientes}</div><div class="stat-label">Pendientes</div></div>
            <div class="stat-card stat-ok"><div class="stat-num">${verificados}</div><div class="stat-label">Verificados</div></div>
            <div class="stat-card stat-alerta"><div class="stat-num">${conAlertas}</div><div class="stat-label">Con alertas</div></div>
        `;
    }

    if (despachos.length === 0) {
        container.innerHTML = '<div style="padding:30px;text-align:center;color:#666;">No hay pedidos con estos filtros.</div>';
        return;
    }

    container.innerHTML = '';

    for (const d of despachos) {
        const asig = asigs.find(a => a.id === d.asignaturaId);
        const prof = profs.find(p => p.id === d.profesorId);
        const tieneFaltante = (d.ingredientes || []).some(i => i.estado === 'FALTA');
        const todoVerificado = (d.ingredientes || []).length > 0 && (d.ingredientes || []).every(i => i.estado);
        const estadoBadge = tieneFaltante
            ? '<span class="badge badge-alerta">🔴 CON FALTANTES</span>'
            : todoVerificado
                ? '<span class="badge badge-ok">🟢 VERIFICADO</span>'
                : '<span class="badge badge-pendiente">🟡 PENDIENTE</span>';

        const escaneoTime = d.timestampEscaneo ? new Date(d.timestampEscaneo).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '--';

        const filasIng = (d.ingredientes || []).map(ing => {
            const estadoClass = ing.estado === 'OK' ? 'ing-ok' : ing.estado === 'FALTA' ? 'ing-falta' : 'ing-pendiente';
            const estadoIcon = ing.estado === 'OK' ? '✅' : ing.estado === 'FALTA' ? '❌' : '⬜';
            return `
                <tr class="${estadoClass}">
                    <td>${estadoIcon} ${ing.nombre}</td>
                    <td>${ing.cantidad} ${ing.unidad}</td>
                    <td>
                        <button class="btn-ing-ok" onclick="marcarIngrediente('${d.id}','${ing.id}','OK')" style="background:#28a745;padding:3px 8px;font-size:11px;" ${ing.estado === 'OK' ? 'disabled' : ''}>✅</button>
                        <button class="btn-ing-falta" onclick="marcarIngrediente('${d.id}','${ing.id}','FALTA')" style="background:#dc3545;padding:3px 8px;font-size:11px;" ${ing.estado === 'FALTA' ? 'disabled' : ''}>❌</button>
                    </td>
                </tr>`;
        }).join('');

        const extrasHTML = (d.extras || []).map(e =>
            `<tr style="background:#fff3cd;"><td>➕ ${e.nombre}</td><td>${e.cantidad} ${e.unidad}</td><td><small>Extra solicitado</small></td></tr>`
        ).join('');

        const card = document.createElement('div');
        card.className = `pedido-card ${tieneFaltante ? 'pedido-alerta' : todoVerificado ? 'pedido-ok' : 'pedido-pendiente'}`;
        card.innerHTML = `
            <div class="pedido-header">
                <div>
                    <strong>${asig?.nombre || '---'} — Clase ${d.clase}</strong>
                    <span style="margin-left:10px;">${estadoBadge}</span><br>
                    <small>Prof: ${prof?.nombre || '---'} | Sala ${d.sala} | ${formatDate(d.fecha)} | ${d.horario}</small><br>
                    <small>📱 Escaneado: ${escaneoTime} | 👤 ${d.operador || 'Sin asignar'}</small>
                </div>
            </div>
            <table class="consolidado-table" style="margin-top:8px;">
                <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Estado</th></tr></thead>
                <tbody>${filasIng}${extrasHTML}</tbody>
            </table>
            <div style="margin-top:10px;">
                <textarea id="obs-${d.id}" placeholder="Observaciones / notas bodega..." style="width:100%;box-sizing:border-box;height:50px;font-size:13px;">${d.observacion || ''}</textarea>
                <button onclick="guardarObservacion('${d.id}')" style="background:#6c757d;padding:5px 12px;font-size:12px;margin-top:4px;">💾 Guardar Observación</button>
            </div>
        `;
        container.appendChild(card);
    }
}

window.marcarIngrediente = async (despachoId, ingId, estado) => {
    const despacho = await fsGet('despachos', despachoId);
    if (!despacho) return;
    const ings = (despacho.ingredientes || []).map(i => i.id === ingId ? { ...i, estado } : i);
    const todosVerificados = ings.every(i => i.estado);
    await fsUpdate('despachos', despachoId, {
        ingredientes: ings,
        verificado: todosVerificados,
        operador: bodegaOperador,
        timestampVerificacion: Date.now()
    });
};

window.guardarObservacion = async (despachoId) => {
    const obs = document.getElementById(`obs-${despachoId}`)?.value || '';
    await fsUpdate('despachos', despachoId, { observacion: obs, operador: bodegaOperador });
    alert('Observación guardada.');
};

// ==========================================
// EXPORTAR HISTORIAL BODEGA
// ==========================================
document.getElementById('btn-exportar-historial-bodega')?.addEventListener('click', async () => {
    const despachos = await fsGetAll('despachos');
    const [profs, asigs] = await Promise.all([fsGetAll('profesores'), fsGetAll('asignaturas')]);
    const wb = XLSX.utils.book_new();
    const data = [];
    despachos.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).forEach(d => {
        const asig = asigs.find(a => a.id === d.asignaturaId)?.nombre || '---';
        const prof = profs.find(p => p.id === d.profesorId)?.nombre || '---';
        (d.ingredientes || []).forEach(ing => {
            data.push({
                'Fecha': formatDate(d.fecha),
                'Semana': d.semana,
                'Asignatura': asig,
                'Clase': d.clase,
                'Profesor': prof,
                'Sala': d.sala,
                'Ingrediente': ing.nombre,
                'Cantidad': ing.cantidad,
                'Unidad': ing.unidad,
                'Estado': ing.estado || 'PENDIENTE',
                'Observación': d.observacion || '',
                'Operador Bodega': d.operador || '',
                'Tipo': 'Normal'
            });
        });
        (d.extras || []).forEach(e => {
            data.push({
                'Fecha': formatDate(d.fecha),
                'Semana': d.semana,
                'Asignatura': asig,
                'Clase': d.clase,
                'Profesor': prof,
                'Sala': d.sala,
                'Ingrediente': e.nombre,
                'Cantidad': e.cantidad,
                'Unidad': e.unidad,
                'Estado': 'EXTRA',
                'Observación': d.observacion || '',
                'Operador Bodega': d.operador || '',
                'Tipo': 'Extra'
            });
        });
    });
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Historial Bodega');
    XLSX.writeFile(wb, `Historial_Bodega_${new Date().toISOString().split('T')[0]}.xlsx`);
});

// ==========================================
// MANEJO DEL QR SCAN (apertura desde iPad)
// ==========================================
async function handleQRScan() {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('bodega_scan')) return;
    const horarioId = params.get('horarioId');
    if (!horarioId) return;

    // Mostrar vista de verificación del profesor
    document.querySelectorAll('main section').forEach(s => s.classList.remove('active-section'));
    const vistaProf = document.createElement('section');
    vistaProf.id = 'vista-profesor';
    vistaProf.className = 'active-section';
    vistaProf.innerHTML = '<div style="padding:20px;text-align:center;">🔄 Cargando pedido...</div>';
    document.querySelector('main').appendChild(vistaProf);

    const c = await fsGet('horario', horarioId);
    if (!c) { vistaProf.innerHTML = '<div style="padding:20px;text-align:center;color:red;">❌ Clase no encontrada.</div>'; return; }

    const [asig, prof, op] = await Promise.all([
        fsGet('asignaturas', c.asignaturaId),
        fsGet('profesores', c.profesorId),
        fsGetAll('ops').then(ops => ops.find(o => o.asignaturaId === c.asignaturaId && o.numeroClase === c.clase))
    ]);

    // Crear o recuperar despacho
    let despachos = await fsGetAll('despachos');
    let despacho = despachos.find(d => d.horarioId === horarioId);

    if (!despacho) {
        const nuevoId = await fsAdd('despachos', {
            horarioId,
            asignaturaId: c.asignaturaId,
            profesorId: c.profesorId,
            clase: c.clase,
            sala: c.sala,
            fecha: c.fecha,
            horario: c.horario,
            semana: c.semana,
            ingredientes: (op?.ingredientes || []).map(i => ({ ...i, estado: null })),
            extras: [],
            verificado: false,
            timestampEscaneo: Date.now()
        });
        despacho = await fsGet('despachos', nuevoId);
    }

    // Renderizar vista del profesor
    const ingsHTML = (despacho.ingredientes || []).map(ing => `
        <div class="prof-ing-item" id="pi-${ing.id}">
            <span>${ing.nombre} — <b>${ing.cantidad} ${ing.unidad}</b></span>
            <div>
                <button onclick="profMarcarIng('${despacho.id}','${ing.id}','OK')" style="background:#28a745;padding:5px 12px;">✅ OK</button>
                <button onclick="profMarcarIng('${despacho.id}','${ing.id}','FALTA')" style="background:#dc3545;padding:5px 12px;">❌ Falta</button>
            </div>
        </div>`).join('');

    vistaProf.innerHTML = `
        <div style="max-width:600px;margin:0 auto;padding:15px;">
            <div style="background:#0056b3;color:white;padding:15px;border-radius:8px;margin-bottom:15px;text-align:center;">
                <h2 style="margin:0;color:white;">📦 Verificar Pedido</h2>
                <p style="margin:5px 0 0 0;">${asig?.nombre} — Clase ${c.clase}</p>
                <small>Prof: ${prof?.nombre} | Sala ${c.sala} | ${formatDate(c.fecha)}</small>
            </div>
            <div id="prof-ings-list">${ingsHTML}</div>
            <div style="margin-top:20px;background:#f8f9fa;padding:15px;border-radius:8px;border:2px dashed #17a2b8;">
                <h4 style="color:#17a2b8;margin-top:0;">➕ Solicitar Ingrediente Extra</h4>
                <div class="inline-form">
                    <input type="text" id="extra-nombre" placeholder="Nombre ingrediente" style="flex:1;">
                    <input type="number" id="extra-cantidad" placeholder="Cant." style="width:80px;" min="0" step="any">
                    <select id="extra-unidad">
                        <option>Unidad(es)</option><option>Kilo(s)</option><option>Litro(s)</option>
                        <option>Paquete(s)</option><option>Bandeja(s)</option>
                    </select>
                    <button onclick="agregarExtra('${despacho.id}')" style="background:#17a2b8;">Agregar</button>
                </div>
            </div>
            <div id="prof-extras-list" style="margin-top:10px;"></div>
        </div>
    `;

    await renderProfExtras(despacho.id);
}

window.profMarcarIng = async (despachoId, ingId, estado) => {
    const d = await fsGet('despachos', despachoId);
    if (!d) return;
    const ings = (d.ingredientes || []).map(i => i.id === ingId ? { ...i, estado } : i);
    await fsUpdate('despachos', despachoId, { ingredientes: ings });
    const el = document.getElementById(`pi-${ingId}`);
    if (el) {
        el.style.background = estado === 'OK' ? '#d4edda' : '#f8d7da';
        el.style.borderRadius = '6px';
        el.style.padding = '8px';
    }
};

window.agregarExtra = async (despachoId) => {
    const nombre = document.getElementById('extra-nombre')?.value.trim();
    const cantidad = document.getElementById('extra-cantidad')?.value;
    const unidad = document.getElementById('extra-unidad')?.value;
    if (!nombre || !cantidad) { alert('Completa nombre y cantidad.'); return; }
    const d = await fsGet('despachos', despachoId);
    if (!d) return;
    const extras = [...(d.extras || []), { id: Date.now(), nombre, cantidad, unidad }];
    await fsUpdate('despachos', despachoId, { extras });
    document.getElementById('extra-nombre').value = '';
    document.getElementById('extra-cantidad').value = '';
    await renderProfExtras(despachoId);
    alert('✅ Extra enviado a bodega.');
};

async function renderProfExtras(despachoId) {
    const el = document.getElementById('prof-extras-list');
    if (!el) return;
    const d = await fsGet('despachos', despachoId);
    if (!d || !d.extras?.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<h5 style="margin:0 0 5px 0;">Extras solicitados:</h5>' +
        d.extras.map(e => `<div style="background:#fff3cd;padding:6px 10px;border-radius:6px;margin:3px 0;">➕ ${e.nombre} — ${e.cantidad} ${e.unidad}</div>`).join('');
}

// ==========================================
// FORMULARIOS — GUARDAR DATOS
// ==========================================

// Semana
document.getElementById('semana-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const numero = parseInt(document.getElementById('semana-numero').value);
    const fechaInicio = document.getElementById('semana-fecha-inicio').value;
    const existing = await fsGetAll('semanas');
    if (existing.some(s => s.numero === numero)) { alert('El número de semana ya existe.'); return; }
    await fsAdd('semanas', { numero, fechaInicio });
    await renderSemanas();
    e.target.reset();
    alert('Semana agregada.');
});

// Profesor
document.getElementById('profesor-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await fsAdd('profesores', { nombre: document.getElementById('profesor-nombre').value });
    await renderProfesores();
    e.target.reset();
    alert('Profesor agregado.');
});

// Asignatura
document.getElementById('asignatura-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await fsAdd('asignaturas', {
        nombre: document.getElementById('asignatura-nombre').value,
        totalClases: parseInt(document.getElementById('asignatura-clases').value)
    });
    await renderAsignaturas();
    e.target.reset();
    alert('Asignatura agregada.');
});

// Bloqueo
document.getElementById('bloqueo-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await fsAdd('bloqueos', {
        fecha: document.getElementById('bloqueo-fecha').value,
        horario: document.getElementById('bloqueo-horario').value
    });
    await renderBloqueos();
    e.target.reset();
});

// Ingrediente BD
document.getElementById('ingrediente-db-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const nombre = document.getElementById('ingrediente-db-nombre').value;
    const existing = await fsGetAll('ingredientes');
    if (existing.some(i => i.nombre.toLowerCase() === nombre.toLowerCase())) { alert('El ingrediente ya existe.'); return; }
    await fsAdd('ingredientes', {
        nombre,
        familia: document.getElementById('ingrediente-familia').value,
        unidadDefault: document.getElementById('ingrediente-unidad-default').value
    });
    await renderIngredientesDB();
    e.target.reset();
    alert('Ingrediente agregado.');
});

// OP
async function updateClassSelect() {
    const asigId = this.value;
    const sel = document.getElementById('op-clase-numero');
    sel.innerHTML = '<option value="">-- Clase --</option>';
    if (!asigId) return;
    const asig = await fsGet('asignaturas', asigId);
    for (let i = 1; i <= asig.totalClases; i++) sel.innerHTML += `<option value="${i}">Clase ${i}</option>`;
}

document.getElementById('op-asignatura')?.addEventListener('change', updateClassSelect);

document.getElementById('op-sin-pedido')?.addEventListener('change', function () {
    const details = document.getElementById('op-details-section');
    const inputNombre = document.getElementById('op-nombre-receta');
    if (this.checked) { details.style.display = 'none'; inputNombre.removeAttribute('required'); }
    else { details.style.display = 'block'; inputNombre.setAttribute('required', 'true'); }
});

document.getElementById('op-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const editId = document.getElementById('op-edit-id').value;
    const sinPedido = document.getElementById('op-sin-pedido').checked;
    const asignaturaId = document.getElementById('op-asignatura').value;
    const numeroClase = parseInt(document.getElementById('op-clase-numero').value);
    const data = {
        asignaturaId, numeroClase, sinPedido,
        nombreReceta: sinPedido ? 'Clase Teórica' : document.getElementById('op-nombre-receta').value,
        docentePanol: sinPedido ? '' : document.getElementById('op-docente-panol').value,
        ingredientes: sinPedido ? [] : ingredientesTemporales,
        utensilios: sinPedido ? [] : utensiliosTemporales
    };
    if (editId) {
        await fsUpdate('ops', editId, data);
        alert('OP Actualizada');
    } else {
        const existing = await fsGetAll('ops');
        if (existing.some(o => o.asignaturaId === asignaturaId && o.numeroClase === numeroClase)) {
            alert('Ya existe una OP para esta clase. Edítela desde "Ver OPs".');
            return;
        }
        await fsAdd('ops', data);
        alert('OP Creada');
    }
    document.getElementById('op-form').reset();
    ingredientesTemporales = []; utensiliosTemporales = [];
    renderTempIngredientes(); renderTempUtensilios();
    document.getElementById('op-edit-id').value = '';
    document.getElementById('op-form-submit-btn').textContent = 'Guardar OP Completa';
    document.getElementById('op-details-section').style.display = 'block';
    await renderGroupedOPs();
});

// Añadir ingrediente temporal
document.getElementById('add-ingrediente-btn')?.addEventListener('click', async () => {
    const nombre = document.getElementById('ingrediente-nombre-input').value;
    const cant = document.getElementById('ingrediente-cantidad').value;
    const unidad = document.getElementById('ingrediente-unidad').value;
    if (!nombre || !cant) return;
    if (ingredientesTemporales.some(i => i.nombre.trim().toLowerCase() === nombre.trim().toLowerCase())) {
        alert(`⚠️ "${nombre}" ya está en la lista.`); return;
    }
    ingredientesTemporales.push({ id: Date.now(), nombre: nombre.trim(), cantidad: cant, unidad });
    renderTempIngredientes();
    document.getElementById('ingrediente-nombre-input').value = '';
    document.getElementById('ingrediente-cantidad').value = '';
    document.getElementById('ingrediente-unidad').disabled = false;
});

// Autocompletado unidad
document.getElementById('ingrediente-nombre-input')?.addEventListener('input', async function () {
    const ings = await fsGetAll('ingredientes');
    const ingDB = ings.find(i => i.nombre.toLowerCase() === this.value.toLowerCase());
    const sel = document.getElementById('ingrediente-unidad');
    if (ingDB && ingDB.unidadDefault && ingDB.unidadDefault !== 'LIBRE') {
        sel.value = ingDB.unidadDefault; sel.disabled = true;
    } else { sel.disabled = false; }
});

// Utensilios
document.getElementById('add-utensilio-btn')?.addEventListener('click', () => {
    const nombre = document.getElementById('utensilio-nombre').value;
    const cant = document.getElementById('utensilio-cantidad').value;
    if (!nombre || !cant) return;
    utensiliosTemporales.push({ id: Date.now() + 1, nombre, cantidad: cant });
    renderTempUtensilios();
    document.getElementById('utensilio-nombre').value = '';
    document.getElementById('utensilio-cantidad').value = '';
});

// Programar clase
document.getElementById('schedule-asignatura')?.addEventListener('change', async function () {
    const asigId = this.value;
    const sel = document.getElementById('schedule-clase');
    sel.innerHTML = '<option value="">-- Clase --</option>';
    if (!asigId) return;
    const asig = await fsGet('asignaturas', asigId);
    for (let i = 1; i <= asig.totalClases; i++) sel.innerHTML += `<option value="${i}">Clase ${i}</option>`;
});

document.getElementById('schedule-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const asigId = document.getElementById('schedule-asignatura').value;
    const claseInicio = parseInt(document.getElementById('schedule-clase').value);
    const fechaInicio = document.getElementById('schedule-fecha').value;
    const sala = document.getElementById('schedule-sala').value;
    const horario = document.getElementById('schedule-horario').value;
    const profId = document.getElementById('schedule-profesor').value;
    const recurring = document.getElementById('schedule-recurring').checked;

    const existing = await fsGetAll('horario');
    const ocupado = existing.find(c => c.fecha === fechaInicio && c.sala === sala && c.horario === horario);
    if (ocupado) { alert(`⚠️ CONFLICTO: La sala ${sala} ya está ocupada ese día y horario.`); return; }

    if (!recurring) {
        const semana = await getWeekNumber(fechaInicio);
        if (!semana) { alert('Fecha fuera de rango de semanas configuradas.'); return; }
        await fsAdd('horario', { profesorId: profId, asignaturaId: asigId, clase: claseInicio, sala, fecha: fechaInicio, horario, semana });
        alert('Clase agendada.');
    } else {
        const asignatura = await fsGet('asignaturas', asigId);
        let clasesAgendadas = 0; let currentClass = claseInicio;
        let currentDate = new Date(fechaInicio + 'T12:00:00');
        let safety = 0;
        const bloqueos = await fsGetAll('bloqueos');
        const horarioActual = await fsGetAll('horario');
        while (currentClass <= asignatura.totalClases && safety < 50) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const isBlocked = bloqueos.some(b => b.fecha === dateStr && (b.horario === 'TODO_EL_DIA' || b.horario === horario));
            const semana = await getWeekNumber(dateStr);
            if (!isBlocked && semana) {
                const salaOcupada = horarioActual.some(c => c.fecha === dateStr && c.sala === sala && c.horario === horario);
                if (!salaOcupada) {
                    await fsAdd('horario', { profesorId: profId, asignaturaId: asigId, clase: currentClass, sala, fecha: dateStr, horario, semana });
                    clasesAgendadas++; currentClass++;
                }
            }
            currentDate.setDate(currentDate.getDate() + 7); safety++;
        }
        alert(`Finalizado. ${clasesAgendadas} clases agendadas.`);
    }
    await renderHorario(); await renderCalendar(); await renderGestionDocente();
});

// Editar clase
document.getElementById('edit-schedule-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('edit-schedule-id').value;
    const f = document.getElementById('edit-schedule-fecha').value;
    const h = document.getElementById('edit-schedule-horario').value;
    const s = document.getElementById('edit-schedule-sala').value;
    const r = document.getElementById('edit-schedule-reemplazo').value;
    const sem = await getWeekNumber(f);
    if (!sem) { alert('La nueva fecha no corresponde a ninguna semana configurada.'); return; }
    await fsUpdate('horario', id, { fecha: f, horario: h, sala: s, semana: sem, reemplazoId: r || null });
    document.getElementById('edit-schedule-modal').style.display = 'none';
    await renderHorario(); await renderCalendar(); await renderGestionDocente();
    alert('Clase actualizada');
});

document.querySelectorAll('.close-btn').forEach(b =>
    b.onclick = () => document.getElementById(b.dataset.modal).style.display = 'none'
);

// ==========================================
// CONSOLIDADO
// ==========================================
async function renderConsolidadoWeekSelectors() {
    const semanas = await fsGetAll('semanas');
    semanas.sort((a, b) => a.numero - b.numero);
    const start = document.getElementById('consolidado-semana-inicio');
    const end = document.getElementById('consolidado-semana-fin');
    start.innerHTML = ''; end.innerHTML = '';
    if (semanas.length === 0) { start.innerHTML = '<option>Sin datos</option>'; end.innerHTML = '<option>Sin datos</option>'; return; }
    semanas.forEach(s => {
        start.innerHTML += `<option value="${s.numero}">Semana ${s.numero}</option>`;
        end.innerHTML += `<option value="${s.numero}">Semana ${s.numero}</option>`;
    });
}

document.getElementById('generar-consolidado-btn')?.addEventListener('click', async () => {
    const semInicio = parseInt(document.getElementById('consolidado-semana-inicio').value);
    const semFin = parseInt(document.getElementById('consolidado-semana-fin').value);
    if (!semInicio || !semFin) return;
    const [clases, ops, todosIng] = await Promise.all([fsGetAll('horario'), fsGetAll('ops'), fsGetAll('ingredientes')]);
    const familiaMap = {};
    todosIng.forEach(ing => { familiaMap[ing.nombre] = ing.familia || 'Sin Familia'; });
    const clasesFiltradas = clases.filter(c => c.semana >= semInicio && c.semana <= semFin);
    let total = {}, detalle = {};
    clasesFiltradas.forEach(c => {
        const op = ops.find(o => o.asignaturaId === c.asignaturaId && o.numeroClase === c.clase);
        if (op && !op.sinPedido) {
            op.ingredientes.forEach(ing => {
                const familia = familiaMap[ing.nombre] || 'Sin Familia';
                const key = ing.nombre + '|' + ing.unidad;
                if (!total[key]) total[key] = { familia, nombre: ing.nombre, unidad: ing.unidad, cant: 0 };
                total[key].cant += parseFloat(ing.cantidad);
                if (!detalle[c.semana]) detalle[c.semana] = {};
                if (!detalle[c.semana][key]) detalle[c.semana][key] = { familia, nombre: ing.nombre, unidad: ing.unidad, cant: 0 };
                detalle[c.semana][key].cant += parseFloat(ing.cantidad);
            });
        }
    });
    datosConsolidadoGlobal = { total, detalle, range: `${semInicio}-${semFin}` };
    let htmlTotal = `<h3>Total Semanas ${semInicio}-${semFin}</h3><table class="consolidado-table"><thead><tr><th>Familia</th><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th></tr></thead><tbody>`;
    Object.values(total).sort((a, b) => a.familia.localeCompare(b.familia) || a.nombre.localeCompare(b.nombre))
        .forEach(item => { htmlTotal += `<tr><td>${item.familia}</td><td>${item.nombre}</td><td>${item.cant.toFixed(2)}</td><td>${item.unidad}</td></tr>`; });
    htmlTotal += '</tbody></table>';
    let htmlDetalle = '';
    Object.keys(detalle).sort((a, b) => a - b).forEach(sem => {
        htmlDetalle += `<h4>Semana ${sem}</h4><table class="consolidado-table"><thead><tr><th>Familia</th><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th></tr></thead><tbody>`;
        Object.values(detalle[sem]).sort((a, b) => a.familia.localeCompare(b.familia) || a.nombre.localeCompare(b.nombre))
            .forEach(item => { htmlDetalle += `<tr><td>${item.familia}</td><td>${item.nombre}</td><td>${item.cant.toFixed(2)}</td><td>${item.unidad}</td></tr>`; });
        htmlDetalle += '</tbody></table>';
    });
    document.getElementById('consolidado-total').innerHTML = htmlTotal;
    document.getElementById('consolidado-detalle').innerHTML = htmlDetalle;
    document.getElementById('consolidado-resultado').style.display = 'block';
});

document.getElementById('exportar-excel-btn')?.addEventListener('click', () => {
    if (!datosConsolidadoGlobal.total) { alert("Primero genere el consolidado."); return; }
    const wb = XLSX.utils.book_new();
    const dataTotal = Object.values(datosConsolidadoGlobal.total).sort((a, b) => a.familia.localeCompare(b.familia))
        .map(item => ({ "Familia": item.familia, "Ingrediente": item.nombre, "Cantidad Total": item.cant, "Unidad": item.unidad }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTotal), "Total Consolidado");
    Object.keys(datosConsolidadoGlobal.detalle).sort((a, b) => a - b).forEach(sem => {
        const dataSem = Object.values(datosConsolidadoGlobal.detalle[sem]).sort((a, b) => a.familia.localeCompare(b.familia))
            .map(item => ({ "Familia": item.familia, "Ingrediente": item.nombre, "Cantidad": item.cant, "Unidad": item.unidad }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataSem), `Semana ${sem}`);
    });
    XLSX.writeFile(wb, `Consolidado_Semanas_${datosConsolidadoGlobal.range}.xlsx`);
});

// ==========================================
// EXCEL POR ASIGNATURA
// ==========================================
window.exportarExcelAsignatura = async (asigId) => {
    const asig = await fsGet('asignaturas', asigId);
    const ops = (await fsGetAll('ops')).filter(o => o.asignaturaId === asigId).sort((a, b) => a.numeroClase - b.numeroClase);
    if (ops.length === 0) { alert('No hay OPs para esta asignatura.'); return; }
    const wb = XLSX.utils.book_new();
    ops.forEach(op => {
        const data = op.ingredientes.map(i => ({ "Ingrediente": i.nombre, "Cantidad": parseFloat(i.cantidad), "Unidad": i.unidad }));
        if (op.utensilios?.length > 0) {
            data.push({});
            data.push({ "Ingrediente": "--- UTENSILIOS ---" });
            op.utensilios.forEach(u => data.push({ "Ingrediente": u.nombre, "Cantidad": parseFloat(u.cantidad), "Unidad": "Unid." }));
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), `Clase ${op.numeroClase}`);
    });
    XLSX.writeFile(wb, `OPs_${asig.nombre.replace(/\s+/g, '_')}.xlsx`);
};

// ==========================================
// IMPRESIÓN OPs
// ==========================================
window.imprimirOps = async () => {
    try {
        const semanaVal = document.getElementById('semana-filter').value;
        const diasChecks = [...document.querySelectorAll('#dias-filter-container input:checked')].map(cb => parseInt(cb.value));
        let clases = await fsGetAll('horario');
        if (semanaVal !== 'TODAS') clases = clases.filter(c => c.semana === parseInt(semanaVal));
        if (diasChecks.length > 0) clases = clases.filter(c => diasChecks.includes(new Date(c.fecha + 'T12:00:00').getDay()));
        if (clases.length === 0) { alert('No hay clases visibles para imprimir.'); return; }
        const area = document.getElementById('print-area');
        area.innerHTML = '';
        const [profs, asigs, ops] = await Promise.all([fsGetAll('profesores'), fsGetAll('asignaturas'), fsGetAll('ops')]);
        for (const c of clases) {
            const asig = asigs.find(a => a.id === c.asignaturaId);
            const prof = profs.find(p => p.id === c.profesorId);
            const op = ops.find(o => o.asignaturaId === c.asignaturaId && o.numeroClase === c.clase);
            if (!asig || !op) continue;
            let infoProfesor = prof?.nombre;
            if (c.reemplazoId) {
                const r = profs.find(p => p.id === c.reemplazoId)?.nombre;
                infoProfesor = `${prof?.nombre} (Reemplazo: ${r})`;
            }
            let contenido = '';
            if (op.sinPedido) {
                contenido = '<div style="padding:20px;text-align:center;border:1px solid #000;margin-top:20px;"><h3>CLASE TEÓRICA - SIN PEDIDO</h3></div>';
            } else {
                const ingredientesOrdenados = [...op.ingredientes].sort((a, b) => a.nombre.localeCompare(b.nombre));
                const filasIng = ingredientesOrdenados.map(ing => `
                    <tr><td class="col-check"></td><td class="col-check"></td>
                    <td>${ing.nombre}</td>
                    <td style="text-align:center;">${ing.cantidad} ${ing.unidad}</td></tr>`).join('');
                const tablaIng = `<table class="print-table"><thead><tr><th colspan="2" class="col-encargado-header">ENCARGADO</th><th rowspan="2">Ingrediente</th><th rowspan="2">Cantidad</th></tr><tr><th style="font-size:8pt">Armado</th><th style="font-size:8pt">Superv.</th></tr></thead><tbody>${filasIng}</tbody></table>`;
                let filasPanol = (op.utensilios || []).map(u => `<tr><td>${u.nombre}</td><td style="text-align:center;">${u.cantidad}</td></tr>`).join('');
                for (let i = 0; i < 5; i++) filasPanol += '<tr><td style="height:20px;"></td><td></td></tr>';
                const tablaPanolHTML = `<table class="print-table" style="width:100%;"><thead><tr><th>Utensilio (Pañol)</th><th style="width:30px;">Cant.</th></tr></thead><tbody>${filasPanol}</tbody></table>`;
                const filasVajilla = LISTA_VAJILLA.map(v => `<tr><td style="padding:1px 4px;">${v}</td><td style="border:1px solid #000;width:30px;"></td></tr>`).join('');
                const tablaVajillaHTML = `<table class="print-table" style="width:100%;"><thead><tr><th>Vajilla y Montaje</th><th style="width:30px;">Cant.</th></tr></thead><tbody>${filasVajilla}</tbody></table>`;
                const bloqueInferior = `<div style="margin-top:10px;"><strong>PAÑOL, UTENSILIOS Y VAJILLA</strong> (Encargado: ${op.docentePanol || '______________'})<div style="display:flex;gap:10px;align-items:flex-start;margin-top:5px;"><div style="flex:1;">${tablaPanolHTML}</div><div style="flex:1;">${tablaVajillaHTML}</div></div></div>`;
                contenido = tablaIng + bloqueInferior;
            }
            const page = document.createElement('div');
            page.className = 'op-print-sheet';
            page.style.position = 'relative';
            page.innerHTML = `
                <img src="inacap_logo.png" alt="Logo" style="position:absolute;top:0;right:0;max-height:50px;width:auto;">
                <div class="print-header" style="text-align:center;margin-top:5px;">
                    <h2 style="margin:0;text-transform:uppercase;">ORDEN DE PEDIDO - SEMANA ${c.semana}</h2>
                    <hr style="border:1px solid #000;margin-top:5px;">
                    <div class="header-info" style="text-align:left;margin-top:5px;">
                        <p><strong>Asignatura:</strong> ${asig.nombre}</p>
                        <p><strong>Clase N° ${c.clase}:</strong> ${op.nombreReceta}</p>
                        <hr style="border-top:1px solid #ccc;margin:5px 0;">
                        <p><strong>Profesor:</strong> ${infoProfesor} | <strong>Sala:</strong> ${c.sala}</p>
                        <p><strong>Fecha:</strong> ${formatDate(c.fecha)} | <strong>Horario:</strong> ${c.horario}</p>
                    </div>
                </div>
                ${contenido}
                <div class="firmas-container" style="margin-top:20px;">
                    <div class="firma-block"><div class="firma-title">ENTREGA</div><div class="firma-box-row"><div class="firma-line">Firma Docente</div><div class="firma-line">Firma Pañol</div></div></div>
                    <div class="firma-block"><div class="firma-title">DEVOLUCIÓN</div><div class="firma-box-row"><div class="firma-line">Firma Docente</div><div class="firma-line">Firma Pañol</div></div></div>
                </div>`;
            area.appendChild(page);
        }
        window.print();
    } catch (error) { console.error(error); alert("Error al imprimir: " + error.message); }
};

// Verificar si la página fue abierta por QR
handleQRScan();
