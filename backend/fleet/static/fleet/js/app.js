// -------------------- Éléments HTML --------------------

let findButton = document.getElementById("find");
let vesselSelect = document.getElementById("vessels");
let startDateInput = document.getElementById("start-date");
let endDateInput = document.getElementById("end-date");
let variableSelect = document.getElementById("variables");
let messagesDiv = document.getElementById("messages");

let colorVariableSelect = document.getElementById("color-variable");
let referenceInput = document.getElementById("reference-value");
let toleranceInput = document.getElementById("tolerance-value");


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


// Groupe contenant les trajectoires et les marqueurs
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


// Conserver les variables regroupées par dataset.
// Cette structure sert ensuite à retrouver le dataset de la variable pilote.
let variablesByType = {};


// Alimenter le sélecteur de variables avec les données réelles
async function loadVariables() {
    let variablesResponse = await fetch("/api/variables/");
    let variablesResult = await variablesResponse.json();

    let datasetTypes = Object.keys(variablesResult["variables"]);

    datasetTypes.forEach(type => {
        variablesByType[type] = Object.keys(
            variablesResult["variables"][type]
        );

        variablesByType[type].forEach(variable => {
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


    // -------------------- Colorimétrie demandée --------------------

    let variablePilot = colorVariableSelect.value;

    // Garder d'abord les valeurs sous forme de chaînes afin de pouvoir
    // distinguer un champ vide ("") d'une valeur réellement égale à 0.
    let addedReferenceValue = referenceInput.value;
    let addedToleranceValue = toleranceInput.value;

    let colorimetryRequested =
        variablePilot &&
        addedReferenceValue !== "" &&
        addedToleranceValue !== "";


    let pilotDataset;

    if (colorimetryRequested) {

        // Les champs ne sont pas vides : convertir les valeurs en nombres
        addedReferenceValue = Number(addedReferenceValue);
        addedToleranceValue = Number(addedToleranceValue);

        // Trouver le dataset qui contient la variable pilote
        Object.keys(variablesByType).forEach(type => {
            if (variablesByType[type].includes(variablePilot)) {
                pilotDataset = type;
            }
        });
    }


    // -------------------- Affichage des navires --------------------

    let allPositions = [];

    selectedVessels.forEach(vessel => {

        let gpsRows = result["response"][vessel]["GPS"];

        let gpsPositions = gpsRows.map(row => [
            row.Latitude,
            row.Longitude
        ]);


        // La trajectoire normale est toujours tracée.
        // La colorimétrie vient ensuite en surcouche lorsqu'elle est disponible.
        L.polyline(gpsPositions).addTo(resultLayers);


        // -------------------- Surcouche de colorimétrie --------------------

        if (colorimetryRequested) {

            let pilotRows = result["response"][vessel][pilotDataset];

            // Le dataset et la variable pilote doivent être disponibles
            // pour ce navire avant de tenter de calculer la colorimétrie.
            if (
                pilotRows &&
                pilotRows.length > 0 &&
                variablePilot in pilotRows[0]
            ) {

                let pilotValues = [];
                let statuses = [];


                /*
                 * Associer chaque position GPS à la valeur pilote portant
                 * exactement le même timestamp.
                 *
                 * Si aucun timestamp correspondant n'existe, on ajoute null
                 * au lieu de supprimer l'élément. Cela permet de conserver
                 * l'alignement :
                 *
                 * gpsPositions[i] <-> pilotValues[i] <-> statuses[i]
                 */
                gpsRows.forEach(gpsRow => {

                    let pilotRow = pilotRows.find(
                        pilotRow =>
                            pilotRow.Timestamp === gpsRow.Timestamp
                    );

                    if (pilotRow !== undefined) {
                        pilotValues.push(pilotRow[variablePilot]);
                    } else {
                        pilotValues.push(null);
                    }
                });


                // Déterminer le statut de chaque valeur pilote.
                pilotValues.forEach(pilotValue => {

                    let status = null;

                    if (pilotValue !== null) {

                        if (
                            pilotValue >= addedReferenceValue - addedToleranceValue &&
                            pilotValue <= addedReferenceValue + addedToleranceValue
                        ) {
                            status = "Normal";

                        } else if (
                            pilotValue > addedReferenceValue + addedToleranceValue
                        ) {
                            status = "High";

                        } else {
                            status = "Low";
                        }
                    }

                    statuses.push(status);
                });


                /*
                 * Un segment relie le point i au point i + 1.
                 *
                 * Sa couleur correspond au statut mesuré au début
                 * du segment : statuses[i].
                 *
                 * Si statuses[i] vaut null, aucune surcouche colorée
                 * n'est tracée et la trajectoire normale reste visible.
                 */
                for (let i = 0; i < gpsPositions.length - 1; i++) {

                    if (statuses[i] !== null) {

                        let segment = [
                            gpsPositions[i],
                            gpsPositions[i + 1]
                        ];

                        let segmentColor;

                        if (statuses[i] === "Normal") {
                            segmentColor = "green";

                        } else if (statuses[i] === "High") {
                            segmentColor = "red";

                        } else {
                            segmentColor = "orange";
                        }

                        L.polyline(segment, {
                            color: segmentColor
                        }).addTo(resultLayers);
                    }
                }
            }
        }


        // Conserver les positions pour adapter le cadrage de la carte
        allPositions.push(gpsPositions);


        // Ajouter un marqueur sur la dernière position connue
        let lastPosition = gpsPositions[gpsPositions.length - 1];
        L.marker(lastPosition).addTo(resultLayers);
    });


    // Adapter le cadrage aux trajectoires affichées
    map.fitBounds(allPositions, {
        maxZoom: 10
    });
});


// -------------------- Sélecteur de colorimétrie --------------------

variableSelect.addEventListener("change", () => {

    let selectedVariables = Array.from(variableSelect.selectedOptions)
        .map(option => option.value);


    // Vider la liste avant de la reconstruire
    // pour éviter d'ajouter plusieurs fois les mêmes variables
    // à chaque changement de sélection.
    // et supprimer les vraiables déseléctioonnées
    colorVariableSelect.replaceChildren();

    selectedVariables.forEach(variable => {

        /*
         * Les variables MACS3 représentent des mesures ponctuelles /
         * des snapshots et ne servent donc pas à colorer une trajectoire
         * continue.
         */
        if (!variablesByType["MACS3"].includes(variable)) {

            let option = document.createElement("option");
            option.value = variable;
            option.textContent = variable;
            colorVariableSelect.appendChild(option);
        }
    });
});