const API_URL = '/api';

let currentUser = JSON.parse(localStorage.getItem('pawtrack_user')) || null;
let selectedDogId = null;
let selectedDogName = 'Mascota';
let map = null;
let marker = null;
let infoWindow = null;
let leafletMap = null;
let leafletMarker = null;
let mapReady = false;
let pendingLocation = null;
let trackingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        showDashboard();
    }
});

function switchTab(tab) {
    document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
    document.getElementById('form-register').classList.toggle('hidden', tab === 'login');
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

async function parseJsonSafe(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return { success: false, message: text || `Error HTTP ${res.status}` };
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const correo = document.getElementById('login-correo').value.trim();
    const contraseña = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo, contraseña, contrasena: contraseña })
        });
        const data = await parseJsonSafe(res);

        if (res.ok && data.success) {
            currentUser = data.usuario;
            localStorage.setItem('pawtrack_user', JSON.stringify(currentUser));
            showDashboard();
        } else {
            alert(data.message || 'Credenciales incorrectas');
        }
    } catch (err) {
        console.error('Error en handleLogin:', err);
        alert('Error de conexión con el servidor');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const nombre = document.getElementById('reg-nombre').value.trim();
    const correo = document.getElementById('reg-correo').value.trim();
    const contraseña = document.getElementById('reg-password').value;

    try {
        const res = await fetch(`${API_URL}/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, correo, contraseña, contrasena: contraseña })
        });
        const data = await parseJsonSafe(res);

        if (res.ok && data.success) {
            alert('Cuenta creada. Ahora puedes iniciar sesión.');
            document.getElementById('login-correo').value = correo;
            switchTab('login');
        } else {
            alert(data.message || 'No se pudo completar el registro');
        }
    } catch (err) {
        console.error('Error en handleRegister:', err);
        alert('Error al conectar con el servidor');
    }
}

function showDashboard() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    document.getElementById('user-display-name').innerText = `👤 ${currentUser.nombre}`;
    initMap();
    loadDogs();
}

function logout() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    localStorage.removeItem('pawtrack_user');
    window.location.reload();
}

function initLeafletFallback(mapElement, centroInicial) {
    if (typeof L === 'undefined') return;
    if (!leafletMap) {
        leafletMap = L.map(mapElement).setView([centroInicial.lat, centroInicial.lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(leafletMap);
    } else {
        setTimeout(() => leafletMap.invalidateSize(), 150);
    }
    mapReady = true;
    if (pendingLocation) {
        updateGoogleMarker(pendingLocation.lat, pendingLocation.lon, pendingLocation.dogName);
    }
}

// Callback global requerido por Google Maps JavaScript API
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    const centroInicial = { lat: 17.7547, lng: -92.5658 };

    if (typeof google === 'undefined' || !google.maps) {
        initLeafletFallback(mapElement, centroInicial);
        return;
    }

    if (map) {
        mapReady = true;
        if (pendingLocation) {
            updateGoogleMarker(pendingLocation.lat, pendingLocation.lon, pendingLocation.dogName);
        }
        return;
    }

    map = new google.maps.Map(mapElement, {
        center: centroInicial,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [
            { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] }
        ]
    });

    infoWindow = new google.maps.InfoWindow();
    mapReady = true;

    if (pendingLocation) {
        updateGoogleMarker(pendingLocation.lat, pendingLocation.lon, pendingLocation.dogName);
    }
}

function updateGoogleMarker(lat, lon, dogName) {
    pendingLocation = { lat, lon, dogName };
    if (!mapReady) return;

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) return;

    if (map && typeof google !== 'undefined' && google.maps) {
        const posicion = { lat: latNum, lng: lonNum };
        if (marker) {
            marker.setPosition(posicion);
            marker.setTitle(`Ubicación de ${dogName}`);
        } else {
            marker = new google.maps.Marker({
                position: posicion,
                map: map,
                title: `Ubicación de ${dogName}`
            });

            marker.addListener('click', () => {
                infoWindow.setContent(`<strong>🐾 Ubicación de ${selectedDogName}</strong>`);
                infoWindow.open(map, marker);
            });
        }
        map.panTo(posicion);
        return;
    }

    if (leafletMap && typeof L !== 'undefined') {
        if (!leafletMarker) {
            leafletMarker = L.marker([latNum, lonNum]).addTo(leafletMap).bindPopup(`🐾 ${dogName}`);
        } else {
            leafletMarker.setLatLng([latNum, lonNum]).setPopupContent(`🐾 ${dogName}`);
        }
        leafletMap.setView([latNum, lonNum], 15);
    }
}

// Cargar Tabla de Mascotas
async function loadDogs() {
    try {
        const res = await fetch(`${API_URL}/perros/${currentUser.id}`);
        const dogs = await parseJsonSafe(res);
        const tbody = document.getElementById('dogs-table-body');
        tbody.innerHTML = '';

        if (!Array.isArray(dogs) || dogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay mascotas registradas.</td></tr>';
            return;
        }

        dogs.forEach((dog, idx) => {
            if (idx === 0 && !selectedDogId) {
                selectedDogId = dog.id;
                selectedDogName = dog.nombre;
            }

            const tr = document.createElement('tr');
            if (dog.id === selectedDogId) tr.classList.add('selected-row');

            tr.innerHTML = `
                <td>#${dog.id}</td>
                <td><strong>${dog.nombre}</strong></td>
                <td>${dog.raza || '-'}</td>
                <td>${dog.edad ? dog.edad + ' años' : '-'}</td>
                <td>${dog.peso ? dog.peso + ' kg' : '-'}</td>
                <td><button class="btn-rastrear" type="button" onclick="selectDog(${dog.id}, '${dog.nombre.replace(/'/g, "\\'")}')">Rastrear</button></td>
            `;
            tbody.appendChild(tr);
        });

        const activeDog = dogs.find(d => d.id === selectedDogId) || dogs[0];
        if (activeDog) selectDog(activeDog.id, activeDog.nombre, false);
    } catch (err) {
        console.error('Error en loadDogs:', err);
    }
}

// Seleccionar perro y activar rastreo en tiempo real
function selectDog(dogId, dogName, reloadTable = true) {
    selectedDogId = dogId;
    selectedDogName = dogName;
    document.getElementById('telemetry-title').innerText = `📡 Telemetría y Ubicación en Vivo (${dogName})`;
    if (reloadTable) loadDogs();

    if (trackingInterval) clearInterval(trackingInterval);

    fetchDogLiveData(dogId, dogName);

    trackingInterval = setInterval(() => {
        fetchDogLiveData(dogId, dogName);
    }, 5000);
}

// Función que consulta los datos y actualiza el mapa y la tabla constantemente
async function fetchDogLiveData(dogId, dogName) {
    try {
        const dispRes = await fetch(`${API_URL}/dispositivo/${dogId}`);
        const disp = await parseJsonSafe(dispRes);
        const recordsBody = document.getElementById('records-table-body');

        if (!disp || !disp.id) {
            document.getElementById('val-temp').innerText = 'Sin GPS';
            document.getElementById('val-pulso').innerText = '--';
            document.getElementById('val-actividad').innerText = 'Sin collar';
            document.getElementById('val-bateria').innerText = '--';
            document.getElementById('coords-display').innerText = 'Lat: 0.0000 | Lon: 0.0000';
            recordsBody.innerHTML = '<tr><td colspan="4" class="text-center">Perro sin collar vinculado</td></tr>';
            loadAlerts(dogId);
            return;
        }

        // Cargar Historial de Mediciones
        const medRes = await fetch(`${API_URL}/historial-mediciones/${disp.id}`);
        const mediciones = await parseJsonSafe(medRes);
        recordsBody.innerHTML = '';

        if (Array.isArray(mediciones) && mediciones.length > 0) {
            const ultima = mediciones[0];
            document.getElementById('val-temp').innerText = ultima.temperatura !== null ? `${ultima.temperatura} °C` : '--';
            document.getElementById('val-pulso').innerText = ultima.pulso !== null ? `${ultima.pulso} BPM` : '--';
            document.getElementById('val-actividad').innerText = ultima.actividad || 'Normal';
            document.getElementById('val-bateria').innerText = `${disp.bateria ?? 100}%`;

            mediciones.forEach(reg => {
                const tr = document.createElement('tr');
                const fecha = reg.fecha_hora ? new Date(reg.fecha_hora).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-';
                tr.innerHTML = `
                    <td>${fecha}</td>
                    <td>${reg.temperatura ?? '--'} °C</td>
                    <td>${reg.pulso ?? '--'} BPM</td>
                    <td>${reg.actividad || 'Normal'}</td>
                `;
                recordsBody.appendChild(tr);
            });
        } else {
            document.getElementById('val-temp').innerText = '--';
            document.getElementById('val-pulso').innerText = '--';
            document.getElementById('val-actividad').innerText = 'Sin datos';
            document.getElementById('val-bateria').innerText = `${disp.bateria ?? 100}%`;
            recordsBody.innerHTML = '<tr><td colspan="4" class="text-center">Sin mediciones registradas aún</td></tr>';
        }

        // Cargar Ubicación GPS en Vivo
        const ubRes = await fetch(`${API_URL}/ubicacion/${disp.id}`);
        const ub = await parseJsonSafe(ubRes);

        if (ub && ub.latitud !== undefined && ub.longitud !== undefined && ub.latitud !== null && ub.longitud !== null) {
            const lat = parseFloat(ub.latitud);
            const lon = parseFloat(ub.longitud);
            if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
                document.getElementById('coords-display').innerText = `Lat: ${lat.toFixed(4)} | Lon: ${lon.toFixed(4)}`;
                updateGoogleMarker(lat, lon, dogName);
            }
        }

        loadAlerts(dogId);
    } catch (err) {
        console.error('Error actualizando telemetría:', err);
    }
}

async function loadAlerts(dogId) {
    try {
        const res = await fetch(`${API_URL}/alertas/${dogId}`);
        const alertas = await parseJsonSafe(res);
        const container = document.getElementById('alerts-list');
        container.innerHTML = '';

        if (!Array.isArray(alertas) || alertas.length === 0) {
            container.innerHTML = '<p class="muted-text">✅ No hay alertas activas para esta mascota.</p>';
            return;
        }

        alertas.forEach(a => {
            const div = document.createElement('div');
            div.style.padding = '8px';
            div.style.marginBottom = '8px';
            div.style.background = 'rgba(239, 68, 68, 0.15)';
            div.style.borderLeft = '3px solid #ef4444';
            div.style.borderRadius = '6px';
            div.innerHTML = `<strong>⚠️ ${a.tipo}:</strong> ${a.descripcion}`;
            container.appendChild(div);
        });
    } catch (err) {
        console.error('Error en loadAlerts:', err);
    }
}

function openAddDogModal() {
    document.getElementById('form-add-dog').reset();
    document.getElementById('dog-modal').classList.remove('hidden');
}

function closeAddDogModal() {
    document.getElementById('dog-modal').classList.add('hidden');
}

async function handleCreateDog(e) {
    e.preventDefault();
    const nombre = document.getElementById('dog-nombre').value.trim();
    const raza = document.getElementById('dog-raza').value.trim() || 'Mestizo';
    const edadRaw = document.getElementById('dog-edad').value;
    const pesoRaw = document.getElementById('dog-peso').value;
    const codigo_dispositivo = document.getElementById('dog-codigo').value.trim();

    if (!nombre) return;

    const edad = edadRaw !== '' ? parseInt(edadRaw, 10) : null;
    const peso = pesoRaw !== '' ? parseFloat(pesoRaw) : null;

    try {
        const res = await fetch(`${API_URL}/perros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id: currentUser.id,
                nombre,
                raza,
                edad,
                peso,
                codigo_dispositivo
            })
        });
        const data = await parseJsonSafe(res);

        if (res.ok && data.success) {
            closeAddDogModal();
            selectedDogId = data.perro.id;
            selectedDogName = data.perro.nombre;
            loadDogs();
        } else {
            alert(data.message || 'No se pudo registrar la mascota');
        }
    } catch (err) {
        console.error('Error en handleCreateDog:', err);
        alert('Error al conectar con el servidor');
    }
}