// -------------------- Éléments HTML --------------------

let findButton = document.getElementById("find");

let vesselOptions = document.getElementById("vessel-options");
let vesselDropdown = document.getElementById("vessels-dropdown");

let startDateInput = document.getElementById("start-date");
let endDateInput = document.getElementById("end-date");

let variableOptions = document.getElementById("variable-options");
let variablesDropdown = document.getElementById("variables-dropdown");

let colorVariableSelect = document.getElementById("color-variable");
let referenceInput = document.getElementById("reference-value");
let toleranceInput = document.getElementById("tolerance-value");

let chartViewSelect = document.getElementById("chart-view");

let replayButton = document.getElementById("replay");
let exitReplayButton = document.getElementById("replay-exit")


// -------------------- Chargement des sélecteurs --------------------

// Alimenter le sélecteur de navires avec les données réelles.
async function loadVessels() {
    let vesselsResponse = await fetch("/api/vessels/");
    let vesselsResult = await vesselsResponse.json();

    vesselsResult.vessels.forEach(vessel => {
        let vesselOption = document.createElement("div");

        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = vessel;
        checkbox.id = `vessel-${vessel}`;

        let label = document.createElement("label");
        label.textContent = vessel;
        label.htmlFor = checkbox.id;

        vesselOption.appendChild(checkbox);
        vesselOption.appendChild(label);

        vesselOptions.appendChild(vesselOption);
    });
}


// Index des variables par dataset pour retrouver leur provenance.


let variablesByType = {};


// Métadonnées des variables : source, unité et regroupement des axes Y.


let variablesMetadata = {};


// Alimenter le sélecteur de variables avec les données réelles.
async function loadVariables() {
    let variablesResponse = await fetch("/api/variables/");
    let variablesResult = await variablesResponse.json();

    variablesMetadata = variablesResult["variables"];

    let datasetTypes = Object.keys(variablesResult["variables"]);

    datasetTypes.forEach(type => {
        variablesByType[type] = Object.keys(
            variablesResult["variables"][type]
        );

        // Créer un groupe pour chaque dataset : GPS, MOTIONS, MACS3...
        let variableType = document.createElement("div");

        let typeLabel = document.createElement("div");
        typeLabel.textContent = type;

        variableType.appendChild(typeLabel);

        variablesByType[type].forEach(variable => {
            if (
                variable !== "Timestamp" &&
                variable !== "Latitude" &&
                variable !== "Longitude"
            ) {
                let variableOption = document.createElement("div");

                let checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = variable;
                checkbox.id = `variable-${variable}`;

                let label = document.createElement("label");
                label.textContent = variable;
                label.htmlFor = checkbox.id;

                variableOption.appendChild(checkbox);
                variableOption.appendChild(label);

                variableType.appendChild(variableOption);
            }
        });

        variableOptions.appendChild(variableType);
    });
}


document.addEventListener("DOMContentLoaded", () => {
    loadVessels();
    loadVariables();
});


// -------------------- Recherche --------------------

// Le résultat et les choix de Find restent accessibles au Replay.
let result;
let selectedVessels;
let selectedStartDate;
let selectedEndDate;
let selectedVariables;


findButton.addEventListener("click", async () => {

    // Effacer les résultats précédents avant une nouvelle recherche.

    clearMap();


    // -------------------- Entrées utilisateur --------------------

    selectedVessels = Array.from(
        vesselOptions.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ).map(checkbox => checkbox.value);

    selectedStartDate = startDateInput.value;
    selectedEndDate = endDateInput.value;

    selectedVariables = Array.from(
        variableOptions.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ).map(checkbox => checkbox.value);


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
        showError(result.error);
        return;
    }

    showWarnings(result.warnings);


    // -------------------- Affichage des graphes --------------------

    // Nettoyer les canvas une seule fois avant de générer tous les graphes.
    chartDiv.replaceChildren();

    // créer la timeline pour l'axe x:
    xAxisTimeline = createTimeline(selectedStartDate, selectedEndDate)


    if (selectedVariables.length === 1) {
        // Une variable : une courbe par navire.
        displayChartOneVariable(
            xAxisTimeline,
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
        // Un navire : plusieurs variables, avec axes Y regroupés si compatibles.
        displayChartOneVessel(
            xAxisTimeline,
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
        // Plusieurs navires et variables : organiser les graphes par variable ou navire.
        if (chartViewSelect.value === "variable") {

            selectedVariables.forEach(variable => {
                displayChartOneVariable(
                    xAxisTimeline,
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
                    xAxisTimeline,
                    result,
                    vessel,
                    selectedVariables,
                    variablesMetadata,
                    variablesByType
                );
            });
        }
    }


    // -------------------- Paramètres de colorimétrie --------------------

    let variablePilot = colorVariableSelect.value;

    // Garder les chaînes pour distinguer une saisie de 0 d’un champ vide.
    let addedReferenceValue = referenceInput.value;
    let addedToleranceValue = toleranceInput.value;


    // -------------------- Affichage de la carte --------------------

    displayMap(
        result,
        selectedVessels,
        variablePilot,
        addedReferenceValue,
        addedToleranceValue,
        variablesByType
    );
});


// -------------------- Sélecteur de colorimétrie --------------------

variableOptions.addEventListener("change", () => {
    selectedVariables = Array.from(
        variableOptions.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ).map(checkbox => checkbox.value);

    // Reconstruire les options pour retirer aussi les variables désélectionnées.

    colorVariableSelect.options.length = 1;


    selectedVariables.forEach(variable => {

        // MACS3 fournit des snapshots, pas une mesure pilote continue.
        if (!variablesByType["MACS3"].includes(variable)) {
            let option = document.createElement("option");

            option.value = variable;
            option.textContent = variable;

            colorVariableSelect.appendChild(option);
        }
    });
});


// -------------------- Fermeture des menus déroulants --------------------

// Fermer seulement les menus sur lesquels le clic est extérieur.
document.addEventListener("click", event => {

    if (!vesselDropdown.contains(event.target)) {
        vesselDropdown.open = false;
    }

    if (!variablesDropdown.contains(event.target)) {
        variablesDropdown.open = false;
    }
});


// -------------------- Replay --------------------

// Replay : pas de 15 min sur la période choisie, indépendamment des mesures présentes.
let replayTimeline;


replayButton.addEventListener("click", () => {

    // Repartir du premier instant à chaque nouveau Replay.
    i = 0;

    // Nouvelle timeline sur la période sélectionnée.

    replayTimeline = createTimeline(
        selectedStartDate,
        selectedEndDate
    );
    document.body.classList.add("replay-mode");
    buildReplayTableHeader(selectedVariables, variablesByType);



});

exitReplayButton.addEventListener("click",() => {

    // revenir à l'état normale de la carte et de l'interface
    clearInterval(replayInterval);
    replayInterval = null;

    replayCurentTime.textContent = initialReplayTimeText;
    replayTableBody.replaceChildren();
    replayTableHeader.replaceChildren();

    // Restaurer la vitesse initiale du Replay.
    replaySpeedIndex = initialReplaySpeedIndex;
    replayDelay = initialReplayDelay
    speedValue.textContent = initialSpeedText;

    let variablePilot = colorVariableSelect.value;
    let addedReferenceValue = referenceInput.value;
    let addedToleranceValue = toleranceInput.value;
    clearMap();

    displayMap(
        result,
        selectedVessels,
        variablePilot,
        addedReferenceValue,
        addedToleranceValue,
        variablesByType
    );

    document.body.classList.remove("replay-mode")
})

