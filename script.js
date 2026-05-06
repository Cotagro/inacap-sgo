document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. CONFIGURACIÓN Y BASE DE DATOS
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
    // Variable para cachear los datos en Gestión Docente
    let cacheHorario = []; 

    // Inicialización de Dexie
    const db = new Dexie('OPDatabase_v2');
    db.version(2).stores({
        semanas: '++id, &numero, fechaInicio', // '&' impide números de semana duplicados
        ingredientes: '++id, &nombre, familia, unidadDefault', 
        profesores: '++id, nombre',
        asignaturas: '++id, nombre, totalClases', 
        ops: '++id, &[asignaturaId+numeroClase]', // Una OP única por asignatura y clase
        horario: '++id, fecha, semana', 
        bloqueos: '++id, &[fecha+horario]'
    });

    // ==========================================
    // 2. SELECTORES DOM (Variables Globales)
    // ==========================================
    const navButtons = document.querySelectorAll('nav button');
    
    // Formularios
    const opForm = document.getElementById('op-form');
    const ingredienteDbForm = document.getElementById('ingrediente-db-form');
    const semanaForm = document.getElementById('semana-form');
    const profesorForm = document.getElementById('profesor-form');
    const asignaturaForm = document.getElementById('asignatura-form');
    const scheduleForm = document.getElementById('schedule-form');
    const bloqueoForm = document.getElementById('bloqueo-form');
    const editScheduleForm = document.getElementById('edit-schedule-form');
    
    // Elementos de UI
    const ingredientesDatalist = document.getElementById('ingredientes-datalist');
    const opAsignaturaSelect = document.getElementById('op-asignatura');
    const semanaFilterSelect = document.getElementById('semana-filter');
    const diasFilterInputs = document.querySelectorAll('#dias-filter-container input');
    
    // --- CORRECCIÓN: Selector del buscador ---
    const opSearchInput = document.getElementById('op-search-input');

    // Variables temporales para creación de OP
    let ingredientesTemporales = [];
    let utensiliosTemporales = [];
    let vajillaTemporal = [];

    // ==========================================
    // 3. NAVEGACIÓN (Pestañas)
    // ==========================================
    navButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const sectionId = button.dataset.section;
            
            // Protección de contraseña para configuración
            if (sectionId === 'configuracion' && !isEditModeUnlocked) {
                const pass = prompt('Ingrese clave de administrador:');
                if (pass === EDIT_PASSWORD) {
                    isEditModeUnlocked = true;
                    document.getElementById('configuracion').classList.remove('locked');
                } else { return; }
            }

            // Carga diferida de datos según la sección
            if (sectionId === 'configuracion') await renderOpCopySelect(); // <--- Cargar selector de copia
            if (sectionId === 'consolidado') await renderConsolidadoWeekSelectors();
            if (sectionId === 'calendario') await renderCalendar();
            if (sectionId === 'gestion-docente') await renderGestionDocente();
            if (sectionId === 'ingredientes') await renderIngredientesDB();
            if (sectionId === 'ver-ops') await renderGroupedOPs();
            if (sectionId === 'horario') { await renderWeekFilter(); await renderHorario(); }
            
            // Cambio visual de clases
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            document.querySelectorAll('main section').forEach(sec => sec.classList.remove('active-section'));
            document.getElementById(sectionId).classList.add('active-section');
            
            // Hack para redibujar calendario si estaba oculto
            if (sectionId === 'calendario' && calendar) setTimeout(() => calendar.render(), 100);
        });
    });

    // ==========================================
    // 4. FUNCIONES DE RENDERIZADO (Listas y Selects)
    // ==========================================
    
    async function renderAll() {
        // Ejecutar todas las cargas iniciales en paralelo
        await Promise.all([
            renderSemanas(), 
            renderProfesores(), 
            renderAsignaturas(), 
            renderIngredientesDB(), 
            renderGroupedOPs(), 
            renderHorario(), 
            renderBloqueos(),
            renderOpCopySelect() // <--- Inicializar selector de copia
        ]);
        await renderCalendar();
    }

    // --- A. SEMANAS ---
    async function renderSemanas() {
        const lista = document.getElementById('lista-semanas'); // Asegúrate que este ID esté en tu HTML nuevo
        if (!lista) return;
        lista.innerHTML = '';
        const semanas = await db.semanas.orderBy('numero').toArray();
        semanas.forEach(s => {
            const li = document.createElement('li');
            li.innerHTML = `<span><b>Semana ${s.numero}</b> (${formatDate(s.fechaInicio)})</span> <button class="delete-btn" onclick="deleteItem('semanas', ${s.id})">🗑️</button>`;
            lista.appendChild(li);
        });
        await renderWeekFilter(); // Actualiza el filtro en la sección Horario
    }

    // --- B. PROFESORES ---
    async function renderProfesores() {
        // 1. Renderizar lista visual en Configuración
        const lista = document.getElementById('lista-profesores');
        const profesores = await db.profesores.orderBy('nombre').toArray();
        
        if (lista) {
            lista.innerHTML = profesores.map(p => `<li><span>${p.nombre}</span> <button class="delete-btn" onclick="deleteItem('profesores', ${p.id})">🗑️</button></li>`).join('');
        }

        // 2. Llenar Selects (Programación y Reemplazos)
        // Eliminamos filter-docente-gestion de aquí porque se carga aparte en su función específica
        const selects = ['schedule-profesor', 'edit-schedule-reemplazo'];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if(sel) {
                const val = sel.value; // Preservar selección si existe
                sel.innerHTML = `<option value="">Seleccione Profesor</option>`;
                profesores.forEach(p => sel.innerHTML += `<option value="${p.id}">${p.nombre}</option>`);
                if(val) sel.value = val;
            }
        });
    }

    // --- C. ASIGNATURAS ---
    async function renderAsignaturas() {
        // 1. Renderizar lista visual
        const lista = document.getElementById('lista-asignaturas');
        const asignaturas = await db.asignaturas.orderBy('nombre').toArray();

        if (lista) {
            lista.innerHTML = asignaturas.map(a => `<li><span>${a.nombre} (${a.totalClases} clases)</span> <button class="delete-btn" onclick="deleteItem('asignaturas', ${a.id})">🗑️</button></li>`).join('');
        }

        // 2. Llenar Selects (OP y Programación)
        const selects = ['op-asignatura', 'schedule-asignatura'];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if(sel) {
                const currentVal = sel.value; 
                sel.innerHTML = '<option value="">Seleccione Asignatura</option>';
                asignaturas.forEach(a => sel.innerHTML += `<option value="${a.id}">${a.nombre}</option>`);
                if(currentVal) sel.value = currentVal;
            }
        });
    }

    // --- D. BLOQUEOS ---
    async function renderBloqueos() {
        const lista = document.getElementById('lista-bloqueos');
        if(!lista) return;
        const bloqueos = await db.bloqueos.toArray();
        lista.innerHTML = bloqueos.map(b => `<li><span>📅 ${formatDate(b.fecha)} - ${b.horario}</span> <button class="delete-btn" onclick="deleteItem('bloqueos', ${b.id})">🗑️</button></li>`).join('');
    }

    // --- E. INGREDIENTES BD ---
    async function renderIngredientesDB() {
        const ings = await db.ingredientes.orderBy('nombre').toArray();
        // Llenar datalist para autocompletado
        if(ingredientesDatalist) ingredientesDatalist.innerHTML = ings.map(i => `<option value="${i.nombre}">`).join('');
        
        // Llenar lista visual
        const listaDB = document.getElementById('ingredientes-db-list');
        if(listaDB) {
            listaDB.innerHTML = ings.map(i => 
                `<li><span><b>${i.nombre}</b> <small>(${i.familia})</small> - <span style="color:#666">U.Def: ${i.unidadDefault || 'Libre'}</span></span><button class="delete-btn" onclick="deleteItem('ingredientes', ${i.id})">🗑️</button></li>`
            ).join('');
        }
    }

    // --- F. VISTA DE OPs (Con Buscador Corregido) ---
    async function renderGroupedOPs(search = '') {
        const container = document.getElementById('op-viewer-container');
        if(!container) return;
        container.innerHTML = '';
        const asignaturas = await db.asignaturas.orderBy('nombre').toArray();
        const ops = await db.ops.toArray();

        if (asignaturas.length === 0) { container.innerHTML = "<p>No hay asignaturas creadas.</p>"; return; }

        asignaturas.forEach(asig => {
            // Obtener OPs de la asignatura
            let opsAsig = ops.filter(o => o.asignaturaId === asig.id).sort((a,b) => a.numeroClase - b.numeroClase);
            
            // --- LOGICA DE BÚSQUEDA MEJORADA ---
            if (search) {
                const term = search.toLowerCase();
                opsAsig = opsAsig.filter(o => 
                    // Busca en nombre de receta
                    o.nombreReceta.toLowerCase().includes(term) || 
                    // O busca en la lista de ingredientes
                    o.ingredientes.some(i => i.nombre.toLowerCase().includes(term))
                );
            }

            if (opsAsig.length > 0) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'asignatura-group';
                
                let opsHTML = opsAsig.map(op => `
                    <div class="op-list-item">
                        <div class="actions">
                            <button class="edit-btn" onclick="editOP(${op.id})">✏️</button>
                            <button class="delete-btn" onclick="deleteItem('ops', ${op.id})">🗑️</button>
                        </div>
                        <h5>Clase ${op.numeroClase}: ${op.sinPedido ? 'Teórica' : op.nombreReceta}</h5>
                        <small>Ings: ${op.ingredientes.length} | Utensilios: ${op.utensilios ? op.utensilios.length : 0}</small>
                    </div>`).join('');

                groupDiv.innerHTML = `
                    <div class="asignatura-header" onclick="this.nextElementSibling.classList.toggle('active')">
                        <h3>${asig.nombre} (${opsAsig.length} OPs)</h3>
                        <button type="button" class="export-btn" style="padding:5px; font-size:12px;" onclick="exportarExcelAsignatura(${asig.id})">📥 Excel Curso</button>
                    </div>
                    <div class="ops-list ${search ? 'active' : ''}">${opsHTML}</div>`; // Si hay búsqueda, expandir automáticamente
                container.appendChild(groupDiv);
            }
        });
    }

    // --- CORRECCIÓN: Listener del Buscador ---
    if(opSearchInput) {
        opSearchInput.addEventListener('input', (e) => {
            renderGroupedOPs(e.target.value);
        });
    }

    // ==========================================
    // FUNCION DE COPIA DE OP (NUEVA)
    // ==========================================
    
    async function renderOpCopySelect() {
        const sel = document.getElementById('op-copy-select');
        if(!sel) return;
        sel.innerHTML = '<option value="">-- Seleccione una OP para copiar --</option>';
        
        const allOps = await db.ops.toArray();
        const asigs = await db.asignaturas.toArray();

        // Ordenar para mostrar más bonito
        allOps.sort((a,b) => {
            const asigA = asigs.find(as => as.id === a.asignaturaId)?.nombre || '';
            const asigB = asigs.find(as => as.id === b.asignaturaId)?.nombre || '';
            return asigA.localeCompare(asigB) || a.numeroClase - b.numeroClase;
        });

        allOps.forEach(op => {
            const asigName = asigs.find(a => a.id === op.asignaturaId)?.nombre || '???';
            sel.innerHTML += `<option value="${op.id}">[${asigName}] C${op.numeroClase}: ${op.nombreReceta}</option>`;
        });
    }

    // Listener para el botón de copia
    const btnCopy = document.getElementById('btn-copy-op');
    if(btnCopy) {
        btnCopy.addEventListener('click', async () => {
            const id = parseInt(document.getElementById('op-copy-select').value);
            if(!id) { alert('Seleccione una OP primero.'); return; }
            
            const sourceOp = await db.ops.get(id);
            if(!sourceOp) return;

            if(confirm('¿Copiar receta, ingredientes y utensilios de "' + sourceOp.nombreReceta + '"? Esto reemplazará lo que hayas escrito.')) {
                // Rellenar campos
                document.getElementById('op-nombre-receta').value = sourceOp.nombreReceta;
                document.getElementById('op-docente-panol').value = sourceOp.docentePanol || '';
                
                // Copia profunda de arrays para romper referencia
                ingredientesTemporales = JSON.parse(JSON.stringify(sourceOp.ingredientes || []));
                utensiliosTemporales = JSON.parse(JSON.stringify(sourceOp.utensilios || []));
                
                // Renderizar
                renderTempIngredientes();
                renderTempUtensilios();
                
                alert('Datos copiados exitosamente.');
            }
        });
    }

    // ==========================================
    // 5. CALENDARIO Y HORARIO
    // ==========================================

    async function renderWeekFilter() {
        const sel = document.getElementById('semana-filter');
        if(!sel) return;
        
        const currentValue = sel.value; 
        const semanas = await db.semanas.orderBy('numero').toArray();
        
        sel.innerHTML = '<option value="TODAS">Mostrar Todas</option>';
        semanas.forEach(s => {
            sel.innerHTML += `<option value="${s.numero}">Semana ${s.numero}</option>`;
        });

        if (currentValue && (currentValue === 'TODAS' || semanas.some(s => s.numero == currentValue))) {
            sel.value = currentValue;
        }
    }

    // Listeners para filtros
    if(semanaFilterSelect) semanaFilterSelect.addEventListener('change', () => { renderHorario(); });
    diasFilterInputs.forEach(input => input.addEventListener('change', () => { renderHorario(); }));

    async function renderHorario() {
        const container = document.getElementById('horario-output');
        container.innerHTML = '';
        
        const semanaVal = document.getElementById('semana-filter').value;
        const diasChecks = [...document.querySelectorAll('#dias-filter-container input:checked')].map(cb => parseInt(cb.value));
        
        let clases = await db.horario.toArray();

        // Aplicar Filtros
        if(semanaVal !== 'TODAS') {
            clases = clases.filter(x => x.semana === parseInt(semanaVal));
        }
        if(diasChecks.length > 0) {
            clases = clases.filter(c => diasChecks.includes(new Date(c.fecha + 'T12:00:00').getDay()));
        }

        clases.sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
        const [profs, asigs] = await Promise.all([db.profesores.toArray(), db.asignaturas.toArray()]);

        if(clases.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No hay clases para mostrar con los filtros actuales.</div>';
            return;
        }

        clases.forEach(c => {
            const titular = profs.find(p => p.id === c.profesorId)?.nombre || 'N/A';
            const asig = asigs.find(a => a.id === c.asignaturaId)?.nombre || 'N/A';
            
            let profDisplay = `👨‍🏫 ${titular}`;
            if(c.reemplazoId) {
                const reemplazante = profs.find(p => p.id === c.reemplazoId)?.nombre || 'N/A';
                profDisplay = `<span style="text-decoration:line-through;">${titular}</span> ➡️ <b>Reemplazo: ${reemplazante}</b>`;
            }

            container.innerHTML += `
                <div class="horario-item" style="${c.reemplazoId ? 'border-left: 5px solid #ffc107;' : ''}">
                    <div class="actions">
                        <button class="delete-btn" onclick="deleteItem('horario', ${c.id})">🗑️</button>
                    </div>
                    <strong>${asig} - Clase ${c.clase} (Semana ${c.semana})</strong><br>
                    <span>📅 ${formatDate(c.fecha)} | ⏰ ${c.horario} | 📍 ${c.sala}</span><br>
                    <small>${profDisplay}</small>
                </div>`;
        });
    }

    async function renderCalendar() {
        const eventsData = await db.horario.toArray();
        const asigs = await db.asignaturas.toArray();
        const profs = await db.profesores.toArray();
        const ops = await db.ops.toArray();
        
        const events = eventsData.map(ev => {
            const asigName = asigs.find(a => a.id === ev.asignaturaId)?.nombre || 'Clase';
            const op = ops.find(o => o.asignaturaId === ev.asignaturaId && o.numeroClase === ev.clase);
            const receta = op ? (op.sinPedido ? "Teórica" : op.nombreReceta) : "Sin OP";
            let profName = profs.find(p => p.id === ev.profesorId)?.nombre || 'Sin Profesor';
            if(ev.reemplazoId) {
                const reemName = profs.find(p => p.id === ev.reemplazoId)?.nombre;
                profName += ` (Reemplazo: ${reemName})`;
            }
            const [startH, endH] = ev.horario.split(' - ');
            let color = ''; if(ev.reemplazoId) color = '#ffc107'; 

            return {
                title: `${asigName} (C${ev.clase})`, 
                start: `${ev.fecha}T${startH}:00`, end: `${ev.fecha}T${endH}:00`,
                classNames: [`sala-${ev.sala}`],
                backgroundColor: color, borderColor: color ? '#e0a800' : '', textColor: '#000000', 
                extendedProps: { profesor: profName, sala: ev.sala, horario: ev.horario, receta: receta, claseNum: ev.clase, asignatura: asigName }
            };
        });

        const el = document.getElementById('calendar-container');
        if(calendar) calendar.destroy();
        calendar = new FullCalendar.Calendar(el, {
            initialView: 'timeGridWeek', locale: 'es', events: events,
            slotMinTime: '08:00', slotMaxTime: '23:00', height: 'auto', allDaySlot: false, hiddenDays: [0],
            eventDidMount: function(info) {
                const props = info.event.extendedProps;
                info.el.setAttribute('title', `CLASE N° ${props.claseNum}\nAsignatura: ${props.asignatura}\nReceta: ${props.receta}\nProfesor: ${props.profesor}\nHorario: ${props.horario}\nSala: ${props.sala}`);
            }
        });
        calendar.render();
    }

    // ==========================================
    // 6. GESTIÓN DOCENTE (RENOVADO - FILTROS CASCADA)
    // ==========================================
    
    async function renderGestionDocente() {
        const selDocente = document.getElementById('selDocente');
        if (!selDocente) return;

        // 1. Cargar solo Docentes al iniciar
        const profesores = await db.profesores.orderBy('nombre').toArray();
        selDocente.innerHTML = '<option value="">Seleccione Docente...</option>';
        profesores.forEach(p => {
            selDocente.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
        });

        // 2. Resetear otros selects
        document.getElementById('selAsignatura').innerHTML = '<option value="">Esperando Docente...</option>';
        document.getElementById('selAsignatura').disabled = true;
        document.getElementById('selDia').innerHTML = '<option value="">Esperando Asignatura...</option>';
        document.getElementById('selDia').disabled = true;

        // 3. Cargar datos en memoria para filtrar rápido
        cacheHorario = await db.horario.toArray();
        
        // 4. Renderizar tabla (Mostrar todo o vacía)
        filtrarYRenderizarTabla(); 
    }

    // Funciones globales para los eventos ONCHANGE del HTML
    window.cambioDocente = async () => {
        const docId = parseInt(document.getElementById('selDocente').value);
        const selAsig = document.getElementById('selAsignatura');
        const selDia = document.getElementById('selDia');

        // Resetear siguientes pasos
        selAsig.innerHTML = '<option value="">Cargando...</option>';
        selAsig.disabled = true;
        selDia.innerHTML = '<option value="">Esperando Asignatura...</option>';
        selDia.disabled = true;

        if (!docId) {
            selAsig.innerHTML = '<option value="">Esperando Docente...</option>';
            filtrarYRenderizarTabla();
            return;
        }

        // Filtrar clases de este docente
        const clasesDocente = cacheHorario.filter(c => c.profesorId === docId || c.reemplazoId === docId);
        
        // Obtener asignaturas únicas
        const asigIds = [...new Set(clasesDocente.map(c => c.asignaturaId))];
        const asignaturas = await db.asignaturas.where('id').anyOf(asigIds).toArray();

        // Llenar Select Asignatura
        selAsig.innerHTML = '<option value="">Seleccione Asignatura...</option>';
        asignaturas.forEach(a => {
            selAsig.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
        });
        selAsig.disabled = false;

        filtrarYRenderizarTabla();
    };

    window.cambioAsignatura = async () => {
        const docId = parseInt(document.getElementById('selDocente').value);
        const asigId = parseInt(document.getElementById('selAsignatura').value);
        const selDia = document.getElementById('selDia');

        selDia.innerHTML = '<option value="">Cargando...</option>';
        selDia.disabled = true;

        if (!asigId) {
            selDia.innerHTML = '<option value="">Esperando Asignatura...</option>';
            filtrarYRenderizarTabla();
            return;
        }

        // Filtrar por Docente Y Asignatura para sacar los días
        const clasesFiltradas = cacheHorario.filter(c => 
            (c.profesorId === docId || c.reemplazoId === docId) && 
            c.asignaturaId === asigId
        );

        // Obtener fechas únicas
        const fechasMap = new Map();
        clasesFiltradas.forEach(c => {
            if(!fechasMap.has(c.fecha)) {
                fechasMap.set(c.fecha, c.semana);
            }
        });

        const fechasOrdenadas = Array.from(fechasMap.keys()).sort();

        // Llenar Select Día
        selDia.innerHTML = '<option value="">Todos los días</option>';
        fechasOrdenadas.forEach(fecha => {
            // Fix zona horaria simple
            const dateObj = new Date(fecha + 'T12:00:00'); 
            const diaSemana = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
            selDia.innerHTML += `<option value="${fecha}">${diaSemana} ${formatDate(fecha)}</option>`;
        });
        selDia.disabled = false;

        filtrarYRenderizarTabla();
    };

    window.aplicarFiltroFinal = () => {
        filtrarYRenderizarTabla();
    };

    window.limpiarFiltros = () => {
        document.getElementById('selDocente').value = "";
        renderGestionDocente(); // Reinicia todo
    };

    async function filtrarYRenderizarTabla() {
        const container = document.getElementById('gestion-docente-output');
        const docId = parseInt(document.getElementById('selDocente').value);
        const asigId = parseInt(document.getElementById('selAsignatura').value);
        const fechaSel = document.getElementById('selDia').value;

        // Filtrar datos en memoria
        let resultados = cacheHorario;

        if (docId) {
            resultados = resultados.filter(c => c.profesorId === docId || c.reemplazoId === docId);
        }
        if (asigId) {
            resultados = resultados.filter(c => c.asignaturaId === asigId);
        }
        if (fechaSel) {
            resultados = resultados.filter(c => c.fecha === fechaSel);
        }

        // Ordenar
        resultados.sort((a,b) => new Date(a.fecha) - new Date(b.fecha));

        if (resultados.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No se encontraron clases con estos filtros.</div>';
            return;
        }

        // Obtener nombres para la tabla (DB calls optimizadas)
        const [profs, asigs] = await Promise.all([db.profesores.toArray(), db.asignaturas.toArray()]);

        let html = `
            <table class="consolidado-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Semana</th>
                        <th>Asignatura</th>
                        <th>Clase</th>
                        <th>Docente</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
        `;

        resultados.forEach(x => {
            const asig = asigs.find(y => y.id === x.asignaturaId)?.nombre || '---';
            const titular = profs.find(p => p.id === x.profesorId)?.nombre || '---';
            
            let docCell = `<b>${titular}</b>`;
            let rowStyle = '';

            if(x.reemplazoId) {
                const r = profs.find(p => p.id === x.reemplazoId)?.nombre;
                docCell = `<span style="color:gray;text-decoration:line-through;">${titular}</span><br><span class="tag-reemplazo">Reemplazo: ${r}</span>`;
                rowStyle = 'background-color:#fff3cd;';
            }

            html += `
                <tr style="${rowStyle}">
                    <td>${formatDate(x.fecha)}</td>
                    <td>${x.semana}</td>
                    <td>${asig}</td>
                    <td>${x.clase}</td>
                    <td>${docCell}</td>
                    <td>
                        <button class="edit-btn" onclick="openEditScheduleModal(${x.id})" style="margin-right:5px;" title="Editar">✏️</button>
                        <button class="delete-btn" onclick="deleteItem('horario', ${x.id})" title="Borrar">🗑️</button>
                    </td>
                </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // ==========================================
    // 7. FUNCIONES GLOBALES (ACCESIBLES DESDE HTML)
    // ==========================================

    window.deleteItem = async (store, id) => {
        if(confirm('¿Eliminar este elemento permanentemente?')) {
            await db[store].delete(id);
            // Actualizar Vistas Específicas
            if(store === 'profesores') { await renderProfesores(); renderGestionDocente(); }
            if(store === 'asignaturas') { await renderAsignaturas(); }
            if(store === 'semanas') { await renderSemanas(); }
            if(store === 'bloqueos') { await renderBloqueos(); }
            if(store === 'ingredientes') { await renderIngredientesDB(); }
            if(store === 'ops') { await renderGroupedOPs(); }
            if(store === 'horario') { await renderHorario(); await renderGestionDocente(); await renderCalendar(); }
            
            // Recargar todo por si acaso afecta otras vistas
            if(store === 'profesores' || store === 'asignaturas') renderAll();
        }
    };

    window.editOP = async (id) => {
        const op = await db.ops.get(id);
        if(!op) return;

        // Abrir pestaña config si está cerrada
        document.querySelector('button[data-section="configuracion"]').click();
        if(document.getElementById('configuracion').classList.contains('locked')) { 
            alert('Desbloquea la configuración primero con tu clave.'); 
            return; 
        }

        // Cargar datos en formulario
        document.getElementById('op-edit-id').value = op.id;
        document.getElementById('op-asignatura').value = op.asignaturaId;
        
        await updateClassSelect.call(document.getElementById('op-asignatura')); // Cargar clases del select
        
        document.getElementById('op-clase-numero').value = op.numeroClase;
        document.getElementById('op-sin-pedido').checked = op.sinPedido;
        const details = document.getElementById('op-details-section');
        if(details) details.style.display = op.sinPedido ? 'none' : 'block';

        document.getElementById('op-nombre-receta').value = op.nombreReceta;
        document.getElementById('op-docente-panol').value = op.docentePanol || '';

        // Cargar ingredientes temporales
        ingredientesTemporales = op.ingredientes || [];
        utensiliosTemporales = op.utensilios || [];
        ingredientesTemporales.sort((a, b) => a.nombre.localeCompare(b.nombre));

        renderTempIngredientes();
        renderTempUtensilios();
        document.getElementById('op-form-submit-btn').textContent = 'Actualizar OP';
        document.getElementById('op-form').scrollIntoView({behavior: 'smooth'});
    };

    window.openEditScheduleModal = async (id) => {
        const c = await db.horario.get(id);
        if(!c) return;
        
        document.getElementById('edit-schedule-modal').style.display = 'block';
        document.getElementById('edit-schedule-id').value = c.id;
        document.getElementById('edit-schedule-fecha').value = c.fecha;
        document.getElementById('edit-schedule-horario').value = c.horario;
        document.getElementById('edit-schedule-sala').value = c.sala;
        
        const sel = document.getElementById('edit-schedule-reemplazo');
        sel.innerHTML = '<option value="">-- Sin Reemplazo --</option>';
        
        const ps = await db.profesores.toArray();
        ps.forEach(p => {
            if(p.id !== c.profesorId) sel.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
        });
        
        if(c.reemplazoId) sel.value = c.reemplazoId;
    };

    // --- Helpers de Ingredientes Temporales ---
    window.removeTempIng = (id) => { 
        ingredientesTemporales = ingredientesTemporales.filter(i => i.id !== id); 
        renderTempIngredientes(); 
    };
    window.removeTempUtensilio = (id) => { 
        utensiliosTemporales = utensiliosTemporales.filter(u => u.id !== id); 
        renderTempUtensilios(); 
    };

    function renderTempIngredientes() {
        document.getElementById('ingredientes-container').innerHTML = ingredientesTemporales.map(i => 
            `<span style="background:#dee2e6; padding:4px 8px; border-radius:10px; margin:2px; display:inline-block; font-size:0.9em;">
                ${i.nombre} (${i.cantidad} ${i.unidad}) <b style="cursor:pointer; color:red;" onclick="removeTempIng(${i.id})">x</b>
            </span>`
        ).join('');
    }

    function renderTempUtensilios() {
        document.getElementById('utensilios-container').innerHTML = utensiliosTemporales.map(u => 
            `<span style="background:#ffdae9; padding:4px 8px; border-radius:10px; margin:2px; display:inline-block; font-size:0.9em;">
                ${u.nombre} (${u.cantidad}) <b style="cursor:pointer; color:red;" onclick="removeTempUtensilio(${u.id})">x</b>
            </span>`
        ).join('');
    }

    // --- Helpers de Formato ---
    function formatDate(dateStr) { const [y,m,d] = dateStr.split('-'); return `${d}/${m}/${y}`; }
    
    async function getWeekNumber(dateStr) {
        const semanas = await db.semanas.orderBy('fechaInicio').reverse().toArray();
        const target = new Date(dateStr);
        const found = semanas.find(s => new Date(s.fechaInicio) <= target);
        return found ? found.numero : null;
    }

    // ==========================================
    // 8. FUNCIONES DE IMPRESIÓN Y EXCEL
    // ==========================================

    window.imprimirOps = async () => {
        try {
            const semanaVal = document.getElementById('semana-filter').value;
            const diasChecks = [...document.querySelectorAll('#dias-filter-container input:checked')].map(cb => parseInt(cb.value));
            
            let q = db.horario;
            if(semanaVal !== 'TODAS') q = q.where('semana').equals(parseInt(semanaVal));
            let clases = await q.toArray();
            
            // Filtro por días
            if(diasChecks.length > 0) clases = clases.filter(c => diasChecks.includes(new Date(c.fecha + 'T12:00:00').getDay()));

            if(clases.length === 0) { alert('No hay clases visibles para imprimir.'); return; }

            const uniqueIds = [...new Set(clases.map(c => c.id))];
            const area = document.getElementById('print-area');
            area.innerHTML = '';

            const [profs, asigs, ops] = await Promise.all([db.profesores.toArray(), db.asignaturas.toArray(), db.ops.toArray()]);

            for(const id of uniqueIds) {
                const c = clases.find(x => x.id === id);
                const asig = asigs.find(a => a.id === c.asignaturaId);
                const prof = profs.find(p => p.id === c.profesorId);
                const op = ops.find(o => o.asignaturaId === c.asignaturaId && o.numeroClase === c.clase);

                if(!asig || !op) continue; 

                let infoProfesor = prof?.nombre;
                if(c.reemplazoId) {
                    const reemplazante = profs.find(p => p.id === c.reemplazoId)?.nombre;
                    infoProfesor = `${prof?.nombre} (Reemplazo: ${reemplazante})`;
                }

                let contenido = '';
                if(op.sinPedido) {
                    contenido = '<div style="padding:20px; text-align:center; border:1px solid #000; margin-top:20px;"><h3>CLASE TEÓRICA - SIN PEDIDO</h3></div>';
                } else {
                    // 1. Tabla Ingredientes (Ordenada alfabéticamente A-Z)
                    const ingredientesOrdenados = [...op.ingredientes].sort((a, b) => a.nombre.localeCompare(b.nombre));

                    const filasIng = ingredientesOrdenados.map(ing => `
                        <tr>
                            <td class="col-check"></td><td class="col-check"></td>
                            <td>${ing.nombre}</td>
                            <td style="text-align:center;">${ing.cantidad} ${ing.unidad}</td>
                        </tr>`).join('');
                    
                    const tablaIng = `
                        <table class="print-table">
                            <thead>
                                <tr>
                                    <th colspan="2" class="col-encargado-header">ENCARGADO</th>
                                    <th rowspan="2">Ingrediente</th>
                                    <th rowspan="2">Cantidad</th>
                                </tr>
                                <tr><th style="font-size:8pt">Armado</th><th style="font-size:8pt">Superv.</th></tr>
                            </thead>
                            <tbody>${filasIng}</tbody>
                        </table>`;

                    // 2. Tabla PAÑOL (Izquierda)
                    let filasPanol = (op.utensilios || []).map(u => `<tr><td>${u.nombre}</td><td style="text-align:center;">${u.cantidad}</td></tr>`).join('');
                    for(let i=0; i<5; i++) { filasPanol += '<tr><td style="height:20px;"></td><td></td></tr>'; } // Filas vacías relleno

                    const tablaPanolHTML = `
                        <table class="print-table" style="width: 100%;">
                            <thead><tr><th>Utensilio (Pañol)</th><th style="width:30px;">Cant.</th></tr></thead>
                            <tbody>${filasPanol}</tbody>
                        </table>`;

                    // 3. Tabla VAJILLA (Derecha - Fija para llenar a mano)
                    const filasVajilla = LISTA_VAJILLA.map(v => 
                        `<tr>
                            <td style="padding: 1px 4px;">${v}</td>
                            <td style="border: 1px solid #000; width: 30px;"></td>
                        </tr>`
                    ).join('');

                    const tablaVajillaHTML = `
                        <table class="print-table" style="width: 100%;">
                            <thead><tr><th>Vajilla y Montaje</th><th style="width:30px;">Cant.</th></tr></thead>
                            <tbody>${filasVajilla}</tbody>
                        </table>`;
                    
                    // 4. Bloque Inferior con dos columnas
                    const bloqueInferior = `
                        <div style="margin-top: 10px;">
                            <strong>PAÑOL, UTENSILIOS Y VAJILLA</strong> (Encargado: ${op.docentePanol || '______________'})
                            <div style="display: flex; gap: 10px; align-items: flex-start; margin-top: 5px;">
                                <div style="flex: 1;">${tablaPanolHTML}</div>
                                <div style="flex: 1;">${tablaVajillaHTML}</div>
                            </div>
                        </div>`;
                    
                    contenido = tablaIng + bloqueInferior;
                }

                const page = document.createElement('div');
                page.className = 'op-print-sheet';
                page.style.position = 'relative'; 

                page.innerHTML = `
                    <img src="inacap_logo.png" alt="Logo" style="position: absolute; top: 0; right: 0; max-height: 50px; width: auto;">

                    <div class="print-header" style="text-align: center; margin-top: 5px;">
                        <h2 style="margin: 0; text-transform: uppercase;">ORDEN DE PEDIDO - SEMANA ${c.semana}</h2>
                        <hr style="border: 1px solid #000; margin-top: 5px;">
                        
                        <div class="header-info" style="text-align: left; margin-top: 5px;">
                            <p><strong>Asignatura:</strong> ${asig.nombre}</p>
                            <p><strong>Clase N° ${c.clase}:</strong> ${op.nombreReceta}</p>
                            <hr style="border-top: 1px solid #ccc; margin: 5px 0;">
                            <p><strong>Profesor:</strong> ${infoProfesor} | <strong>Sala:</strong> ${c.sala}</p>
                            <p><strong>Fecha:</strong> ${formatDate(c.fecha)} | <strong>Horario:</strong> ${c.horario}</p>
                        </div>
                    </div>

                    ${contenido}

                    <div class="firmas-container" style="margin-top:20px;">
                        <div class="firma-block"><div class="firma-title">ENTREGA</div><div class="firma-box-row"><div class="firma-line">Firma Docente</div><div class="firma-line">Firma Pañol</div></div></div>
                        <div class="firma-block"><div class="firma-title">DEVOLUCIÓN</div><div class="firma-box-row"><div class="firma-line">Firma Docente</div><div class="firma-line">Firma Pañol</div></div></div>
                    </div>
                `;
                area.appendChild(page);
            }
            window.print();
        } catch (error) {
            console.error(error);
            alert("Error al imprimir: " + error.message);
        }
    };

    window.exportarExcelAsignatura = async (asigId) => {
        const asig = await db.asignaturas.get(asigId);
        const ops = await db.ops.where('asignaturaId').equals(asigId).toArray();
        ops.sort((a,b) => a.numeroClase - b.numeroClase);

        if(ops.length === 0) { alert('No hay OPs para esta asignatura.'); return; }

        const wb = XLSX.utils.book_new();
        
        ops.forEach(op => {
            const data = op.ingredientes.map(i => ({
                "Ingrediente": i.nombre,
                "Cantidad": parseFloat(i.cantidad),
                "Unidad": i.unidad
            }));
            
            if(op.utensilios && op.utensilios.length > 0) {
                data.push({}); 
                data.push({"Ingrediente": "--- UTENSILIOS ---"});
                op.utensilios.forEach(u => {
                    data.push({"Ingrediente": u.nombre, "Cantidad": parseFloat(u.cantidad), "Unidad": "Unid."});
                });
            }

            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, `Clase ${op.numeroClase}`);
        });

        XLSX.writeFile(wb, `OPs_${asig.nombre.replace(/\s+/g, '_')}.xlsx`);
    };

    // --- CONSOLIDADO ---
    async function renderConsolidadoWeekSelectors() {
        const semanas = await db.semanas.orderBy('numero').toArray();
        const start = document.getElementById('consolidado-semana-inicio');
        const end = document.getElementById('consolidado-semana-fin');
        start.innerHTML = ''; end.innerHTML = '';
        if(semanas.length === 0) { start.innerHTML = '<option>Sin datos</option>'; end.innerHTML = '<option>Sin datos</option>'; return; }
        semanas.forEach(s => {
            start.innerHTML += `<option value="${s.numero}">Semana ${s.numero}</option>`;
            end.innerHTML += `<option value="${s.numero}">Semana ${s.numero}</option>`;
        });
    }

    document.getElementById('generar-consolidado-btn').addEventListener('click', async () => {
        const semInicio = parseInt(document.getElementById('consolidado-semana-inicio').value);
        const semFin = parseInt(document.getElementById('consolidado-semana-fin').value);
        if(!semInicio || !semFin) return;

        const clases = await db.horario.where('semana').between(semInicio, semFin, true, true).toArray();
        const ops = await db.ops.toArray();
        const todosIngredientes = await db.ingredientes.toArray();
        const familiaMap = {};
        todosIngredientes.forEach(ing => { familiaMap[ing.nombre] = ing.familia || 'Sin Familia'; });

        let total = {}; let detalle = {};

        clases.forEach(c => {
            const op = ops.find(o => o.asignaturaId === c.asignaturaId && o.numeroClase === c.clase);
            if(op && !op.sinPedido) {
                op.ingredientes.forEach(ing => {
                    const familia = familiaMap[ing.nombre] || 'Sin Familia'; 
                    const key = ing.nombre + '|' + ing.unidad; 
                    if(!total[key]) total[key] = { familia: familia, nombre: ing.nombre, unidad: ing.unidad, cant: 0 };
                    total[key].cant += parseFloat(ing.cantidad);
                    
                    if(!detalle[c.semana]) detalle[c.semana] = {};
                    if(!detalle[c.semana][key]) detalle[c.semana][key] = { familia: familia, nombre: ing.nombre, unidad: ing.unidad, cant: 0 };
                    detalle[c.semana][key].cant += parseFloat(ing.cantidad);
                });
            }
        });

        datosConsolidadoGlobal = { total, detalle, range: `${semInicio}-${semFin}` };

        // Render HTML Total
        let htmlTotal = `<h3>Total Semanas ${semInicio}-${semFin}</h3><table class="consolidado-table"><thead><tr><th>Familia</th><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th></tr></thead><tbody>`;
        Object.values(total).sort((a,b) => a.familia.localeCompare(b.familia) || a.nombre.localeCompare(b.nombre))
            .forEach(item => { htmlTotal += `<tr><td>${item.familia}</td><td>${item.nombre}</td><td>${item.cant.toFixed(2)}</td><td>${item.unidad}</td></tr>`; });
        htmlTotal += '</tbody></table>';

        // Render HTML Detalle
        let htmlDetalle = '';
        Object.keys(detalle).sort((a,b)=>a-b).forEach(sem => {
            htmlDetalle += `<h4>Semana ${sem}</h4><table class="consolidado-table"><thead><tr><th>Familia</th><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th></tr></thead><tbody>`;
            Object.values(detalle[sem]).sort((a,b) => a.familia.localeCompare(b.familia) || a.nombre.localeCompare(b.nombre))
                .forEach(item => { htmlDetalle += `<tr><td>${item.familia}</td><td>${item.nombre}</td><td>${item.cant.toFixed(2)}</td><td>${item.unidad}</td></tr>`; });
            htmlDetalle += '</tbody></table>';
        });

        document.getElementById('consolidado-total').innerHTML = htmlTotal;
        document.getElementById('consolidado-detalle').innerHTML = htmlDetalle;
        document.getElementById('consolidado-resultado').style.display = 'block';
    });

    document.getElementById('exportar-excel-btn').addEventListener('click', () => {
        if(!datosConsolidadoGlobal.total) { alert("Primero genere el consolidado."); return; }
        const wb = XLSX.utils.book_new();
        
        // Hoja Total
        const dataTotal = [];
        Object.values(datosConsolidadoGlobal.total).sort((a,b) => a.familia.localeCompare(b.familia)).forEach(item => { 
            dataTotal.push({ "Familia": item.familia, "Ingrediente": item.nombre, "Cantidad Total": item.cant, "Unidad": item.unidad }); 
        });
        const wsTotal = XLSX.utils.json_to_sheet(dataTotal);
        XLSX.utils.book_append_sheet(wb, wsTotal, "Total Consolidado");

        // Hojas por Semana
        Object.keys(datosConsolidadoGlobal.detalle).sort((a,b)=>a-b).forEach(sem => {
            const dataSem = [];
            Object.values(datosConsolidadoGlobal.detalle[sem]).sort((a,b) => a.familia.localeCompare(b.familia)).forEach(item => { 
                dataSem.push({ "Familia": item.familia, "Ingrediente": item.nombre, "Cantidad": item.cant, "Unidad": item.unidad }); 
            });
            const wsSem = XLSX.utils.json_to_sheet(dataSem);
            XLSX.utils.book_append_sheet(wb, wsSem, `Semana ${sem}`);
        });
        XLSX.writeFile(wb, `Consolidado_Semanas_${datosConsolidadoGlobal.range}.xlsx`);
    });


    // ==========================================
    // 9. EVENT LISTENERS FORMULARIOS (GUARDAR DATOS)
    // ==========================================

    // A. Guardar Semana (Con manejo de error duplicado)
    semanaForm.addEventListener('submit', async e => { 
        e.preventDefault(); 
        try {
            await db.semanas.add({
                numero: parseInt(document.getElementById('semana-numero').value), 
                fechaInicio: document.getElementById('semana-fecha-inicio').value
            }); 
            renderSemanas(); 
            e.target.reset(); 
            alert('Semana agregada.');
        } catch (error) {
            if (error.name === 'ConstraintError') alert('Error: El número de semana ya existe.');
            else alert('Error al guardar semana.');
        }
    });

    // B. Guardar Profesor
    profesorForm.addEventListener('submit', async e => { 
        e.preventDefault(); 
        try {
            await db.profesores.add({ nombre: document.getElementById('profesor-nombre').value }); 
            renderProfesores(); 
            e.target.reset(); 
            alert('Profesor agregado.');
        } catch (error) { alert('Error al agregar profesor.'); }
    });

    // C. Guardar Asignatura
    asignaturaForm.addEventListener('submit', async e => { 
        e.preventDefault(); 
        try {
            await db.asignaturas.add({
                nombre: document.getElementById('asignatura-nombre').value, 
                totalClases: parseInt(document.getElementById('asignatura-clases').value)
            }); 
            renderAsignaturas(); 
            e.target.reset(); 
            alert('Asignatura agregada.');
        } catch (error) { alert('Error al agregar asignatura.'); }
    });

    // D. Guardar Bloqueo
    bloqueoForm.addEventListener('submit', async e => { 
        e.preventDefault(); 
        try {
            await db.bloqueos.add({
                fecha: document.getElementById('bloqueo-fecha').value, 
                horario: document.getElementById('bloqueo-horario').value
            }); 
            renderBloqueos(); 
            e.target.reset(); 
        } catch(error) { alert('Error al crear bloqueo.'); }
    });

    // E. Guardar Ingrediente BD
    ingredienteDbForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await db.ingredientes.add({
                nombre: document.getElementById('ingrediente-db-nombre').value, 
                familia: document.getElementById('ingrediente-familia').value, 
                unidadDefault: document.getElementById('ingrediente-unidad-default').value
            });
            renderIngredientesDB(); e.target.reset(); alert('Ingrediente agregado a la BD.');
        } catch(error) { alert('Error: El ingrediente ya existe en la BD.'); }
    });

    // F. Guardar OP
    // Helpers para actualizar selects de clases dinámicamente
    async function updateClassSelect() {
        const asigId = parseInt(this.value);
        const sel = document.getElementById('op-clase-numero');
        sel.innerHTML = '<option value="">-- Clase --</option>';
        if(!asigId) return;
        const asig = await db.asignaturas.get(asigId);
        for(let i=1; i<=asig.totalClases; i++) sel.innerHTML += `<option value="${i}">Clase ${i}</option>`;
    }
    
    // Listener para actualizar clases cuando cambia asignatura
    opAsignaturaSelect.addEventListener('change', updateClassSelect);
    
    // Manejo de checkboxes y lógica de OP
    document.getElementById('op-sin-pedido').addEventListener('change', function() {
        const details = document.getElementById('op-details-section');
        const inputNombre = document.getElementById('op-nombre-receta');
        
        if (this.checked) {
            // Si es teórica (sin pedido): Ocultamos y quitamos el 'required'
            details.style.display = 'none';
            inputNombre.removeAttribute('required');
        } else {
            // Si es clase normal: Mostramos y volvemos a poner 'required'
            details.style.display = 'block';
            inputNombre.setAttribute('required', 'true');
        }
    });

    opForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('op-edit-id').value;
        const sinPedido = document.getElementById('op-sin-pedido').checked;
        const data = {
            asignaturaId: parseInt(document.getElementById('op-asignatura').value),
            numeroClase: parseInt(document.getElementById('op-clase-numero').value),
            sinPedido: sinPedido,
            nombreReceta: sinPedido ? 'Clase Teórica' : document.getElementById('op-nombre-receta').value,
            docentePanol: sinPedido ? '' : document.getElementById('op-docente-panol').value,
            ingredientes: sinPedido ? [] : ingredientesTemporales,
            utensilios: sinPedido ? [] : utensiliosTemporales
        };
        try {
            if(editId) { 
                await db.ops.update(parseInt(editId), data); 
                alert('OP Actualizada');
            } else {
                const existe = await db.ops.where({asignaturaId: data.asignaturaId, numeroClase: data.numeroClase}).first();
                if(existe) { alert('Ya existe una OP para esta clase. Edítela desde "Ver OPs".'); return; }
                await db.ops.add(data);
                alert('OP Creada');
            }
            opForm.reset();
            ingredientesTemporales = []; utensiliosTemporales = [];
            renderTempIngredientes(); renderTempUtensilios();
            document.getElementById('op-edit-id').value = '';
            document.getElementById('op-form-submit-btn').textContent = 'Guardar OP Completa';
            document.getElementById('op-details-section').style.display = 'block';
            renderGroupedOPs();
        } catch (error) { alert("Error: " + error.message); }
    });

    // G. Agregar Ingredientes a Lista Temporal
    document.getElementById('add-ingrediente-btn').addEventListener('click', () => {
        const nombre = document.getElementById('ingrediente-nombre-input').value;
        const cant = document.getElementById('ingrediente-cantidad').value;
        const unidad = document.getElementById('ingrediente-unidad').value;
        if(nombre && cant) {
            const yaExiste = ingredientesTemporales.some(ing => ing.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
            if(yaExiste) { alert(`⚠️ "${nombre}" ya está en la lista.`); return; }
            ingredientesTemporales.push({id: Date.now(), nombre: nombre.trim(), cantidad: cant, unidad});
            renderTempIngredientes();
            document.getElementById('ingrediente-nombre-input').value = '';
            document.getElementById('ingrediente-cantidad').value = '';
            document.getElementById('ingrediente-unidad').disabled = false;
        }
    });

    // Autocompletado de Unidad si existe en BD
    const ingInput = document.getElementById('ingrediente-nombre-input');
    if(ingInput) {
        ingInput.addEventListener('input', async function(e) {
            const val = this.value;
            const ingDB = await db.ingredientes.where('nombre').equals(val).first();
            const unidadSelect = document.getElementById('ingrediente-unidad');
            if (ingDB && ingDB.unidadDefault && ingDB.unidadDefault !== 'LIBRE') {
                unidadSelect.value = ingDB.unidadDefault; unidadSelect.disabled = true; 
            } else { unidadSelect.disabled = false; }
        });
    }

    // H. Utensilios Temporales
    document.getElementById('add-utensilio-btn').addEventListener('click', () => {
        const nombre = document.getElementById('utensilio-nombre').value;
        const cant = document.getElementById('utensilio-cantidad').value;
        if(nombre && cant) {
            utensiliosTemporales.push({id: Date.now() + 1, nombre, cantidad: cant});
            renderTempUtensilios();
            document.getElementById('utensilio-nombre').value = '';
            document.getElementById('utensilio-cantidad').value = '';
        }
    });

    // I. Programar Clase (Schedule)
    // Listener para actualizar clases en formulario de horario
    document.getElementById('schedule-asignatura').addEventListener('change', async function() {
        const asigId = parseInt(this.value);
        const sel = document.getElementById('schedule-clase');
        sel.innerHTML = '<option value="">-- Clase --</option>';
        if(!asigId) return;
        const asig = await db.asignaturas.get(asigId);
        for(let i=1; i<=asig.totalClases; i++) sel.innerHTML += `<option value="${i}">Clase ${i}</option>`;
    });

    scheduleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const asigId = parseInt(document.getElementById('schedule-asignatura').value);
        const claseInicio = parseInt(document.getElementById('schedule-clase').value);
        const fechaInicio = document.getElementById('schedule-fecha').value;
        const sala = document.getElementById('schedule-sala').value;
        const horario = document.getElementById('schedule-horario').value;
        const profId = parseInt(document.getElementById('schedule-profesor').value);
        const recurring = document.getElementById('schedule-recurring').checked;

        // Validar conflicto inmediato
        const ocupado = await db.horario.where({fecha: fechaInicio, sala: sala, horario: horario}).first();
        if(ocupado) { alert(`⚠️ CONFLICTO: La sala ${sala} ya está ocupada el ${fechaInicio}.`); return; }

        if(!recurring) {
            const semana = await getWeekNumber(fechaInicio);
            if(!semana) { alert('Fecha fuera de rango de semanas configuradas.'); return; }
            await db.horario.add({profesorId: profId, asignaturaId: asigId, clase: claseInicio, sala, fecha: fechaInicio, horario, semana});
            alert('Clase agendada.');
        } else {
            // Lógica recurrente
            const asignatura = await db.asignaturas.get(asigId);
            let clasesAgendadas = 0; let currentClass = claseInicio;
            let currentDate = new Date(fechaInicio + 'T12:00:00');
            let safety = 0; const bloqueos = await db.bloqueos.toArray();
            
            while(currentClass <= asignatura.totalClases && safety < 50) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const isBlocked = bloqueos.some(b => b.fecha === dateStr && (b.horario === 'TODO_EL_DIA' || b.horario === horario));
                const semana = await getWeekNumber(dateStr);
                
                if(!isBlocked && semana) {
                    const salaOcupada = await db.horario.where({fecha: dateStr, sala: sala, horario: horario}).first();
                    if(!salaOcupada) {
                        await db.horario.add({profesorId: profId, asignaturaId: asigId, clase: currentClass, sala, fecha: dateStr, horario, semana});
                        clasesAgendadas++; currentClass++; 
                    }
                }
                currentDate.setDate(currentDate.getDate() + 7); safety++;
            }
            alert(`Finalizado. ${clasesAgendadas} clases correlativas agendadas.`);
        }
        renderHorario(); renderCalendar(); renderGestionDocente();
    });

    // J. Editar Programación
    editScheduleForm.addEventListener('submit', async(e)=>{
        e.preventDefault(); 
        const id=parseInt(document.getElementById('edit-schedule-id').value); 
        const f=document.getElementById('edit-schedule-fecha').value; 
        const h=document.getElementById('edit-schedule-horario').value; 
        const s=document.getElementById('edit-schedule-sala').value; 
        const r=document.getElementById('edit-schedule-reemplazo').value; 
        const sem=await getWeekNumber(f); 
        if(!sem){alert('La nueva fecha no corresponde a ninguna semana configurada.');return;} 
        
        await db.horario.update(id,{fecha:f,horario:h,sala:s,semana:sem,reemplazoId:r?parseInt(r):null}); 
        document.getElementById('edit-schedule-modal').style.display='none'; 
        renderHorario(); renderCalendar(); renderGestionDocente(); 
        alert('Clase actualizada');
    });

    document.querySelectorAll('.close-btn').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.modal).style.display='none');

    // ==========================================
    // 10. VERIFICACIÓN DE CARGA (DEBUG)
    // ==========================================
    setTimeout(() => {
        console.log("Verificando IDs HTML...");
        if(!document.getElementById('lista-semanas')) console.error("❌ FALTANTE: lista-semanas");
        if(!document.getElementById('lista-profesores')) console.error("❌ FALTANTE: lista-profesores");
        if(!document.getElementById('lista-asignaturas')) console.error("❌ FALTANTE: lista-asignaturas");
        else console.log("✅ Sistema cargado correctamente.");
    }, 1000);

    // INICIALIZACIÓN FINAL
    renderAll();
});