// SOS Dashboard - Sensor Observation Service
let map;
let sensorLayer;
let selectedSensorId = null;
let sensorList = [];
let popup;

// Initialize the map
function initMap() {
    map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM({
                    attributions: []
                })
            })
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([0, 0]),
            zoom: 2
        })
    });
    
    // Initialize sensor layer
    const vectorSource = new ol.source.Vector();
    sensorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: function(feature) {
            const isSelected = feature.get('id') === selectedSensorId;
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: isSelected ? 10 : 8,
                    fill: new ol.style.Fill({
                        color: isSelected ? '#28a745' : '#dc3545'
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'white',
                        width: 2
                    })
                })
            });
        }
    });
    map.addLayer(sensorLayer);
    
    // Initialize popup
    popup = new ol.Overlay({
        element: document.createElement('div'),
        positioning: 'bottom-center',
        stopEvent: false
    });
    popup.getElement().className = 'popup-content';
    map.addOverlay(popup);
    
    // Add click handler for sensor points
    map.on('click', function(evt) {
        const feature = map.forEachFeatureAtPixel(evt.pixel, function(f) {
            return f;
        });
        
        if (feature) {
            selectedSensorId = feature.get('id');
            sensorLayer.getSource().changed(); // Trigger style refresh
            
            // Update dropdown to match selected sensor
            document.getElementById('sensor-dropdown').value = selectedSensorId;
            
            // Show popup
            popup.getElement().innerHTML = feature.get('popupContent');
            popup.setPosition(evt.coordinate);
            
            // Find the sensor in our list to update time fields
            const sensor = sensorList.find(s => s.id === selectedSensorId);
            if (sensor) {
                const timeData = parseTimeInterval(sensor.timeInterval);
                document.getElementById('start-date').value = timeData.startDate;
                document.getElementById('start-time').value = timeData.startTime;
                document.getElementById('end-date').value = timeData.endDate;
                document.getElementById('end-time').value = timeData.endTime;
            }
        }
    });
    
    // Hide popup when clicking elsewhere
    map.on('pointermove', function(evt) {
        if (!map.forEachFeatureAtPixel(evt.pixel, function(f) { return f; })) {
            popup.getElement().style.display = 'none';
        } else {
            popup.getElement().style.display = 'block';
        }
    });
}

// Parse time interval string into date and time components
function parseTimeInterval(intervalString) {
    if (!intervalString || typeof intervalString !== 'string' || intervalString.trim() === '') {
        return { startDate: '', startTime: '00:00', endDate: '', endTime: '23:59' };
    }
    
    try {
        const [start, end] = intervalString.split(' ');
        const startDate = new Date(start);
        const endDate = new Date(end);
        
        if (isNaN(startDate.getTime())) {
            // Handle IST time format (2023-06-03T20:00:00+0530)
            const istStart = new Date(start.replace(/(\d{2})(\d{2})$/, "$1:$2"));
            const istEnd = new Date(end.replace(/(\d{2})(\d{2})$/, "$1:$2"));
            
            return {
                startDate: istStart.toISOString().split('T')[0],
                startTime: istStart.toTimeString().substring(0, 8),
                endDate: istEnd.toISOString().split('T')[0],
                endTime: istEnd.toTimeString().substring(0, 8)
            };
        }
        
        return {
            startDate: startDate.toISOString().split('T')[0],
            startTime: startDate.toTimeString().substring(0, 8),
            endDate: endDate.toISOString().split('T')[0],
            endTime: endDate.toTimeString().substring(0, 8)
        };
    } catch (e) {
        console.error("Error parsing time interval:", e);
        return { startDate: '', startTime: '00:00', endDate: '', endTime: '23:59' };
    }
}

