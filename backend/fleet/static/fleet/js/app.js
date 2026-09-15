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

let chartViewSelect = document.getElementById("chart-view");

let replayButton = document.getElementById("replay");


// Associer une couleur différente à chaque navire.
let vesselColors = {
    "AAA": "blue",
    "III": "purple",
    "LLL": "black"
};


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
// Cette structure permet ensuite de retrouver le dataset
// auquel appartient une variable sélectionnée.
let variablesByType = {};


// Conserver les métadonnées complètes des variables.
// Elles sont notamment utilisées par les graphes pour récupérer
// les unités, les sources et déterminer le regroupement des axes Y.
let variablesMetadata = {};


// Alimenter le sélecteur de variables avec les données réelles
async function loadVariables() {
    let variablesResponse = await fetch("/api/variables/");
    let variablesResult = await variablesResponse.json();

    variablesMetadata = variablesResult["variables"];

    let datasetTypes = Object.keys(variablesResult["variables"]);

    datasetTypes.forEach(type => {
        variablesByType[type] = Object.keys(variablesResult["variables"][type]);

        variablesByType[type].forEach(variable => {
            if (variable !== "Timestamp" && variable !== "Longitude" && variable !== "Latitude") {
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

/*
 * Les informations de la recherche sont déclarées en dehors
 * du gestionnaire du bouton Find.
 *
 * Elles doivent rester accessibles après la requête afin que replay.js
 * puisse réutiliser les données retournées ainsi que les choix
 * de l'utilisateur :
 *
 * - navires sélectionnés ;
 * - période sélectionnée ;
 * - variables sélectionnées.
 */
let result;
let selectedVessels;
let selectedStartDate;
let selectedEndDate;
let selectedVariables;

/*
 * Associer chaque navire à son marqueur Leaflet.
 *
 * Le marqueur est créé pendant l'affichage des résultats du Find,
 * puis réutilisé par replay.js afin de représenter la position
 * du navire à l'instant courant du replay.
 */
let vesselsMarkers = {};

findButton.addEventListener("click", async () => {

    // Supprimer les résultats de la recherche précédente
    resultLayers.clearLayers();


    // -------------------- Entrées utilisateur --------------------

    selectedVessels = Array.from(vesselSelect.selectedOptions).map(option => option.value);
    selectedStartDate = startDateInput.value;
    selectedEndDate = endDateInput.value;
    selectedVariables = Array.from(variableSelect.selectedOptions).map(option => option.value);
    
    // -------------------- Requête HTTP --------------------

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
    let response = await fetch(requestURL);
    result = await response.json();
  


    // -------------------- Gestion des erreurs --------------------

    if (response.ok === false) {
        messagesDiv.textContent = result.error;
        return;
    }

    messagesDiv.textContent = JSON.stringify(result.warnings);


    // -------------------- Affichage des graphes --------------------

    /*
     * Supprimer les graphes issus de la recherche précédente.
     *
     * Cette opération est réalisée une seule fois ici et non dans
     * les fonctions de charts.js, car une même recherche peut créer
     * plusieurs canvas lorsque plusieurs variables et plusieurs
     * navires sont sélectionnés.
     */
    chartDiv.replaceChildren();


    if (selectedVariables.length === 1) {

        /*
         * Une seule variable :
         * créer un graphe contenant une courbe par navire sélectionné.
         */
        displayChartOneVariable(
            result,
            selectedVessels,
            selectedVariables[0],
            variablesMetadata,
            variablesByType
        );

    } else if (
        selectedVariables.length > 1 &&
        selectedVessels.length === 1
    ) {

        /*
         * Plusieurs variables et un seul navire :
         * afficher les variables sur un même graphe.
         *
         * Les variables compatibles peuvent partager le même axe Y
         * selon la logique définie dans charts.js.
         */
        displayChartOneVessel(
            result,
            selectedVessels[0],
            selectedVariables,
            variablesMetadata,
            variablesByType
        );

    } else if (
        selectedVariables.length > 1 &&
        selectedVessels.length > 1
    ) {

        /*
         * Plusieurs variables et plusieurs navires :
         * l'utilisateur choisit la manière d'organiser les graphes.
         *
         * Vue "variable" :
         *     un canvas par variable,
         *     avec une courbe par navire.
         *
         * Vue "vessel" :
         *     un canvas par navire,
         *     avec une courbe par variable.
         */
        if (chartViewSelect.value === "variable") {

            selectedVariables.forEach(variable => {
                displayChartOneVariable(
                    result,
                    selectedVessels,
                    variable,
                    variablesMetadata,
                    variablesByType
                );
            });

        } else if (chartViewSelect.value === "vessel") {

            selectedVessels.forEach(vessel => {
                displayChartOneVessel(
                    result,
                    vessel,
                    selectedVariables,
                    variablesMetadata,
                    variablesByType
                );
            });
        }
    }

    // -------------------- Colorimétrie demandée --------------------

    let variablePilot = colorVariableSelect.value;

    /*
     * Les valeurs des inputs sont d'abord conservées sous forme de chaînes.
     *
     * Cela permet de distinguer :
     *
     * ""  -> champ vide
     * "0" -> valeur réellement saisie par l'utilisateur
     */
    let addedReferenceValue = referenceInput.value;
    let addedToleranceValue = toleranceInput.value;

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
});

// -------------------- Sélecteur de colorimétrie --------------------

variableSelect.addEventListener("change", () => {
    let selectedVariables = Array.from(variableSelect.selectedOptions).map(option => option.value);

    /*
     * Vider la liste avant de la reconstruire.
     *
     * Sans cela, chaque événement "change"
     * ajouterait de nouveau les mêmes variables
     * au sélecteur de colorimétrie.
     *
     * Cela permet aussi de supprimer automatiquement
     * les variables qui viennent d'être désélectionnées.
     */
    colorVariableSelect.replaceChildren();

    selectedVariables.forEach(variable => {

        /*
         * Les variables MACS3 représentent des mesures
         * ponctuelles / snapshots.
         *
         * Elles ne sont donc pas proposées comme variables
         * pilotes pour colorer une trajectoire continue.
         */
        if (!variablesByType["MACS3"].includes(variable)) {
            let option = document.createElement("option");
            option.value = variable;
            option.textContent = variable;
            colorVariableSelect.appendChild(option);
        }
    });
});


// --------------------------- Replay ----------------------------

/*
 * Timeline utilisée par le replay.
 *
 * Elle est reconstruite lorsqu'un nouveau replay est demandé
 * à partir de la période sélectionnée lors du dernier Find.
 *
 * La timeline progresse par pas réguliers de 15 minutes,
 * indépendamment des timestamps réellement présents dans les données.
 * replay.js recherche ensuite l'état disponible de chaque navire
 * pour chacun de ces instants.
 */
let replayTimeline;

replayButton.addEventListener("click", () => {

    /*
     * Un nouveau replay doit toujours repartir du premier instant
     * de la timeline, même si le replay précédent avait déjà avancé.
     */
    i = 0;

    // Construire la timeline correspondant à toute la période sélectionnée.
    replayTimeline = createReplayTimeline(
        selectedStartDate,
        selectedEndDate
    );
});