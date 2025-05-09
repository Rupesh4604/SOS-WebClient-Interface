// Global variables
let map;
let vectorLayer;
let selectedSensor = null;
let observationChart = null;
let sensors = [];
let popup;
let lastXmlResponse = '';

// Initialize the map
function initMap() {
    map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM()
            })
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([0, 0]),
            zoom: 2
        })
    });

    // Create popup overlay
    popup = new ol.Overlay({
        element: document.createElement('div'),
        autoPan: {
            animation: {
                duration: 250
            }
        }
    });
    popup.getElement().className = 'ol-popup';
    map.addOverlay(popup);

    // Create vector layer for sensor points
    vectorLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        style: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({color: 'red'}),
                stroke: new ol.style.Stroke({
                    color: 'white', width: 2
                })
            })
        })
    });
    map.addLayer(vectorLayer);

    // Hover interaction for sensor points
    let currentFeature = null;
    map.on('pointermove', function(evt) {
        const feature = map.forEachFeatureAtPixel(evt.pixel, function(feature) {
            return feature;
        });
        
        if (feature !== currentFeature) {
            if (feature) {
                const sensor = feature.get('sensor');
                const coordinates = feature.getGeometry().getCoordinates();
                
                // Extract observed property from definition
                let observedProperty = '';
                if (sensor.properties[0]?.href) {
                    const parts = sensor.properties[0].href.split(':');
                    observedProperty = parts[parts.length - 1];
                }
                
                // Convert to DMS format
                const latDMS = decimalToDMS(sensor.lat, true);
                const lonDMS = decimalToDMS(sensor.lon, false);
                
                // Create popup content
                let content = `<h6>${sensor.name}</h6>`;
                if (sensor.description) content += `<p><em>${sensor.description}</em></p>`;
                content += `<p><strong>Location:</strong><br>${latDMS}<br>${lonDMS}</p>`;
                content += `<p><strong>Observed:</strong> ${observedProperty}</p>`;
                
                popup.getElement().innerHTML = content;
                popup.setPosition(coordinates);
                
                // Highlight feature
                feature.setStyle(new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 8,
                        fill: new ol.style.Fill({color: 'blue'}),
                        stroke: new ol.style.Stroke({
                            color: 'white', width: 2
                        })
                    })
                }));
                
                currentFeature = feature;
            } else {
                // Reset previous feature style
                if (currentFeature) {
                    currentFeature.setStyle(new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 6,
                            fill: new ol.style.Fill({color: 'red'}),
                            stroke: new ol.style.Stroke({
                                color: 'white', width: 2
                            })
                        })
                    }));
                }
                popup.setPosition(undefined);
                currentFeature = null;
            }
        }
    });
}

// Convert decimal degrees to DMS format
function decimalToDMS(decimal, isLatitude) {
    const absDecimal = Math.abs(decimal);
    const degrees = Math.floor(absDecimal);
    const minutes = Math.floor((absDecimal - degrees) * 60);
    const seconds = ((absDecimal - degrees - minutes/60) * 3600).toFixed(2);
    
    const direction = isLatitude 
        ? (decimal >= 0 ? 'N' : 'S')
        : (decimal >= 0 ? 'E' : 'W');
    
    return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
}

// Update XML response display
function updateXmlResponse(content) {
    lastXmlResponse = content;
    const xmlResponseElement = document.getElementById('xmlResponse');
    xmlResponseElement.textContent = content;
    xmlResponseElement.scrollTop = xmlResponseElement.scrollHeight;
}

// Get Capabilities request
async function getCapabilities() {
    const serverUrl = document.getElementById('serverUrl').value.trim();
    if (!serverUrl) {
        alert('Please enter a valid SOS server URL');
        return;
    }

    try {
        document.getElementById('getCapabilitiesBtn').disabled = true;
        document.getElementById('getCapabilitiesBtn').textContent = 'Loading...';
        
        const url = `${serverUrl}?service=SOS&request=GetCapabilities&version=1.0.0`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const xmlText = await response.text();
        updateXmlResponse(xmlText);
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        sensors = await parseCapabilities(xmlDoc);
        
        updateSensorDropdown(sensors);
        plotSensorsOnMap(sensors);
        
        document.getElementById('sensorDropdown').disabled = false;
        document.getElementById('applySpatialFilterBtn').disabled = false;
        
    } catch (error) {
        console.error('Error fetching capabilities:', error);
        alert('Error fetching capabilities: ' + error.message);
        updateXmlResponse(`Error: ${error.message}`);
    } finally {
        document.getElementById('getCapabilitiesBtn').disabled = false;
        document.getElementById('getCapabilitiesBtn').textContent = 'Get Capabilities';
    }
}

