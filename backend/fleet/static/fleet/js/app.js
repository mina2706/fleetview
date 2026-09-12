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
// auquel appartient la variable choisie pour la colorimétrie.
let variablesByType = {};


// Alimenter le sélecteur de variables avec les données réelles
async function loadVariables() {

    let variablesResponse = await fetch("/api/variables/");
    let variablesResult = await variablesResponse.json();

    let datasetTypes = Object.keys(
        variablesResult["variables"]
    );

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


    // -------------------- Entrées utilisateur --------------------

    let selectedVessels = Array.from(
        vesselSelect.selectedOptions
    ).map(option => option.value);


    let selectedStartDate = startDateInput.value;
    let selectedEndDate = endDateInput.value;


    let selectedVariables = Array.from(
        variableSelect.selectedOptions
    ).map(option => option.value);


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


    let requestURL =
        "/api/data/?" + params.toString();


    let response = await fetch(requestURL);
    let result = await response.json();


    // -------------------- Gestion des erreurs --------------------

    if (response.ok === false) {

        messagesDiv.textContent = result.error;
        return;
    }


    messagesDiv.textContent =
        JSON.stringify(result.warnings);


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


    let colorimetryRequested =
        variablePilot &&
        addedReferenceValue !== "" &&
        addedToleranceValue !== "";


    let pilotDataset;


    if (colorimetryRequested) {

        // Les champs ont été remplis :
        // convertir maintenant les valeurs en nombres.
        addedReferenceValue =
            Number(addedReferenceValue);

        addedToleranceValue =
            Number(addedToleranceValue);


        // Trouver le dataset contenant la variable pilote.
        Object.keys(variablesByType).forEach(type => {

            if (
                variablesByType[type].includes(variablePilot)
            ) {
                pilotDataset = type;
            }
        });
    }


    // -------------------- Affichage des navires --------------------

    let allPositions = [];


    selectedVessels.forEach(vessel => {

        let gpsRows =
            result["response"][vessel]["GPS"];


        let gpsPositions = gpsRows.map(row => [
            row.Latitude,
            row.Longitude
        ]);


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

            let pilotRows =
                result["response"][vessel][pilotDataset];


            // Vérifier que le dataset et la variable pilote
            // sont réellement disponibles pour ce navire.
            if (
                pilotRows &&
                pilotRows.length > 0 &&
                variablePilot in pilotRows[0]
            ) {

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

                    let pilotRow = pilotRows.find(
                        pilotRow =>
                            pilotRow.Timestamp === gpsRow.Timestamp
                    );


                    if (pilotRow !== undefined) {

                        pilotValues.push(
                            pilotRow[variablePilot]
                        );

                    } else {

                        pilotValues.push(null);
                    }
                });


                // Déterminer le statut de chaque valeur pilote.
                pilotValues.forEach(pilotValue => {

                    let status = null;


                    if (pilotValue !== null) {

                        if (
                            pilotValue >=
                                addedReferenceValue -
                                addedToleranceValue
                            &&
                            pilotValue <=
                                addedReferenceValue +
                                addedToleranceValue
                        ) {

                            status = "Normal";

                        } else if (
                            pilotValue >
                            addedReferenceValue +
                            addedToleranceValue
                        ) {

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
        for (
            let i = 0;
            i < gpsPositions.length - 1;
            i++
        ) {

            /*
             * Faire une copie des deux positions.
             *
             * On ne modifie pas directement gpsPositions :
             * les coordonnées originales doivent rester intactes
             * pour les segments suivants, le cadrage de la carte
             * et le marqueur final.
             */
            let startPosition = [
                gpsPositions[i][0],
                gpsPositions[i][1]
            ];


            let endPosition = [
                gpsPositions[i + 1][0],
                gpsPositions[i + 1][1]
            ];


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
            let delta =
                endPosition[1] - startPosition[1];


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


            let segment = [
                startPosition,
                endPosition
            ];


            /*
             * La trajectoire normale est toujours tracée.
             *
             * Si aucune colorimétrie n'est disponible pour ce segment,
             * cette ligne restera simplement visible telle quelle.
             */
            L.polyline(segment)
                .addTo(resultLayers);


            // -------------------- Surcouche colorimétrique --------------------

            /*
             * La couleur du segment dépend du statut
             * mesuré au début du segment : statuses[i].
             *
             * Si statuses[i] vaut null ou n'existe pas,
             * aucune couleur n'est ajoutée par-dessus.
             */
            if (
                statuses[i] !== undefined &&
                statuses[i] !== null
            ) {

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


        // -------------------- Fin du tracé du navire --------------------

        // Conserver les coordonnées GPS originales
        // afin d'adapter ensuite le cadrage de la carte.
        allPositions.push(gpsPositions);


        // Ajouter un marqueur sur la dernière position connue.
        let lastPosition =
            gpsPositions[gpsPositions.length - 1];

        L.marker(lastPosition).addTo(resultLayers);
    });


    // -------------------- Cadrage de la carte --------------------

    map.fitBounds(allPositions, {
        maxZoom: 10
    });
});


// -------------------- Sélecteur de colorimétrie --------------------

variableSelect.addEventListener("change", () => {

    let selectedVariables = Array.from(
        variableSelect.selectedOptions
    ).map(option => option.value);


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
        if (
            !variablesByType["MACS3"].includes(variable)
        ) {

            let option =
                document.createElement("option");

            option.value = variable;
            option.textContent = variable;

            colorVariableSelect.appendChild(option);
        }
    });
});