// Associer une couleur différente à chaque navire.
let vesselColors = {
    "AAA": "blue",
    "III": "purple",
    "LLL": "black"
};

let vesselsMarkers = {};


// -------------------- Carte --------------------

// Initialiser la carte.
// Les longitudes sont étendues au-delà de [-180, 180]
// afin de pouvoir afficher correctement les passages de l'antiméridien.
let map = L.map("map", {
    minZoom: 2,
    maxBounds: [
        [-85, -360],
        [85, 360]
    ]
});

map.setView([0, 0], 2);

// Ajouter le fond de carte.
// noWrap: false autorise Leaflet à répéter le fond horizontalement.
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

        /*
         * Ces tableaux restent vides si aucune colorimétrie
         * n'est demandée ou disponible.
         *
         * Lorsqu'ils sont remplis, leurs index restent alignés :
         *
         * gpsPositions[i]
         * pilotValues[i]
         * statuses[i]
         *
         * représentent tous le même instant.
         */
        let pilotValues = [];
        let statuses = [];

        if (colorimetryRequested) {
            let pilotRows = result["response"][vessel][pilotDataset];

            // Vérifier que le dataset et la variable pilote
            // sont réellement disponibles pour ce navire.
            if (pilotRows && pilotRows.length > 0 && variablePilot in pilotRows[0]) {

                /*
                 * Associer chaque position GPS à la valeur pilote
                 * possédant exactement le même timestamp.
                 *
                 * Si aucune mesure n'existe pour un timestamp GPS,
                 * on ajoute null.
                 *
                 * On ne supprime surtout pas l'élément :
                 * sinon les index entre GPS et colorimétrie
                 * seraient décalés.
                 */
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

        /*
         * La trajectoire est tracée segment par segment
         * plutôt qu'avec une seule polyline.
         *
         * Cela permet :
         *
         * 1. de corriger les passages de l'antiméridien ;
         * 2. d'appliquer éventuellement une couleur différente
         *    à chaque segment.
         */
        for (let i = 0; i < gpsPositions.length - 1; i++) {

            /*
             * Faire une copie des deux positions.
             *
             * On ne modifie pas directement gpsPositions :
             * les coordonnées originales doivent rester intactes
             * pour les segments suivants, le cadrage de la carte
             * et le marqueur final.
             */
            let startPosition = [gpsPositions[i][0], gpsPositions[i][1]];
            let endPosition = [gpsPositions[i + 1][0], gpsPositions[i + 1][1]];


            // Ne pas tracer un segment si une de ses deux positions GPS est absente.
            if (
                startPosition[0] !== null && startPosition[1] !== null &&
                endPosition[0] !== null && endPosition[1] !== null
            ) {


                // -------------------- Passage de l'antiméridien --------------------

                /*
                 * Les longitudes vont normalement de -180° à +180°.
                 *
                 * Exemple :
                 *
                 * 179° -> -179°
                 *
                 * représente un déplacement réel d'environ 2°.
                 *
                 * Mais sans correction, Leaflet voit environ 358°
                 * d'écart et trace une ligne à travers toute la carte.
                 */
                let delta = endPosition[1] - startPosition[1];

                if (Math.abs(delta) > 180) {
                    if (delta > 0) {

                        /*
                         * Exemple :
                         *
                         * -179° -> 179°
                         *
                         * 179° devient -181°.
                         *
                         * Les deux coordonnées représentent alors
                         * deux positions voisines sur la carte répétée.
                         */
                        endPosition[1] -= 360;

                    } else {

                        /*
                         * Exemple :
                         *
                         * 179° -> -179°
                         *
                         * -179° devient 181°.
                         */
                        endPosition[1] += 360;
                    }
                }

                let segment = [startPosition, endPosition];

                /*
                 * La trajectoire normale est toujours tracée.
                 *
                 * Si aucune colorimétrie n'est disponible pour ce segment,
                 * cette ligne restera simplement visible telle quelle.
                 */
                L.polyline(segment, { color: vesselColors[vessel] }).addTo(resultLayers);


                // -------------------- Surcouche colorimétrique --------------------

                /*
                 * La couleur du segment dépend du statut
                 * mesuré au début du segment : statuses[i].
                 *
                 * Si statuses[i] vaut null ou n'existe pas,
                 * aucune couleur n'est ajoutée par-dessus.
                 */
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

        // Conserver les coordonnées GPS originales
        // afin d'adapter ensuite le cadrage de la carte.
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

        /*
        * Associer chaque navire à son marqueur Leaflet.
        *
        * Le marqueur est créé pendant l'affichage des résultats du Find,
        * puis réutilisé par replay.js afin de représenter la position
        * du navire à l'instant courant du replay.
        */
        L.marker(firstPosition, { icon: departureIcon }).addTo(resultLayers);


        // Ajouter un marqueur sur la dernière position connue.
        // Ce même marqueur est ensuite réutilisé pendant le replay
        // pour représenter la position du navire à l'instant courant.
        let lastPosition = gpsPositions[gpsPositions.length - 1];

        // Remplacer le marqueur Leaflet par défaut par une icône de navire personnalisée
        // afin de pouvoir reprendre la couleur associée au navire.
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