// Parse capabilities XML
async function parseCapabilities(xmlDoc) {
    const ns = {
        sos: "http://www.opengis.net/sos/1.0",
        gml: "http://www.opengis.net/gml",
        xlink: "http://www.w3.org/1999/xlink"
    };

    const offering = xmlDoc.getElementsByTagNameNS(ns.sos, "ObservationOffering")[0];
    if (!offering) return [];

    // Get spatial extent from capabilities
    const envelope = offering.getElementsByTagNameNS(ns.gml, "Envelope")[0];
    let defaultCoords = null;
    if (envelope) {
        const lowerCorner = envelope.getElementsByTagNameNS(ns.gml, "lowerCorner")[0]?.textContent;
        const upperCorner = envelope.getElementsByTagNameNS(ns.gml, "upperCorner")[0]?.textContent;
        
        if (lowerCorner && upperCorner) {
            const coords1 = lowerCorner.trim().split(/\s+/);
            const coords2 = upperCorner.trim().split(/\s+/);
            
            if (coords1.length >= 2 && coords2.length >= 2) {
                const minLon = parseFloat(coords1[0]);
                const minLat = parseFloat(coords1[1]);
                const maxLon = parseFloat(coords2[0]);
                const maxLat = parseFloat(coords2[1]);
                
                if (!isNaN(minLon) && !isNaN(minLat) && !isNaN(maxLon) && !isNaN(maxLat)) {
                    defaultCoords = { 
                        minLon: Math.min(minLon, maxLon),
                        minLat: Math.min(minLat, maxLat),
                        maxLon: Math.max(minLon, maxLon),
                        maxLat: Math.max(minLat, maxLat)
                    };
                }
            }
        }
    }
    const procedures = offering.getElementsByTagNameNS(ns.sos, "procedure");
    const observedProperties = offering.getElementsByTagNameNS(ns.sos, "observedProperty");
    const featuresOfInterest = offering.getElementsByTagNameNS(ns.sos, "featureOfInterest");

    const timePeriod = offering.getElementsByTagNameNS(ns.gml, "TimePeriod")[0];
    const beginPosition = timePeriod?.getElementsByTagNameNS(ns.gml, "beginPosition")[0]?.textContent;
    const endPosition = timePeriod?.getElementsByTagNameNS(ns.gml, "endPosition")[0]?.textContent;

    const sensorPromises = [];
    for (let i = 0; i < procedures.length; i++) {
        const procedure = procedures[i];
        const sensorId = procedure.getAttributeNS(ns.xlink, "href");
        
        const property = observedProperties[i] || observedProperties[0];
        const feature = featuresOfInterest[i] || featuresOfInterest[0];

        // Get observed property - handle both xlink:href and direct text content
        let observedProperty = '';
        if (property) {
            observedProperty = property.getAttributeNS(ns.xlink, "href") || 
                             property.textContent.trim();
        }

        const sensor = {
            id: sensorId,
            name: sensorId.split(':').pop(),
            description: '',
            observedProperty: observedProperty,
            properties: [{
                href: observedProperty,
                title: property?.getAttributeNS(ns.xlink, "title") || observedProperty.split(':').pop()
            }],
            featureOfInterest: feature?.getAttributeNS(ns.xlink, "href") || '',
            beginPosition,
            endPosition,
            lon: null, // Will be filled by DescribeSensor
            lat: null
        };

        sensorPromises.push(fetchSensorDetails(sensor));
    }

    const sensors = await Promise.all(sensorPromises);
    
    // Auto-fill spatial filter if we have coordinates
    if (defaultCoords) {
        document.getElementById('minLon').value = defaultCoords.minLon.toFixed(6);
        document.getElementById('maxLon').value = defaultCoords.maxLon.toFixed(6);
        document.getElementById('minLat').value = defaultCoords.minLat.toFixed(6);
        document.getElementById('maxLat').value = defaultCoords.maxLat.toFixed(6);
    } else {
        // Calculate from actual sensor locations if envelope not available
        updateSpatialFilterFromSensors(sensors);
    }
    
    return sensors;
}

