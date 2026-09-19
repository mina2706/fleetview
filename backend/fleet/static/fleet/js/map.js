// Associer une couleur différente à chaque navire.
let vesselColors = {
    "AAA": "blue",
    "III": "purple",
    "LLL": "black"
};

let vesselsMarkers = {};


// -------------------- Carte --------------------

// Autoriser les longitudes répétées pour afficher l’antiméridien.


let map = L.map("map", {
    minZoom: 2,
    maxBounds: [
        [-85, -360],
        [85, 360]
    ]
});

map.setView([0, 0], 2);

// Répéter horizontalement les tuiles OSM.

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    noWrap: false,
    bounds: [
        [-85.0511, -180],
        [85.0511, 180]
    ]
}).addTo(map);

// Groupe contenant les trajectoires et les marqueurs
let resultLayers = L.layerGroup().addTo(map);


function displayMap(result, selectedVessels, variablePilot,addedReferenceValue,addedToleranceValue,variablesByType){
    let colorimetryRequested = variablePilot && addedReferenceValue !== "" && addedToleranceValue !== "";
    let pilotDataset;

    if (colorimetryRequested) {

        // Les champs ont été remplis :
        // convertir maintenant les valeurs en nombres.
        addedReferenceValue = Number(addedReferenceValue);
        addedToleranceValue = Number(addedToleranceValue);

        // Trouver le dataset contenant la variable pilote.
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
        let gpsPositions = gpsRows.map(row => [row.Latitude, row.Longitude]);


        // -------------------- Préparation de la colorimétrie --------------------

        // Positions, valeurs pilotes et statuts gardent le même index temporel.
        let pilotValues = [];
        let statuses = [];

        if (colorimetryRequested) {
            let pilotRows = result["response"][vessel][pilotDataset];

            // Vérifier que la variable pilote existe pour ce navire.

            if (pilotRows && pilotRows.length > 0 && variablePilot in pilotRows[0]) {

                // Sans mesure pilote au timestamp GPS, garder un null pour préserver l’alignement.
                gpsRows.forEach(gpsRow => {
                    let pilotRow = pilotRows.find(pilotRow => pilotRow.Timestamp === gpsRow.Timestamp);

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
                        } else if (pilotValue > addedReferenceValue + addedToleranceValue) {
                            status = "High";
                        } else {
                            status = "Low";
                        }
                    }

                    statuses.push(status);
                });
            }
        }


        // -------------------- Tracé de la trajectoire --------------------

        // Tracer segment par segment pour traiter l’antiméridien et la colorimétrie.
        for (let i = 0; i < gpsPositions.length - 1; i++) {

            // Copier les positions : ne pas modifier les coordonnées GPS sources.
            let startPosition = [gpsPositions[i][0], gpsPositions[i][1]];
            let endPosition = [gpsPositions[i + 1][0], gpsPositions[i + 1][1]];


            // Ne pas tracer un segment si une de ses deux positions GPS est absente.
            if (
                startPosition[0] !== null && startPosition[1] !== null &&
                endPosition[0] !== null && endPosition[1] !== null
            ) {


                // -------------------- Passage de l'antiméridien --------------------

                // Corriger un saut apparent de plus de 180° au passage de l’antiméridien.
                let delta = endPosition[1] - startPosition[1];

                if (Math.abs(delta) > 180) {
                    if (delta > 0) {

                        // Passage -179° → 179° : représenter 179° par -181° sur la carte répétée.
                        endPosition[1] -= 360;

                    } else {

                        // Passage 179° → -179° : représenter -179° par 181°.
                        endPosition[1] += 360;
                    }
                }

                let segment = [startPosition, endPosition];

                // Garder la trajectoire de base si le statut colorimétrique est absent.
                L.polyline(segment, { color: vesselColors[vessel] }).addTo(resultLayers);


                // -------------------- Surcouche colorimétrique --------------------

                // Appliquer au segment le statut du point de départ, si disponible.
                if (statuses[i] !== undefined && statuses[i] !== null) {
                    let segmentColor;

                    if (statuses[i] === "Normal") {
                        segmentColor = "green";
                    } else if (statuses[i] === "High") {
                        segmentColor = "red";
                    } else {
                        segmentColor = "orange";
                    }

                    L.polyline(segment, { color: segmentColor }).addTo(resultLayers);
                }
            }
        }


        // -------------------- Fin du tracé du navire --------------------

        // Cadrer la carte sur les coordonnées GPS d’origine valides.

        for (let i = 0; i < gpsPositions.length; i++) {
            if (gpsPositions[i][0] !== null && gpsPositions[i][1] !== null) {
                allPositions.push(gpsPositions[i]);
            }
        }


        // Ajouter un marqueur sur la premiére position connue.
        let firstPosition = gpsPositions[0];

        // Utiliser un drapeau de la couleur du navire pour identifier son point de départ.
        let departureIcon = L.divIcon({
            html: `
                <svg viewBox="0 0 24 24" width="26" height="26">
                    <path
                        d="M6 3V21"
                        stroke="${vesselColors[vessel]}"
                        stroke-width="2"
                    />
                    <path
                        d="M7 4H18L15 8L18 12H7Z"
                        fill="${vesselColors[vessel]}"
                        stroke="white"
                        stroke-width="1"
                    />
                </svg>`,
            className: "start-icon",
            iconSize: [26, 26],
            iconAnchor: [6, 21]
        });

        // Conserver le marqueur final du navire pour le déplacer pendant le Replay.
        L.marker(firstPosition, { icon: departureIcon }).addTo(resultLayers);


        // Réutiliser le marqueur final comme position courante en Replay.


        let lastPosition = gpsPositions[gpsPositions.length - 1];

        // Utiliser une icône de navire avec sa couleur propre.

        let vesselIcon = L.divIcon({
            html: `
                <svg viewBox="0 0 24 24" width="30" height="30">
                    <path
                        d="M12 2L8 7V11H4L6 18C7 20 9 21 12 21C15 21 17 20 18 18L20 11H16V7L12 2Z"
                        fill="${vesselColors[vessel]}"
                        stroke="white"
                        stroke-width="1.5"
                    />
                </svg>`,
            className: "vessel-icon",
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        vesselsMarkers[vessel] = L.marker(lastPosition, { icon: vesselIcon }).addTo(resultLayers);


        // Afficher le nom du navire au survol de son marqueur.
        vesselsMarkers[vessel].bindTooltip(vessel, { permanent: false, direction: "top" });
    });


    // -------------------- Cadrage de la carte --------------------

    map.fitBounds(allPositions, { maxZoom: 10 });
}

function clearMap() {
    resultLayers.clearLayers();
}