# 🌐 SOS WebClient Interface (istSOS Integration)
**SOS WebClient Interface** is a lightweight browser app for viewing and querying sensor data from istSOS. It supports map-based sensor selection, time/spatial filtering, and displays observations using charts, tables, and formatted XML - all via OGC SOS 1.0.0 standards.

This project is a browser-based client interface for interacting with **Sensor Observation Service (SOS)** endpoints, specifically built for integration with the **istSOS** (an OGC-compliant SOS implementation). It supports discovering sensors, visualizing their spatial distribution, fetching observations, and rendering sensor data over time using charts and tables.

## 🧰 Tech Stack

### 📦 Frontend
- **HTML**, **CSS**, **JavaScript**
- [OpenLayers](https://openlayers.org/) (sensor mapping)
- [Bootstrap 5](https://getbootstrap.com/) for UI components
- [Font Awesome](https://fontawesome.com/) for icons
- [Google Charts](https://developers.google.com/chart) for data visualization
- `vkbeautify.js` for formatting XML responses

### 🗃 Backend
- **istSOS** (Sensor data service)
- OGC SOS standard (1.0.0)

## ✨ Features

### 🌍 Sensor Map
- Visualizes all sensors as styled map markers using OpenLayers
- Clickable sensors display metadata and time intervals via popups
- Automatically adjusts map to sensor extent or bounding box filters

### 🔍 Sensor Discovery
- Performs SOS `GetCapabilities` request to list all registered sensors
- Parses `DescribeSensor` for metadata like description, type, interval, and location
- Dynamically populates dropdown for sensor selection

### 📈 Observation Fetching
- Fetches observations using SOS `GetObservation`
- Allows time range selection using date and time pickers
- Auto-converts time to and from UTC/IST
- Displays observation data as:
  - Interactive **line chart**
  - Styled **data table**

### 📦 XML Debugging
- Pretty-prints raw XML from SOS responses (GetCapabilities, DescribeSensor, GetObservation)

### 🧭 Filters & Utilities
- Bounding box filter for spatial filtering of sensors
- Responsive layout and loading indicators for async calls
- Graceful error handling and informative alerts


## ⚙️ Setup Instructions

### ✅ Prerequisites
- A running instance of **istSOS** (e.g., `http://<host>/istsos`)
- Sensors and procedures registered in istSOS

### 🚀 Running the Client
1. Clone or download this repository.
2. Open `main.html` in a web browser (preferably Chrome).
3. Set the correct istSOS endpoint in the **Server URL** field (e.g., `http://192.168.0.142/istsos`).
4. Click **Get Capabilities** to load sensors and begin exploration.


## 📌 Usage Overview

1. **Get Capabilities**: Fetches list of available procedures.
2. **Select Sensor**: Click on the map or use dropdown to view metadata.
3. **Bounding Box Filter**: Limit sensors by geographic area.
4. **Time Range**: Choose date/time range for data querying.
5. **Get Observations**: Fetch and display readings for the selected sensor.
6. **Inspect XML**: Raw XML responses are shown in the "XML Response" pane.


## 📃 License

This project is released for academic and research purposes under the MIT License. Feel free to use and adapt with attribution.


## ✍️ Author

Developed as a client application for interoperable access to SOS-compliant sensor data using istSOS.