// NEW: Update spatial filter from sensor locations
function updateSpatialFilterFromSensors(sensors) {
    const validSensors = sensors.filter(s => s.lon !== null && s.lat !== null);
    if (validSensors.length === 0) return;

    const lons = validSensors.map(s => s.lon);
    const lats = validSensors.map(s => s.lat);
    
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    // Add 10% padding
    const lonPadding = (maxLon - minLon) * 0.1 || 1.0;
    const latPadding = (maxLat - minLat) * 0.1 || 1.0;

    document.getElementById('minLon').value = (minLon - lonPadding).toFixed(6);
    document.getElementById('maxLon').value = (maxLon + lonPadding).toFixed(6);
    document.getElementById('minLat').value = (minLat - latPadding).toFixed(6);
    document.getElementById('maxLat').value = (maxLat + latPadding).toFixed(6);
}

// Fetch sensor details via DescribeSensor
async function fetchSensorDetails(sensor) {
    const serverUrl = document.getElementById('serverUrl').value.trim();
    if (!serverUrl) return sensor;

    try {
        const url = `${serverUrl}?service=SOS&request=DescribeSensor&version=1.0.0` +
                    `&procedure=${encodeURIComponent(sensor.id)}` +
                    `&outputFormat=text/xml;subtype="sensorML/1.0.1"`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const xmlText = await response.text();
        const details = parseSensorDetails(xmlText);
        
        if (details) {
            // Only update position if we got valid coordinates
            if (details.lon !== null && details.lat !== null) {
                sensor.lon = details.lon;
                sensor.lat = details.lat;
            }
            
            // Update description if available
            if (details.description) {
                sensor.description = details.description;
            }
            
            // Update observed property if found in SensorML
            if (details.observedProperty) {
                sensor.observedProperty = details.observedProperty;
                sensor.properties[0].href = details.observedProperty;
            }
            
            // Update time extent if available
            if (details.beginPosition) {
                sensor.beginPosition = details.beginPosition;
            }
            if (details.endPosition) {
                sensor.endPosition = details.endPosition;
            }
        }
    } catch (error) {
        console.error(`Error fetching details for sensor ${sensor.id}:`, error);
    }

    return sensor;
}

// Parse SensorML to extract details
// Parse SensorML to extract details
function parseSensorDetails(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const ns = {
        sml: "http://www.opengis.net/sensorML/1.0.1",
        gml: "http://www.opengis.net/gml",
        swe: "http://www.opengis.net/swe/1.0.1"
    };

    const result = {
        lon: null,
        lat: null,
        description: '',
        observedProperty: null,
        beginPosition: null,
        endPosition: null
    };

    // Parse time period
    const timePeriod = xmlDoc.getElementsByTagNameNS(ns.gml, "TimePeriod")[0];
    if (timePeriod) {
        result.beginPosition = timePeriod.getElementsByTagNameNS(ns.gml, "beginPosition")[0]?.textContent;
        result.endPosition = timePeriod.getElementsByTagNameNS(ns.gml, "endPosition")[0]?.textContent;
        
        // Clean up time strings
        if (result.beginPosition) {
            result.beginPosition = result.beginPosition.split('.')[0]; // Remove milliseconds
        }
        if (result.endPosition) {
            result.endPosition = result.endPosition.split('.')[0]; // Remove milliseconds
        }
    }

    // Parse position
    function tryGetCoords(element) {
        if (!element) return null;
        try {
            const text = element.textContent.trim();
            if (!text) return null;
            
            // Handle different coordinate formats
            const coords = text.split(/\s+|,/).filter(x => x !== '');
            if (coords.length >= 2) {
                const lon = parseFloat(coords[0]);
                const lat = parseFloat(coords[1]);
                if (!isNaN(lon) && !isNaN(lat)) {
                    return { lon, lat };
                }
            }
        } catch (e) {
            console.error("Error parsing coordinates:", e);
        }
        return null;
    }

    // Check multiple possible locations for coordinates
    const posElement = xmlDoc.getElementsByTagNameNS(ns.gml, "pos")[0];
    const pointElement = xmlDoc.getElementsByTagNameNS(ns.gml, "Point")[0];
    const coordinatesElement = xmlDoc.getElementsByTagNameNS(ns.gml, "coordinates")[0];
    
    const posCoords = tryGetCoords(posElement);
    const pointCoords = pointElement ? tryGetCoords(pointElement.getElementsByTagNameNS(ns.gml, "pos")[0]) : null;
    const directCoords = coordinatesElement ? tryGetCoords(coordinatesElement) : null;
    
    // Use the first valid coordinates found
    const coords = posCoords || pointCoords || directCoords;
    if (coords) {
        result.lon = coords.lon;
        result.lat = coords.lat;
    }

    // Parse description
    const description = xmlDoc.getElementsByTagNameNS(ns.gml, "description")[0];
    if (description) {
        result.description = description.textContent.trim();
    }

    // Parse observed property from SensorML (if available)
    const quantity = xmlDoc.getElementsByTagNameNS(ns.swe, "Quantity")[0];
    if (quantity) {
        result.observedProperty = quantity.getAttribute("definition") || 
                                quantity.getAttributeNS(ns.swe, "definition");
    }

    return result;
}

