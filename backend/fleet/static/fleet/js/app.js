// -------------------- Éléments HTML --------------------

let findButton = document.getElementById("find");
let vesselSelect = document.getElementById("vessels");
let startDateInput = document.getElementById("start-date");
let endDateInput = document.getElementById("end-date");
let variableSelect = document.getElementById("variables");
let messagesDiv = document.getElementById("messages");


// -------------------- Carte --------------------

// Initialiser la carte
let map = L.map("map", {
    minZoom: 2,
    maxBounds: [
        [-85, -180],
        [85, 180]
    ]
});

map.setView([0, 0], 2);

// Ajouter le fond de carte
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    noWrap: true,
    bounds: [
        [-85.0511, -180],
        [85.0511, 180]
    ]
}).addTo(map);

// Groupe contenant les trajectoires et les markers
let resultLayers = L.layerGroup().addTo(map);


// -------------------- Chargement des sélecteurs --------------------

// Alimenter le sélecteur de navires avec les données réelles
async function loadVessels() {
    let vesselsResponse = await fetch("/api/vessels/");
    let vesselsResult = await vesselsResponse.json();

    vesselsResult.vessels.forEach(vessel => {
        let option = document.createElement("option");
        option.value = vessel;
        option.textContent = vessel;
        vesselSelect.appendChild(option);
    });
}


// Alimenter le sélecteur de variables avec les données réelles
async function loadVariables() {
    let variablesResponse = await fetch("/api/variables/");
    let variablesResult = await variablesResponse.json();

    let datasetTypes = Object.keys(variablesResult["variables"]);

    datasetTypes.forEach(type => {
        let variablesByType = Object.keys(variablesResult["variables"][type]);

        variablesByType.forEach(variable => {
            if (
                variable !== "Timestamp" &&
                variable !== "Longitude" &&
                variable !== "Latitude"
            ) {
                let option = document.createElement("option");
                option.value = variable;
                option.textContent = variable;
                variableSelect.appendChild(option);
            }
        });
    });
}


document.addEventListener("DOMContentLoaded", () => {
    loadVessels();
    loadVariables();
});


// -------------------- Recherche --------------------

findButton.addEventListener("click", async () => {

    // Supprimer les résultats de la recherche précédente
    resultLayers.clearLayers();

    // Récupérer les entrées utilisateur
    let selectedVessels = Array.from(vesselSelect.selectedOptions)
        .map(option => option.value);

    let selectedStartDate = startDateInput.value;
    let selectedEndDate = endDateInput.value;

    let selectedVariables = Array.from(variableSelect.selectedOptions)
        .map(option => option.value);

    // Construire la requête HTTP
    let params = new URLSearchParams();

    selectedVessels.forEach(vessel => {
        params.append("vessels", vessel);
    });

    selectedVariables.forEach(variable => {
        params.append("variables", variable);
    });

    params.append("start_date", selectedStartDate);
    params.append("end_date", selectedEndDate);

    let requestURL = "/api/data/?" + params.toString();

    // Envoyer la requête au backend
    let response = await fetch(requestURL);
    let result = await response.json();

    // Gérer les erreurs
    if (response.ok === false) {
        messagesDiv.textContent = result.error;
        return;
    }

    messagesDiv.textContent = JSON.stringify(result.warnings);

    // Récupérer les positions et tracer les trajectoires
    let allPositions = [];

    selectedVessels.forEach(vessel => {
        let gpsRows = result["response"][vessel]["GPS"];

        let gpsPositions = gpsRows.map(row => [
            row.Latitude,
            row.Longitude
        ]);

        allPositions.push(gpsPositions);

        // Tracer la trajectoire
        L.polyline(gpsPositions).addTo(resultLayers);

        // Ajouter un marker sur la dernière position connue
        let lastPosition = gpsPositions[gpsPositions.length - 1];
        L.marker(lastPosition).addTo(resultLayers);
    });

    // Adapter le cadrage aux trajectoires affichées
    map.fitBounds(allPositions, {
        maxZoom: 10
    });
});