// Get Capabilities request
function getCapabilities() {
    const server = document.getElementById('server-url').value || document.getElementById('server-url').placeholder;
    const url = `${server}/istsos/vipul?service=SOS&request=GetCapabilities`;
    
    const sensorDropdown = document.getElementById('sensor-dropdown');
    sensorDropdown.innerHTML = '<option value="" selected disabled>Loading sensors...</option>';
    
    sensorLayer.getSource().clear();
    sensorList = [];
    
    // Show loading state
    const btn = document.getElementById('get-capabilities');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="loading-spinner"></span> Loading...`;
    btn.disabled = true;
    
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.text();
        })
        .then(text => {
            document.getElementById('xml-response').textContent = vkbeautify.xml(text, 4);
            parseCapabilities(text);
            
            // Restore button
            btn.innerHTML = originalText;
            btn.disabled = false;
        })
        .catch(error => {
            document.getElementById('xml-response').textContent = `Error: ${error.message}`;
            sensorDropdown.innerHTML = '<option value="" selected disabled>Error loading sensors</option>';
            
            // Restore button
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

// Parse SOS GetCapabilities response
function parseCapabilities(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const procedures = xmlDoc.getElementsByTagName("sos:procedure");
    Array.from(procedures).forEach(procedure => {
        const procedureId = procedure.getAttribute("xlink:href");
        if (procedureId) {
            sensorList.push({
                id: procedureId,
                name: procedureId.split(":").pop(),
                description: "",
                coordinates: null,
                observedProperty: "",
                timeInterval: "",
                sensorType: ""
            });
        }
    });
    
    fetchSensorDetails();
}

// Fetch details for all sensors
function fetchSensorDetails() {
    const server = document.getElementById('server-url').value || document.getElementById('server-url').placeholder;
    const vectorSource = sensorLayer.getSource();
    let bbox = [Infinity, Infinity, -Infinity, -Infinity];
    let currentIndex = 0;
    
    function processNextSensor() {
        if (currentIndex >= sensorList.length) {
            updateSensorDropdown();
            
            if (bbox[0] !== Infinity) {
                document.getElementById('min-lon').value = bbox[0].toFixed(4);
                document.getElementById('max-lon').value = bbox[2].toFixed(4);
                document.getElementById('min-lat').value = bbox[1].toFixed(4);
                document.getElementById('max-lat').value = bbox[3].toFixed(4);
                
                // Fit map to all sensors
                map.getView().fit(ol.proj.transformExtent(bbox, 'EPSG:4326', 'EPSG:3857'), {
                    padding: [50, 50, 50, 50],
                    duration: 1000
                });
            }
            return;
        }
        
        const currentSensor = sensorList[currentIndex];
        const url = `${server}/istsos/vipul?service=SOS&version=1.0.0&request=DescribeSensor` +
                    `&procedure=${currentSensor.id}` +
                    `&outputFormat=text/xml;subtype="sensorML/1.0.1"`;
        
        fetch(url)
            .then(response => response.ok ? response.text() : Promise.reject(`HTTP error! Status: ${response.status}`))
            .then(text => {
                const xmlDoc = new DOMParser().parseFromString(text, "text/xml");
                
                currentSensor.description = xmlDoc.getElementsByTagName("gml:description")[0]?.textContent || "No description available";
                
                const coordsText = xmlDoc.getElementsByTagName("gml:coordinates")[0]?.textContent;
                if (coordsText) {
                    const [lon, lat] = coordsText.split(",").map(parseFloat);
                    currentSensor.coordinates = [lon, lat];
                    
                    // Update BBOX
                    bbox[0] = Math.min(bbox[0], lon);
                    bbox[1] = Math.min(bbox[1], lat);
                    bbox[2] = Math.max(bbox[2], lon);
                    bbox[3] = Math.max(bbox[3], lat);
                    
                    currentSensor.observedProperty = xmlDoc.getElementsByTagName("swe:Quantity")[0]?.getAttribute("definition") || "Unknown";
                    currentSensor.timeInterval = xmlDoc.getElementsByTagName("swe:interval")[0]?.textContent.trim() || "N/A";
                    
                    Array.from(xmlDoc.getElementsByTagName("sml:classifier")).some(c => {
                        if (c.getAttribute("name") === "Sensor Type") {
                            currentSensor.sensorType = c.getElementsByTagName("sml:value")[0]?.textContent || "Unknown";
                            return true;
                        }
                        return false;
                    });
                    
                    // Add feature to map
                    const feature = new ol.Feature({
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
                        id: currentSensor.id,
                        popupContent: createPopupContent(currentSensor)
                    });
                    vectorSource.addFeature(feature);
                }
                
                currentIndex++;
                processNextSensor();
            })
            .catch(error => {
                console.error(`Error fetching ${currentSensor.id}:`, error);
                currentSensor.description = "Error loading details";
                currentIndex++;
                processNextSensor();
            });
    }
    
    processNextSensor();
}

// Create popup content for a sensor
function createPopupContent(sensor) {
    return `
        <div class="popup-title">${sensor.name}</div>
        <div class="popup-row">
            <span class="popup-label">Description:</span> ${sensor.description}
        </div>
        <div class="popup-row">
            <span class="popup-label">Measures:</span> ${sensor.observedProperty.split(':').pop()}
        </div>
        <div class="popup-row">
            <span class="popup-label">Type:</span> ${sensor.sensorType}
        </div>
        <div class="popup-row">
            <span class="popup-label">Time Interval:</span> ${sensor.timeInterval}
        </div>
        <div class="popup-row">
            <span class="popup-label">Location:</span> ${sensor.coordinates[1].toFixed(4)}°N, ${sensor.coordinates[0].toFixed(4)}°E
        </div>
    `;
}

// Update sensor dropdown
function updateSensorDropdown() {
    const sensorDropdown = document.getElementById('sensor-dropdown');
    sensorDropdown.innerHTML = '<option value="" selected disabled>Select a sensor</option>';

    sensorList.forEach(sensor => {
        const option = document.createElement('option');
        option.value = sensor.id;
        option.textContent = `${sensor.name} - ${sensor.description.substring(0, 30)}${sensor.description.length > 30 ? '...' : ''}`;
        sensorDropdown.appendChild(option);
    });

    sensorDropdown.addEventListener('change', function() {
        const selectedId = this.value;
        if (!selectedId) return;
        
        selectedSensorId = selectedId;
        sensorLayer.getSource().changed();
        
        const selectedSensor = sensorList.find(sensor => sensor.id === selectedId);
        if (selectedSensor) {
            // Center map on selected sensor
            const coords = ol.proj.fromLonLat(selectedSensor.coordinates);
            map.getView().animate({
                center: coords,
                zoom: 10,
                duration: 500
            });
            
            // Update time fields
            const timeData = parseTimeInterval(selectedSensor.timeInterval);
            document.getElementById('start-date').value = timeData.startDate;
            document.getElementById('start-time').value = timeData.startTime;
            document.getElementById('end-date').value = timeData.endDate;
            document.getElementById('end-time').value = timeData.endTime;
        }
    });
}

// Filter sensors by BBOX
function filterSensors() {
    const minLon = parseFloat(document.getElementById('min-lon').value);
    const minLat = parseFloat(document.getElementById('min-lat').value);
    const maxLon = parseFloat(document.getElementById('max-lon').value);
    const maxLat = parseFloat(document.getElementById('max-lat').value);
    
    if (isNaN(minLon) || isNaN(minLat) || isNaN(maxLon) || isNaN(maxLat)) {
        alert("Please enter valid bounding box coordinates");
        return;
    }
    
    const vectorSource = sensorLayer.getSource();
    vectorSource.clear();
    
    const filteredSensors = [];
    const sensorDropdown = document.getElementById('sensor-dropdown');
    sensorDropdown.innerHTML = '<option value="" selected disabled>Select a sensor</option>';
    
    sensorList.forEach(sensor => {
        if (sensor.coordinates && 
            sensor.coordinates[0] >= minLon && 
            sensor.coordinates[0] <= maxLon && 
            sensor.coordinates[1] >= minLat && 
            sensor.coordinates[1] <= maxLat) {
            
            filteredSensors.push(sensor);
            
            const feature = new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat(sensor.coordinates)),
                id: sensor.id,
                popupContent: createPopupContent(sensor)
            });
            vectorSource.addFeature(feature);
            
            const option = document.createElement('option');
            option.value = sensor.id;
            option.textContent = `${sensor.name} - ${sensor.description.substring(0, 30)}${sensor.description.length > 30 ? '...' : ''}`;
            sensorDropdown.appendChild(option);
        }
    });
    
    if (filteredSensors.length === 0) {
        alert("No sensors found within the specified bounding box");
    } else {
        // Fit map to filtered sensors
        const bbox = [
            minLon, minLat,
            maxLon, maxLat
        ];
        map.getView().fit(ol.proj.transformExtent(bbox, 'EPSG:4326', 'EPSG:3857'), {
            padding: [50, 50, 50, 50],
            duration: 1000
        });
    }
}

// Get observations for selected sensor
function getObservations() {
    const server = document.getElementById('server-url').value || document.getElementById('server-url').placeholder;
    const selectedSensorId = document.getElementById('sensor-dropdown').value;
    
    if (!selectedSensorId) {
        alert("Please select a sensor first");
        return;
    }

    const startDate = document.getElementById('start-date').value;
    const startTime = document.getElementById('start-time').value;
    const endDate = document.getElementById('end-date').value;
    const endTime = document.getElementById('end-time').value;

    if (!startDate || !startTime || !endDate || !endTime) {
        alert("Please specify a valid time range");
        return;
    }

    // Convert local time to UTC by subtracting 5:30 hours (for IST to UTC)
    const adjustToUTC = (dateStr, timeStr) => {
        const localDate = new Date(`${dateStr}T${timeStr}`);
        const utcDate = new Date(localDate.getTime() - (5.5 * 60 * 60 ));
        return utcDate.toISOString().replace('.000Z', 'Z');
    };

    const startDateTime = adjustToUTC(startDate, startTime);
    const endDateTime = adjustToUTC(endDate, endTime);
    
    const selectedSensor = sensorList.find(sensor => sensor.id === selectedSensorId);
    if (!selectedSensor) return;

    // Extract just the procedure name (after last colon)
    const procedureName = selectedSensor.id.split(':').pop();
    
    const url = `${server}/istsos/vipul?request=GetObservation` +
                `&service=SOS&version=1.0.0` +
                `&offering=temporary` +
                `&procedure=${procedureName}` +
                `&eventTime=${startDateTime}/${endDateTime}` +
                `&observedProperty=${selectedSensor.observedProperty}` +
                `&responseFormat=text/xml`;
    
    // Show loading state
    const btn = document.getElementById('get-observations');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="loading-spinner"></span> Loading...`;
    btn.disabled = true;
    
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.text();
        })
        .then(text => {
            document.getElementById('xml-response').textContent = vkbeautify.xml(text, 4);
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");

            const valuesNode = xmlDoc.getElementsByTagName("swe:values")[0];
            if (!valuesNode) {
                throw new Error("No sensor data found in response");
            }

            const valuesText = valuesNode.textContent.trim();
            const readings = parseSensorReadings(valuesText);
            displayResults(readings, selectedSensor);
            
            // Restore button
            btn.innerHTML = originalText;
            btn.disabled = false;
        })
        .catch(error => {
            console.error("Error fetching sensor observations:", error);
            document.getElementById('data-table').innerHTML = 
                `<div class="alert alert-danger">Error loading sensor data: ${error.message}</div>`;
            
            // Restore button
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

// Parse sensor readings from response (with timezone adjustment)
function parseSensorReadings(valuesText) {
    const readingPairs = valuesText.split('@');
    const readings = [];

    for (const pair of readingPairs) {
        const [timestamp, value] = pair.split(',');
        if (!timestamp || !value) continue;

        // Convert from server time (+05:30) to local time
        const serverDate = new Date(timestamp);
        const localDate = new Date(serverDate.getTime() + (5.5 * 60 * 60));
        
        const date = localDate.toISOString().split('T')[0];
        const time = localDate.toTimeString().substring(0, 8);

        readings.push({
            timestamp: timestamp,
            date: date,
            time: time,
            value: parseFloat(value)
        });
    }

    return readings;
}

// Display results with Google Chart and data table
function displayResults(readings, sensor) {
    if (readings.length === 0) {
        document.getElementById('chart-container').innerHTML = '<div class="alert alert-warning">No readings found.</div>';
        document.getElementById('data-table').innerHTML = '';
        return;
    }

    // Draw chart with new style
    google.charts.load('current', { packages: ['corechart'] });
    google.charts.setOnLoadCallback(() => {
        const data = new google.visualization.DataTable();
        data.addColumn('datetime', 'Time');
        data.addColumn('number', sensor.observedProperty.split(':').pop());
        
        const chartData = readings.map(r => {
            const localDate = new Date(r.date + 'T' + r.time);
            return [localDate, r.value];
        });

        data.addRows(chartData);

        const options = {
            title: `${sensor.name} - ${sensor.observedProperty.split(':').pop()}`,
            titleTextStyle: {
                color: '#495057',
                fontSize: 16,
                bold: false
            },
            curveType: 'none', // Changed from 'function' to straight lines
            legend: { position: 'none' },
            hAxis: {
                title: 'Time',
                titleTextStyle: { color: '#6c757d' },
                textStyle: { color: '#6c757d' },
                gridlines: { color: '#e9ecef' },
                format: 'MMM dd, HH:mm'
            },
            vAxis: {
                title: sensor.observedProperty.split(':').pop(),
                titleTextStyle: { color: '#6c757d' },
                textStyle: { color: '#6c757d' },
                gridlines: { color: '#e9ecef' }
            },
            chartArea: { 
                width: '85%', 
                height: '70%',
                backgroundColor: {
                    stroke: '#dee2e6',
                    strokeWidth: 1
                }
            },
            backgroundColor: 'transparent',
            colors: ['#20c997'], // Teal color for the line
            lineWidth: 3,
            pointSize: 5,
            animation: {
                duration: 1000,
                easing: 'out',
                startup: true
            }
        };

        const chart = new google.visualization.LineChart(
            document.getElementById('chart-container')
        );
        chart.draw(data, options);
    });
    
    // Create new styled data table
    const tableHtml = `
        <table class="sensor-data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                ${readings.map(r => `
                    <tr>
                        <td>${r.date}</td>
                        <td>${r.time}</td>
                        <td><span class="badge bg-primary rounded-pill">${r.value.toFixed(2)}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('data-table').innerHTML = tableHtml;
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    // Set up event listeners
    document.getElementById('get-capabilities').addEventListener('click', getCapabilities);
    document.getElementById('filter-sensors').addEventListener('click', filterSensors);
    document.getElementById('get-observations').addEventListener('click', getObservations);
    
    // Initialize date fields with today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('start-date').value = today;
    document.getElementById('end-date').value = today;
    
    // Initialize time fields with default values
    document.getElementById('start-time').value = '00:00';
    document.getElementById('end-time').value = '23:59';
});