// Update sensor dropdown
function updateSensorDropdown(sensors) {
    const dropdown = document.getElementById('sensorDropdown');
    dropdown.innerHTML = '<option value="">-- Select a sensor --</option>';
    
    sensors.forEach(sensor => {
        const option = document.createElement('option');
        option.value = sensor.id;
        option.textContent = sensor.description 
            ? `${sensor.name} - ${sensor.description}` 
            : sensor.name;
        dropdown.appendChild(option);
    });
}

// Plot sensors on the map
function plotSensorsOnMap(sensorsToPlot) {
    const source = vectorLayer.getSource();
    source.clear();
    
    const validSensors = sensorsToPlot.filter(sensor => sensor.lon !== null && sensor.lat !== null);
    
    validSensors.forEach(sensor => {
        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([sensor.lon, sensor.lat])),
            sensor: sensor
        });
        
        feature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({color: 'red'}),
                stroke: new ol.style.Stroke({
                    color: 'white', 
                    width: 2
                })
            })
        }));
        
        source.addFeature(feature);
    });
    
    // Zoom to extent if we have features
    if (source.getFeatures().length > 0) {
        const extent = source.getExtent();
        map.getView().fit(extent, {
            padding: [50, 50, 50, 50],
            maxZoom: 15
        });
    }
}

// Apply spatial filter
function applySpatialFilter() {
    const minLon = parseFloat(document.getElementById('minLon').value);
    const maxLon = parseFloat(document.getElementById('maxLon').value);
    const minLat = parseFloat(document.getElementById('minLat').value);
    const maxLat = parseFloat(document.getElementById('maxLat').value);
    
    if (isNaN(minLon) || isNaN(maxLon) || isNaN(minLat) || isNaN(maxLat)) {
        alert('Please enter valid bounding box coordinates');
        return;
    }
    
    const filteredSensors = sensors.filter(sensor => {
        return sensor.lon !== null && sensor.lat !== null && 
               sensor.lon >= minLon && sensor.lon <= maxLon &&
               sensor.lat >= minLat && sensor.lat <= maxLat;
    });
    
    plotSensorsOnMap(filteredSensors);
    updateSensorDropdown(filteredSensors);
}

// Reset spatial filter
function resetSpatialFilter() {
    document.getElementById('minLon').value = '';
    document.getElementById('maxLon').value = '';
    document.getElementById('minLat').value = '';
    document.getElementById('maxLat').value = '';
    
    plotSensorsOnMap(sensors);
    updateSensorDropdown(sensors);
}

// Select sensor from dropdown
function selectSensorFromDropdown() {
    const sensorId = document.getElementById('sensorDropdown').value;
    if (!sensorId) return;
    
    const sensor = sensors.find(s => s.id === sensorId);
    if (sensor) {
        selectSensor(sensor);
    }
    

}

// Select sensor and show details
async function selectSensor(sensor) {
    selectedSensor = sensor;
    
    // Enable time inputs
    document.getElementById('startTime').disabled = false;
    document.getElementById('endTime').disabled = false;
    document.getElementById('getObservationsBtn').disabled = false;
    
    // Format and set time values if available
    if (sensor.beginPosition) {
        document.getElementById('startTime').value = formatForDateTimeInput(sensor.beginPosition);
    } else {
        document.getElementById('startTime').value = '';
    }
    
    if (sensor.endPosition) {
        document.getElementById('endTime').value = formatForDateTimeInput(sensor.endPosition);
    } else {
        document.getElementById('endTime').value = '';
    }
    
    // Zoom to sensor if coordinates exist
    if (sensor.lon && sensor.lat) {
        const view = map.getView();
        view.setCenter(ol.proj.fromLonLat([sensor.lon, sensor.lat]));
        view.setZoom(15);
    }
    
    // Fetch and display SensorML data
    try {
        const serverUrl = document.getElementById('serverUrl').value.trim();
        if (!serverUrl) return;
        
        const url = `${serverUrl}?service=SOS&request=DescribeSensor&version=1.0.0` +
                   `&procedure=${encodeURIComponent(sensor.id)}` +
                   `&outputFormat=text/xml;subtype="sensorML/1.0.1"`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const sensorML = await response.text();
        updateXmlResponse(sensorML);
        
    } catch (error) {
        console.error('Error fetching SensorML:', error);
        updateXmlResponse(`Error fetching SensorML: ${error.message}`);
    }
}


function formatForDateTimeInput(isoDate) {
    if (!isoDate) return '';
    
    // Handle different date formats
    let date;
    try {
        date = new Date(isoDate);
        if (isNaN(date.getTime())) {
            // Try without timezone if first attempt failed
            date = new Date(isoDate.split('+')[0]);
        }
    } catch (e) {
        console.error('Error parsing date:', isoDate, e);
        return '';
    }
    
    // Format for datetime-local input (YYYY-MM-DDTHH:MM)
    const pad = num => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Get observations for selected sensor
// Get observations for selected sensor
async function getObservations() {
    if (!selectedSensor) {
        alert('No sensor selected');
        return;
    }
    
    const serverUrl = document.getElementById('serverUrl').value.trim();
    if (!serverUrl) {
        alert('Please enter a valid SOS server URL');
        return;
    }
    
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
    if (!startTime || !endTime) {
        alert('Please select both start and end time');
        return;
    }
    
    try {
        document.getElementById('getObservationsBtn').disabled = true;
        document.getElementById('getObservationsBtn').textContent = 'Loading...';
        
        // Format dates properly for the request
        const isoStart = new Date(startTime).toISOString().split('.')[0] + 'Z';
        const isoEnd = new Date(endTime).toISOString().split('.')[0] + 'Z';
        
        // Get the observedProperty for the selected sensor
        const observedProperty = selectedSensor.observedProperty;
        if (!observedProperty) {
            throw new Error('No observed property found for selected sensor');
        }
        
        const url = `${serverUrl}?request=GetObservation` +
                    `&service=SOS&version=1.0.0` +
                    `&offering=temporary` +
                    `&procedure=${encodeURIComponent(selectedSensor.id)}` +
                    `&observedProperty=${encodeURIComponent(observedProperty)}` +
                    `&eventTime=${encodeURIComponent(isoStart)}/${encodeURIComponent(isoEnd)}` +
                    `&responseFormat=text/xml`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const responseText = await response.text();
        updateXmlResponse(responseText);
        
        const { observations, observedcleanProperty } = parseObservations(responseText);
        updateChart(observations, observedcleanProperty);
        updateDataTable(observations);;
        
        // Show observation section
        document.getElementById('observationSection').style.display = 'block';
        
        
    } catch (error) {
        console.error('Error fetching observations:', error);
        alert('Error fetching observations: ' + error.message);
        updateXmlResponse(`Error: ${error.message}`);
    } finally {
        document.getElementById('getObservationsBtn').disabled = false;
        document.getElementById('getObservationsBtn').textContent = 'Get Observations';
    }
}

// Parse XML observations
function parseObservations(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const ns = {
        om: "http://www.opengis.net/om/1.0",
        swe: "http://www.opengis.net/swe/1.0.1",
        gml: "http://www.opengis.net/gml"
    };
    
    const observations = [];
    
    // Get the observed property name
    let observedcleanProperty = "Observation";
    const compositePhenomenon = xmlDoc.getElementsByTagNameNS(ns.swe, "CompositePhenomenon")[0];
    if (compositePhenomenon) {
        const components = compositePhenomenon.getElementsByTagNameNS(ns.swe, "component");
        if (components.length > 1) { // Second component is the actual measurement
            const href = components[1].getAttributeNS("http://www.w3.org/1999/xlink", "href");
            if (href) {
                observedcleanProperty = href.split(':').pop().replace(/-/g, ' ');
            }
        }
    }

    // Get the DataArray
    const dataArray = xmlDoc.getElementsByTagNameNS(ns.swe, "DataArray")[0];
    if (!dataArray) return { observations: [], observedProperty };

    // Get encoding and values
    const encoding = dataArray.getElementsByTagNameNS(ns.swe, "TextBlock")[0];
    const tokenSeparator = encoding.getAttribute("tokenSeparator") || ",";
    const blockSeparator = encoding.getAttribute("blockSeparator") || "@";
    
    // Get unit of measurement
    const uom = dataArray.getElementsByTagNameNS(ns.swe, "uom")[0];
    const unit = uom ? uom.getAttribute("code") : "";
    
    // Parse values
    const values = dataArray.getElementsByTagNameNS(ns.swe, "values")[0];
    if (!values) return { observations: [], observedProperty };

    values.textContent.split(blockSeparator).forEach(block => {
        if (!block.trim()) return;
        
        const tokens = block.split(tokenSeparator);
        if (tokens.length >= 2) {
            const time = tokens[0].trim();
            const value = parseFloat(tokens[1]);
            
            if (!isNaN(value)) {
                observations.push({
                    time: new Date(time),
                    value: value,
                    unit: unit
                });
            }
        }
    });

    // Sort by time
    observations.sort((a, b) => a.time - b.time);
    
    return { observations, observedcleanProperty };
}


// Update data table
function updateDataTable(observations) {
    const tableBody = document.querySelector('#dataTable tbody');
    tableBody.innerHTML = '';
    
    if (!observations || observations.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center">No observation data available</td></tr>';
        return;
    }
    
    observations.forEach(obs => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${obs.time.toLocaleString()}</td>
            <td>${obs.value.toFixed(2)}</td>
            <td>${obs.unit}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Update chart with observations
function updateChart(observations, observedcleanProperty) {
    const chartContainer = document.getElementById('chartContainer');
    chartContainer.innerHTML = '';
    
    if (observations.length === 0) {
        chartContainer.innerHTML = '<p class="text-muted">No observation data available</p>';
        if (observationChart) {
            observationChart.destroy();
            observationChart = null;
        }
        return;
    }
    
    const ctx = document.createElement('canvas');
    chartContainer.appendChild(ctx);
    
    if (observationChart) {
        observationChart.destroy();
    }
    
    // Prepare data
    const labels = observations.map(obs => obs.time.toLocaleTimeString());
    const data = observations.map(obs => obs.value);
    const unit = observations[0]?.unit || '';
    
    observationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${observedcleanProperty} (${unit})`,
                data: data,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: `${observedcleanProperty} (${unit})`
                    },
                    beginAtZero: false
                }
            }
        }
    });
    
    chartContainer.style.display = 'block';
}
// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    // Event listeners
    document.getElementById('getCapabilitiesBtn').addEventListener('click', getCapabilities);
    document.getElementById('applySpatialFilterBtn').addEventListener('click', applySpatialFilter);
    document.getElementById('resetSpatialFilterBtn').addEventListener('click', resetSpatialFilter);
    document.getElementById('sensorDropdown').addEventListener('change', selectSensorFromDropdown);
    document.getElementById('getObservationsBtn').addEventListener('click', getObservations);
});